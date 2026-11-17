import { ActivityType } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';

export type CompletedSessionMetric = {
  label: string;
  value: string;
  unit: string;
};

/** Slim activity shape available on Today list selects. */
export type CompletedSessionMetricSource = {
  type: ActivityType;
  duration: number | null;
  load: number | null;
  rpe: number | null;
  runMetrics: { distanceM: number | null } | null;
  bikeMetrics: { tss: number | null; avgPower: number | null } | null;
  swimMetrics: { distanceM: number | null } | null;
  hikeMetrics: { distanceM: number | null; elevationM: number | null } | null;
  /** `sets`, `reps` and `weightKg` are absent from selects that only name the exercises. */
  strengthSets: {
    exercise: string;
    sets?: number | null;
    reps?: number | null;
    weightKg?: number | null;
  }[];
};

const MAX_METRICS = 3;

function pushMetric(
  metrics: CompletedSessionMetric[],
  metric: CompletedSessionMetric | null,
): void {
  if (metric && metrics.length < MAX_METRICS) {
    metrics.push(metric);
  }
}

function distanceMetric(meters: number | null | undefined): CompletedSessionMetric | null {
  if (!isSet(meters) || meters <= 0) {
    return null;
  }
  if (meters >= 1000) {
    return { label: 'Distance', value: (meters / 1000).toFixed(2), unit: 'km' };
  }
  return { label: 'Distance', value: String(Math.round(meters)), unit: 'm' };
}

