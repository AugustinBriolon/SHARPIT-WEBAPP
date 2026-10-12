/**
 * Collect swim / bike / transition / brick-run samples from Cap client data
 * for triathlon finish-time projection.
 */

import {
  isMultisportLegArray,
  legDisplayDurationSec,
  type MultisportLeg,
} from '@sharpit/app/lib/activity/multisport';
import type {
  BikeSpeedSample,
  BrickTransitionSample,
  RaceTransitionSample,
  SwimPaceSample,
} from '@sharpit/app/lib/training/periodization/triathlon-performance-predictor';

type ActivityLike = {
  id: string;
  type: string;
  date: Date | string;
  duration: number | null;
  runMetrics?: { distanceM: number | null } | null;
  bikeMetrics?: { avgPower?: number | null } | null;
  swimMetrics?: { distanceM: number | null; avgPaceSecPer100m?: number | null } | null;
  multisportLegs?: unknown;
};

type SessionLike = {
  id: string;
  type: string;
  brickGroupId: string | null;
  brickOrder: number | null;
  activityId: string | null;
  completed?: boolean | null;
};

function activityStartMs(activity: Pick<ActivityLike, 'date'>): number {
  return new Date(activity.date).getTime();
}

function isPositiveMetric(value: number | null | undefined): value is number {
  return typeof value === 'number' && value > 0;
}

function positiveSwimMetrics(
  metrics: ActivityLike['swimMetrics'],
): { distanceM: number; paceSecPer100m: number } | null {
  const distanceM = metrics?.distanceM;
  const paceSecPer100m = metrics?.avgPaceSecPer100m;
  if (!isPositiveMetric(distanceM) || !isPositiveMetric(paceSecPer100m)) {
    return null;
  }
  return { distanceM, paceSecPer100m };
}

function swimSampleFromActivity(activity: ActivityLike): SwimPaceSample | null {
  if (activity.type !== 'SWIM') {
    return null;
  }
  return positiveSwimMetrics(activity.swimMetrics);
}

export function collectSwimPaceSamples(activities: readonly ActivityLike[]): SwimPaceSample[] {
  const samples: SwimPaceSample[] = [];
  for (const activity of activities) {
    const sample = swimSampleFromActivity(activity);
    if (sample) {
      samples.push(sample);
    }
  }
  return samples;
}

function bikeSampleFromLeg(leg: MultisportLeg): BikeSpeedSample | null {
  if (leg.kind !== 'bike') {
    return null;
  }
  const durationSec = legDisplayDurationSec(leg);
  if (durationSec <= 0) {
    return null;
  }
  if (leg.distanceM && leg.distanceM > 0) {
    return { distanceM: leg.distanceM, durationSec };
  }
  if (leg.avgSpeedMs && leg.avgSpeedMs > 0) {
    return { distanceM: leg.avgSpeedMs * durationSec, durationSec };
  }
  return null;
}

function bikeSamplesFromActivity(activity: ActivityLike): BikeSpeedSample[] {
  if (activity.type !== 'TRIATHLON' || !isMultisportLegArray(activity.multisportLegs)) {
    return [];
  }
  const samples: BikeSpeedSample[] = [];
  for (const leg of activity.multisportLegs) {
    const sample = bikeSampleFromLeg(leg);
    if (sample) {
      samples.push(sample);
    }
  }
  return samples;
}

export function collectBikeSpeedSamples(activities: readonly ActivityLike[]): BikeSpeedSample[] {
  const samples: BikeSpeedSample[] = [];
  for (const activity of activities) {
    samples.push(...bikeSamplesFromActivity(activity));
  }
  return samples;
}

function transitionSec(legs: MultisportLeg[], index: 1 | 2): number | null {
  const leg = legs.find((entry) => entry.kind === 'transition' && entry.transitionIndex === index);
  if (!leg) {
    return null;
  }
  const sec = legDisplayDurationSec(leg);
  return sec > 0 ? sec : null;
}

export function collectRaceTransitions(
  activities: readonly ActivityLike[],
): RaceTransitionSample[] {
  const samples: RaceTransitionSample[] = [];
  for (const activity of activities) {
    if (activity.type !== 'TRIATHLON' || !isMultisportLegArray(activity.multisportLegs)) {
      continue;
    }
    samples.push({
      t1Sec: transitionSec(activity.multisportLegs, 1),
      t2Sec: transitionSec(activity.multisportLegs, 2),
    });
  }
  return samples;
}

function brickKind(from: string, to: string): 't1' | 't2' | null {
  if (from === 'SWIM' && to === 'BIKE') {
    return 't1';
  }
  if (from === 'BIKE' && to === 'RUN') {
    return 't2';
  }
  return null;
}

