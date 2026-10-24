import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import { ActivityType, Prisma } from '@prisma/client';
import { mergedSource, sourceIncludes } from '@sharpit/server/lib/activity/list/activity-dedup';

export interface GarminActivityEvaluation {
  rpe: number | null;
  feeling: string | null;
  notes: string | null;
}

export function garminSessionDurationSec(activity: IActivity, type: ActivityType): number | null {
  if (type === ActivityType.STRENGTH) {
    return garminDurationSec(activity.elapsedDuration, activity.duration, activity.movingDuration);
  }
  return garminDurationSec(activity.movingDuration, activity.duration, activity.elapsedDuration);
}

/**
 * Durées à tenter pour la dédup (moving + elapsed). Apple Santé envoie souvent
 * la durée totale alors que SharpIt stocke le temps en mouvement Garmin.
 */
export function garminDedupDurations(
  activity: IActivity,
  type: ActivityType,
): { duration: number | null; altDurations: number[] } {
  const duration = garminSessionDurationSec(activity, type);
  const alts = [
    garminDurationSec(activity.movingDuration),
    garminDurationSec(activity.duration),
    garminDurationSec(activity.elapsedDuration),
  ].filter((value): value is number => value !== null && value !== duration);
  return { duration, altDurations: [...new Set(alts)] };
}

/** Durée Garmin : secondes ou millisecondes selon le champ / endpoint. */
export function garminDurationSec(...values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (v === undefined || v === null || !Number.isFinite(v) || v <= 0) {
      continue;
    }
    const sec = v > 1_000_000 ? Math.round(v / 1000) : Math.round(v);
    if (sec > 0) {
      return sec;
    }
  }
  return null;
}

const GARMIN_TYPE_RULES: Array<{ matches: (key: string) => boolean; type: ActivityType }> = [
  {
    matches: (k) =>
      k === 'triathlon' ||
      k === 'duathlon' ||
      k === 'multisport' ||
      k === 'multi_sport' ||
      k.includes('triathlon') ||
      k.includes('duathlon') ||
      k.includes('multisport') ||
      k.includes('multi_sport'),
    type: ActivityType.TRIATHLON,
  },
  {
    matches: (k) =>
      k.includes('run') ||
      k === 'trail_running' ||
      k === 'treadmill_running' ||
      k === 'street_running' ||
      k === 'track_running' ||
      k === 'virtual_run',
    type: ActivityType.RUN,
  },
  {
    matches: (k) =>
      k === 'hiking' ||
      k === 'walking' ||
      k === 'mountaineering' ||
      k === 'hike' ||
      (k.includes('hike') && !k.includes('run')) ||
      k.includes('mountaineering'),
    type: ActivityType.HIKE,
  },
  {
    matches: (k) =>
      k.includes('cycl') ||
      k.includes('bike') ||
      k.includes('ride') ||
      k === 'cycling' ||
      k === 'virtual_ride' ||
      k === 'indoor_cycling' ||
      k === 'mountain_biking' ||
      k === 'gravel_cycling',
    type: ActivityType.BIKE,
  },
  {
    matches: (k) => k.includes('swim') || k === 'lap_swimming' || k === 'open_water_swimming',
    type: ActivityType.SWIM,
  },
  {
    matches: (k) =>
      k.includes('strength') ||
      k.includes('hiit') ||
      k.includes('cardio') ||
      k.includes('fitness') ||
      k === 'indoor_cardio' ||
      k === 'yoga' ||
      k === 'pilates',
    type: ActivityType.STRENGTH,
  },
];