function durationMetric(seconds: number | null | undefined): CompletedSessionMetric | null {
  if (!isSet(seconds) || seconds <= 0) {
    return null;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return {
      label: 'Durée',
      value: `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
      unit: 'h',
    };
  }
  return {
    label: 'Durée',
    value: `${m}:${s.toString().padStart(2, '0')}`,
    unit: 'min',
  };
}

function runPaceMetric(
  durationSec: number | null | undefined,
  distanceM: number | null | undefined,
): CompletedSessionMetric | null {
  if (!isSet(durationSec) || !isSet(distanceM) || durationSec <= 0 || distanceM <= 0) {
    return null;
  }
  const paceSecPerKm = durationSec / (distanceM / 1000);
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return {
    label: 'Allure',
    value: `${m}:${s.toString().padStart(2, '0')}`,
    unit: '/km',
  };
}

function swimPaceMetric(
  durationSec: number | null | undefined,
  distanceM: number | null | undefined,
): CompletedSessionMetric | null {
  if (!isSet(durationSec) || !isSet(distanceM) || durationSec <= 0 || distanceM <= 0) {
    return null;
  }
  const paceSecPer100m = durationSec / (distanceM / 100);
  const m = Math.floor(paceSecPer100m / 60);
  const s = Math.round(paceSecPer100m % 60);
  return {
    label: 'Allure',
    value: `${m}:${s.toString().padStart(2, '0')}`,
    unit: '/100m',
  };
}

function elevationMetric(meters: number | null | undefined): CompletedSessionMetric | null {
  if (!isSet(meters) || meters <= 0) {
    return null;
  }
  return { label: 'D+', value: String(Math.round(meters)), unit: 'm' };
}

function powerMetric(watts: number | null | undefined): CompletedSessionMetric | null {
  if (!isSet(watts) || watts <= 0) {
    return null;
  }
  return { label: 'Puissance', value: String(Math.round(watts)), unit: 'W' };
}

function rpeMetric(rpe: number | null | undefined): CompletedSessionMetric | null {
  if (!isSet(rpe) || rpe <= 0) {
    return null;
  }
  return { label: 'RPE', value: String(rpe), unit: '' };
}

function strengthExerciseMetric(sets: { exercise: string }[]): CompletedSessionMetric | null {
  if (!sets.length) {
    return null;
  }
  const unique = new Set(sets.map((s) => s.exercise.trim()).filter(Boolean));
  const count = unique.size > 0 ? unique.size : sets.length;
  return {
    label: 'Exercices',
    value: String(count),
    unit: count === 1 ? 'exo' : 'exos',
  };
}

/** Kilos lifted: sets × reps × load, over the sets that carry a load. */
function strengthVolumeMetric(
  sets: CompletedSessionMetricSource['strengthSets'],
): CompletedSessionMetric | null {
  const kilos = sets.reduce(
    (total, set) => total + (set.sets ?? 0) * (set.reps ?? 0) * (set.weightKg ?? 0),
    0,
  );
  if (kilos <= 0) {
    return null;
  }
  return { label: 'Volume', value: String(Math.round(kilos)), unit: 'kg' };
}

function buildRunMetrics(activity: CompletedSessionMetricSource): CompletedSessionMetric[] {
  const metrics: CompletedSessionMetric[] = [];
  pushMetric(metrics, distanceMetric(activity.runMetrics?.distanceM));
  pushMetric(metrics, durationMetric(activity.duration));
  pushMetric(metrics, runPaceMetric(activity.duration, activity.runMetrics?.distanceM));
  return metrics;
}

function buildBikeMetrics(activity: CompletedSessionMetricSource): CompletedSessionMetric[] {
  const metrics: CompletedSessionMetric[] = [];
  pushMetric(metrics, durationMetric(activity.duration));
  pushMetric(metrics, powerMetric(activity.bikeMetrics?.avgPower));
  pushMetric(metrics, rpeMetric(activity.rpe));
  return metrics;
}

function buildSwimMetrics(activity: CompletedSessionMetricSource): CompletedSessionMetric[] {
  const metrics: CompletedSessionMetric[] = [];
  // Distance + allure first — duration is secondary for swim coaching reads.
  pushMetric(metrics, distanceMetric(activity.swimMetrics?.distanceM));
  pushMetric(metrics, swimPaceMetric(activity.duration, activity.swimMetrics?.distanceM));
  pushMetric(metrics, durationMetric(activity.duration));
  return metrics;
}

function buildHikeMetrics(activity: CompletedSessionMetricSource): CompletedSessionMetric[] {
  const metrics: CompletedSessionMetric[] = [];
  pushMetric(metrics, distanceMetric(activity.hikeMetrics?.distanceM));
  pushMetric(metrics, durationMetric(activity.duration));
  const pace = runPaceMetric(activity.duration, activity.hikeMetrics?.distanceM);
  pushMetric(metrics, pace);
  pushMetric(metrics, elevationMetric(activity.hikeMetrics?.elevationM));
  return metrics;
}

function buildStrengthMetrics(activity: CompletedSessionMetricSource): CompletedSessionMetric[] {
  const metrics: CompletedSessionMetric[] = [];
  // What was done before how it felt: the kilos lifted and the exercises, then the RPE if a
  // place is left (a session with no load keeps it).
  pushMetric(metrics, durationMetric(activity.duration));
  pushMetric(metrics, strengthVolumeMetric(activity.strengthSets));
  pushMetric(metrics, strengthExerciseMetric(activity.strengthSets));
  pushMetric(metrics, rpeMetric(activity.rpe));
  return metrics;
}

function buildGenericMetrics(activity: CompletedSessionMetricSource): CompletedSessionMetric[] {
  const metrics: CompletedSessionMetric[] = [];
  pushMetric(metrics, durationMetric(activity.duration));
  pushMetric(metrics, rpeMetric(activity.rpe));
  return metrics;
}

/**
 * Up to three key reading metrics for a completed Today session preview.
 * Value and unit are split for the instrument KPI layout.
 */
export function buildCompletedSessionMetrics(
  activity: CompletedSessionMetricSource,
): CompletedSessionMetric[] {
  switch (activity.type) {
    case ActivityType.RUN:
      return buildRunMetrics(activity);
    case ActivityType.BIKE:
      return buildBikeMetrics(activity);
    case ActivityType.SWIM:
      return buildSwimMetrics(activity);
    case ActivityType.HIKE:
      return buildHikeMetrics(activity);
    case ActivityType.STRENGTH:
      return buildStrengthMetrics(activity);
    default:
      return buildGenericMetrics(activity);
  }
}
