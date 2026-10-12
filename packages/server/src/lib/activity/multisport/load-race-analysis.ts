import { ActivityType } from '@prisma/client';
import type { MultisportLeg, MultisportLegKind } from '@sharpit/app/lib/activity/multisport';
import type { RaceAnalysis } from '@sharpit/app/lib/activity/race-analysis-types';
import { getAthleteProfile, getMultisportLegsForActivity } from '@sharpit/server/lib/queries';
import {
  buildMultisportLegStreams,
  getActivityStreams,
  getCachedActivityStreams,
} from '@sharpit/server/lib/streams/streams';
import {
  buildRaceAnalysis,
  type RaceLegInput,
} from '@sharpit/server/lib/activity/multisport/race-analysis';

type RaceActivity = {
  id: string;
  type: ActivityType;
  duration: number | null;
  load: number | null;
  garminId: string | null;
  goalId: string | null;
  multisportLegs: unknown;
  goal: { targetPerformance: string | null } | null;
  runMetrics: { distanceM: number | null; avgHr: number | null } | null;
  bikeMetrics: { distanceM: number | null } | null;
  swimMetrics: { distanceM: number | null } | null;
};

const SINGLE_SPORT_KIND: Partial<Record<ActivityType, MultisportLegKind>> = {
  [ActivityType.SWIM]: 'swim',
  [ActivityType.BIKE]: 'bike',
  [ActivityType.RUN]: 'run',
};

/** A single-sport race is one leg: the activity itself. */
function singleSportLeg(activity: RaceActivity, kind: MultisportLegKind): MultisportLeg {
  const durationSec = activity.duration ?? 0;
  const distanceM =
    activity.runMetrics?.distanceM ??
    activity.bikeMetrics?.distanceM ??
    activity.swimMetrics?.distanceM ??
    null;
  return {
    kind,
    label: kind,
    durationSec,
    movingDurationSec: null,
    distanceM,
    avgHr: activity.runMetrics?.avgHr ?? null,
    avgSpeedMs: distanceM && durationSec > 0 ? distanceM / durationSec : null,
    elevationM: null,
    calories: null,
    garminActivityId: null,
    transitionIndex: null,
    sourceActivityId: null,
  };
}

type LoadMode = { cacheOnly: boolean };

async function triathlonLegInputs(
  athleteId: string,
  activity: RaceActivity,
  mode: LoadMode,
): Promise<RaceLegInput[]> {
  const [legs, profile] = await Promise.all([
    getMultisportLegsForActivity(athleteId, activity),
    getAthleteProfile(athleteId),
  ]);
  const all = legs ?? [];
  const sportLegs = all.filter((leg) => leg.kind !== 'transition');
  const streams = await buildMultisportLegStreams(athleteId, sportLegs, {
    parentId: activity.id,
    profile,
    cacheOnly: mode.cacheOnly,
  });
  return all.map((leg) => ({
    leg,
    stream: streams[sportLegs.indexOf(leg)]?.stream ?? null,
  }));
}

async function legInputs(
  athleteId: string,
  activity: RaceActivity,
  mode: LoadMode,
): Promise<RaceLegInput[]> {
  if (activity.type === ActivityType.TRIATHLON) {
    return triathlonLegInputs(athleteId, activity, mode);
  }
  const kind = SINGLE_SPORT_KIND[activity.type];
  if (!kind) {
    return [];
  }
  return [
    {
      leg: singleSportLeg(activity, kind),
      stream: mode.cacheOnly
        ? await getCachedActivityStreams(athleteId, activity.id)
        : await getActivityStreams(athleteId, activity.id),
    },
  ];
}

/**
 * The race view of an activity: a triathlon, or any activity done for a goal. Null otherwise,
 * and on failure — the detail page renders without it. Streams are fetched from a provider at
 * most once per leg, then read from storage; `cacheOnly` never calls a provider.
 */
export async function loadRaceAnalysis(
  athleteId: string,
  activity: RaceActivity,
  mode: LoadMode = { cacheOnly: false },
): Promise<RaceAnalysis | null> {
  if (activity.type !== ActivityType.TRIATHLON && !activity.goalId) {
    return null;
  }
  try {
    return buildRaceAnalysis({
      durationSec: activity.duration,
      load: activity.load,
      targetPerformance: activity.goal?.targetPerformance ?? null,
      legs: await legInputs(athleteId, activity, mode),
    });
  } catch (error) {
    console.error('[race-analysis]', activity.id, error);
    return null;
  }
}