export function mapGarminType(typeKey: string): ActivityType | null {
  const key = typeKey.toLowerCase();
  return GARMIN_TYPE_RULES.find(({ matches }) => matches(key))?.type ?? ActivityType.OTHER;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Garmin's Training Stress Score, and only that.
 *
 * Garmin reports two numbers that used to be coalesced into `Activity.load`:
 *
 * - `trainingStressScore` — Coggan TSS, where 100 is one hour at threshold.
 * - `activityTrainingLoad` — derived from EPOC, on an unrelated scale. Measured on
 *   this database it ran about three times the TSS scale: cycling with a power
 *   meter (real TSS) sat at 49 per hour while runs and swims, which only ever get
 *   the EPOC number, sat at 151 and 161 with a maximum of 772.
 *
 * Storing both in one column made cross-sport load comparison meaningless and
 * silently inflated CTL for whichever sports lacked a power meter. Only the TSS
 * is kept; the EPOC value has no consumer, and the Core computes its own load
 * from raw power and heart rate.
 *
 * @see docs/adr/ADR-002-cross-sport-tss.md
 */
export function garminTrainingStressScore(activity: IActivity): number | null {
  return num(activity.trainingStressScore as number);
}

function garminPaceSecPerKm(activity: IActivity): number | null {
  return activity.averageSpeed && activity.averageSpeed > 0 ? 1000 / activity.averageSpeed : null;
}

function garminElevationLossM(activity: IActivity): number | null {
  const loss = (activity as { elevationLoss?: number }).elevationLoss;
  return typeof loss === 'number' && loss > 0 ? loss : null;
}

type GarminSportMetricsInput = {
  base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>;
  activity: IActivity;
  type: ActivityType;
  load: number | null;
};

function attachGarminRunMetrics(base: GarminSportMetricsInput['base'], activity: IActivity): void {
  base.runMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
      paceSecPerKm: garminPaceSecPerKm(activity),
      avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
      avgPower: num(activity.avgPower as number),
      cadence: activity.averageRunningCadenceInStepsPerMinute
        ? Math.round(activity.averageRunningCadenceInStepsPerMinute)
        : null,
    },
  };
}

function attachGarminHikeMetrics(base: GarminSportMetricsInput['base'], activity: IActivity): void {
  base.hikeMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
      elevationLossM: garminElevationLossM(activity),
      avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
      calories: activity.calories > 0 ? Math.round(activity.calories) : null,
      avgSpeedMps:
        activity.averageSpeed && activity.averageSpeed > 0 ? activity.averageSpeed : null,
    },
  };
}

function attachGarminBikeMetrics(
  base: GarminSportMetricsInput['base'],
  activity: IActivity,
  load: number | null,
): void {
  base.bikeMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      normalizedPower: num(activity.normPower as number),
      avgPower: num(activity.avgPower as number),
      avgCadence: num(activity.averageBikingCadenceInRevPerMinute as number)
        ? Math.round(num(activity.averageBikingCadenceInRevPerMinute as number)!)
        : null,
      elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
      calories: activity.calories > 0 ? Math.round(activity.calories) : null,
      tss: load,
    },
  };
}

function attachGarminSwimMetrics(base: GarminSportMetricsInput['base'], activity: IActivity): void {
  base.swimMetrics = {
    create: {
      distanceM: activity.distance > 0 ? activity.distance : null,
      avgPaceSecPer100m:
        activity.averageSpeed && activity.averageSpeed > 0 ? 100 / activity.averageSpeed : null,
    },
  };
}

const GARMIN_SPORT_METRIC_ATTACHERS: Partial<
  Record<ActivityType, (input: GarminSportMetricsInput) => void>
> = {
  [ActivityType.RUN]: ({ base, activity }) => attachGarminRunMetrics(base, activity),
  [ActivityType.HIKE]: ({ base, activity }) => attachGarminHikeMetrics(base, activity),
  [ActivityType.BIKE]: ({ base, activity, load }) => attachGarminBikeMetrics(base, activity, load),
  [ActivityType.SWIM]: ({ base, activity }) => attachGarminSwimMetrics(base, activity),
};

function attachGarminSportMetrics(input: GarminSportMetricsInput): void {
  GARMIN_SPORT_METRIC_ATTACHERS[input.type]?.(input);
}

type GarminEnrichmentInput = {
  data: Prisma.ActivityUpdateInput;
  activity: IActivity;
  load: number | null;
};

function attachGarminEnrichmentRunMetrics(input: GarminEnrichmentInput): void {
  const { data, activity } = input;
  data.runMetrics = {
    upsert: {
      create: {
        distanceM: activity.distance > 0 ? activity.distance : null,
        elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
        paceSecPerKm: garminPaceSecPerKm(activity),
        avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
      },
      update: {
        avgHr: activity.averageHR ? Math.round(activity.averageHR) : undefined,
      },
    },
  };
}

function garminHikeEnrichmentCreate(activity: IActivity) {
  return {
    distanceM: activity.distance > 0 ? activity.distance : null,
    elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
    elevationLossM: garminElevationLossM(activity),
    avgHr: activity.averageHR ? Math.round(activity.averageHR) : null,
    calories: activity.calories > 0 ? Math.round(activity.calories) : null,
    avgSpeedMps: activity.averageSpeed && activity.averageSpeed > 0 ? activity.averageSpeed : null,
  };
}