function groupBrickSessions(sessions: readonly SessionLike[]): Map<string, SessionLike[]> {
  const groups = new Map<string, SessionLike[]>();
  for (const session of sessions) {
    if (!session.brickGroupId || !session.activityId) {
      continue;
    }
    const list = groups.get(session.brickGroupId) ?? [];
    list.push(session);
    groups.set(session.brickGroupId, list);
  }
  return groups;
}

function orderedBrickLegs(legs: SessionLike[]): SessionLike[] {
  return [...legs].sort((a, b) => (a.brickOrder ?? 0) - (b.brickOrder ?? 0));
}

export function brickGapSec(
  prev: Pick<ActivityLike, 'date' | 'duration'>,
  curr: Pick<ActivityLike, 'date'>,
): number {
  return Math.round(
    (activityStartMs(curr) - (activityStartMs(prev) + (prev.duration ?? 0) * 1000)) / 1000,
  );
}

export function isValidBrickGap(gapSec: number): boolean {
  return gapSec >= 30 && gapSec <= 20 * 60;
}

function brickGapSample(
  prevSession: SessionLike,
  currSession: SessionLike,
  byId: Map<string, ActivityLike>,
): BrickTransitionSample | null {
  const kind = brickKind(prevSession.type, currSession.type);
  if (!kind || !prevSession.activityId || !currSession.activityId) {
    return null;
  }
  const prev = byId.get(prevSession.activityId);
  const curr = byId.get(currSession.activityId);
  if (!prev?.duration || !curr) {
    return null;
  }
  const gapSec = brickGapSec(prev, curr);
  return isValidBrickGap(gapSec) ? { kind, gapSec } : null;
}

/**
 * Gaps between consecutive realized brick legs (same brickGroupId), capped like
 * coach brick analysis — proxies for T1 / T2 rehearsal.
 */
export function collectBrickTransitions(
  sessions: readonly SessionLike[],
  activities: readonly ActivityLike[],
): BrickTransitionSample[] {
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const samples: BrickTransitionSample[] = [];

  for (const legs of groupBrickSessions(sessions).values()) {
    const ordered = orderedBrickLegs(legs);
    for (let i = 1; i < ordered.length; i++) {
      const sample = brickGapSample(ordered[i - 1], ordered[i], byId);
      if (sample) {
        samples.push(sample);
      }
    }
  }
  return samples;
}

function hasBikeThenRun(ordered: readonly SessionLike[]): boolean {
  return ordered.some(
    (leg, index) =>
      leg.type === 'BIKE' && ordered.slice(index + 1).some((next) => next.type === 'RUN'),
  );
}

function isBrickRunDistance(distanceM: number | null | undefined): distanceM is number {
  return typeof distanceM === 'number' && distanceM >= 3000;
}

function runPaceFromActivity(run: ActivityLike | undefined): number | null {
  if (!run) {
    return null;
  }
  const distanceM = run.runMetrics?.distanceM;
  const durationSec = run.duration;
  if (!isBrickRunDistance(distanceM) || !isPositiveMetric(durationSec)) {
    return null;
  }
  return durationSec / (distanceM / 1000);
}

function brickRunFactorFromPace(pace: number, freshPaceSecPerKm: number): number | null {
  const factor = pace / freshPaceSecPerKm;
  if (factor < 1 || factor > 1.3) {
    return null;
  }
  return factor;
}

function brickRunFactorFromLeg(
  leg: SessionLike,
  byId: Map<string, ActivityLike>,
  freshPaceSecPerKm: number,
): number | null {
  if (leg.type !== 'RUN' || !leg.activityId) {
    return null;
  }
  const pace = runPaceFromActivity(byId.get(leg.activityId));
  return pace === null ? null : brickRunFactorFromPace(pace, freshPaceSecPerKm);
}

/**
 * Measured T-run slowdown: brick run pace / fresh pace at similar distance.
 * Returns ratios ≥ 1 when the brick run is slower.
 */
export function collectBrickRunFactors(
  sessions: readonly SessionLike[],
  activities: readonly ActivityLike[],
  freshPaceSecPerKm: number | null,
): number[] {
  if (!freshPaceSecPerKm || freshPaceSecPerKm <= 0) {
    return [];
  }

  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const factors: number[] = [];

  for (const legs of groupBrickSessions(sessions).values()) {
    const ordered = orderedBrickLegs(legs);
    if (!hasBikeThenRun(ordered)) {
      continue;
    }
    for (const leg of ordered) {
      const factor = brickRunFactorFromLeg(leg, byId, freshPaceSecPerKm);
      if (factor !== null) {
        factors.push(factor);
      }
    }
  }
  return factors;
}