function garminHikeEnrichmentUpdate(activity: IActivity) {
  return {
    distanceM: activity.distance > 0 ? activity.distance : undefined,
    elevationM: activity.elevationGain > 0 ? activity.elevationGain : undefined,
    avgHr: activity.averageHR ? Math.round(activity.averageHR) : undefined,
  };
}

function attachGarminEnrichmentHikeMetrics(input: GarminEnrichmentInput): void {
  const { data, activity } = input;
  data.hikeMetrics = {
    upsert: {
      create: garminHikeEnrichmentCreate(activity),
      update: garminHikeEnrichmentUpdate(activity),
    },
  };
}

function attachGarminEnrichmentBikeMetrics(input: GarminEnrichmentInput): void {
  const { data, activity, load } = input;
  data.bikeMetrics = {
    upsert: {
      create: {
        distanceM: activity.distance > 0 ? activity.distance : null,
        avgPower: num(activity.avgPower as number),
        normalizedPower: num(activity.normPower as number),
        elevationM: activity.elevationGain > 0 ? activity.elevationGain : null,
        tss: load,
      },
      update: {
        distanceM: activity.distance > 0 ? activity.distance : undefined,
        tss: load ?? undefined,
      },
    },
  };
}

function attachGarminEnrichmentSwimMetrics(input: GarminEnrichmentInput): void {
  const { data, activity } = input;
  data.swimMetrics = {
    upsert: {
      create: {
        distanceM: activity.distance > 0 ? activity.distance : null,
        avgPaceSecPer100m:
          activity.averageSpeed && activity.averageSpeed > 0 ? 100 / activity.averageSpeed : null,
      },
      update: {
        distanceM: activity.distance > 0 ? activity.distance : undefined,
        avgPaceSecPer100m:
          activity.averageSpeed && activity.averageSpeed > 0
            ? 100 / activity.averageSpeed
            : undefined,
      },
    },
  };
}

const GARMIN_ENRICHMENT_ATTACHERS: Partial<
  Record<ActivityType, (input: GarminEnrichmentInput) => void>
> = {
  [ActivityType.RUN]: attachGarminEnrichmentRunMetrics,
  [ActivityType.HIKE]: attachGarminEnrichmentHikeMetrics,
  [ActivityType.BIKE]: attachGarminEnrichmentBikeMetrics,
  [ActivityType.SWIM]: attachGarminEnrichmentSwimMetrics,
};

function attachGarminEnrichmentMetrics(
  data: Prisma.ActivityUpdateInput,
  activity: IActivity,
  type: ActivityType,
  load: number | null,
): void {
  GARMIN_ENRICHMENT_ATTACHERS[type]?.({ data, activity, load });
}

export function buildGarminActivityData(
  activity: IActivity,
  evaluation: GarminActivityEvaluation,
  type: ActivityType,
): Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> {
  const duration = garminSessionDurationSec(activity, type);
  const load = garminTrainingStressScore(activity);

  const base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> = {
    type,
    date: new Date(activity.startTimeLocal),
    title: activity.activityName || null,
    duration,
    load,
    rpe: evaluation.rpe,
    feeling: evaluation.feeling,
    notes: evaluation.notes,
    source: 'garmin',
    garminId: String(activity.activityId),
  };

  attachGarminSportMetrics({ base, activity, type, load });
  return base;
}

/** Enrichit une activité existante (souvent importée Strava / Apple Santé) avec les données Garmin. */
export function garminEnrichmentUpdate(
  activity: IActivity,
  evaluation: GarminActivityEvaluation,
  type: ActivityType,
  existingStravaId: string | null,
  existingSource = '',
): Prisma.ActivityUpdateInput {
  const duration = garminSessionDurationSec(activity, type);
  const load = garminTrainingStressScore(activity);

  const data: Prisma.ActivityUpdateInput = {
    garminId: String(activity.activityId),
    source: mergedSource(
      true,
      Boolean(existingStravaId),
      sourceIncludes(existingSource, 'apple-health'),
      sourceIncludes(existingSource, 'sharpit-ios'),
    ),
    title: activity.activityName || undefined,
    duration: duration ?? undefined,
    load: load ?? undefined,
    rpe: evaluation.rpe ?? undefined,
    feeling: evaluation.feeling ?? undefined,
    notes: evaluation.notes ?? undefined,
  };

  attachGarminEnrichmentMetrics(data, activity, type, load);
  return data;
}
