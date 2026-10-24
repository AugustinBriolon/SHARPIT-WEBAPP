/**
 * ADAPTER — Garmin Activity → RawObservation
 *
 * Pure functions. No I/O. No side effects.
 *
 * Converts Garmin Connect's IActivity + evaluation into SHARPIT domain types:
 *   - RawSessionObservation  (the physical training event)
 *   - RawSubjectiveObservation (RPE + feeling, as a separate observation)
 *
 * Design decision: RPE and feeling are NOT part of RawSessionObservation.
 * They are a separate subjective observation that references the session via
 * sessionExternalId. This preserves the invariant that subjective experience
 * is an independent observation layer, not a property of the physical event.
 */

import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';

import type {
  RawSessionObservation,
  RawSubjectiveObservation,
  SportType,
  SessionPowerData,
  SessionHrData,
  SessionPaceData,
} from '@sharpit/core/observation/types';

/**
 * Garmin's Training Stress Score, and only that.
 *
 * `activityTrainingLoad` used to be accepted as a substitute, but it is derived
 * from EPOC and sits on an unrelated scale — roughly three times the TSS scale on
 * real data. Feeding it into a field named after Training Stress made cycling and
 * running incomparable. Sessions with no genuine TSS now report none, and the
 * Core's five-tier cascade computes load from raw power and heart rate instead.
 */
function resolveGarminTrainingStress(activity: IActivity): number | undefined {
  if (typeof activity.trainingStressScore === 'number' && activity.trainingStressScore > 0) {
    return activity.trainingStressScore;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// SportType mapping
// ─────────────────────────────────────────────────────────────────────────────

type SportTypeRule = { matches: (key: string) => boolean; sport: SportType };

const GARMIN_SPORT_RULES: SportTypeRule[] = [
  { matches: (k) => k === 'trail_running', sport: 'TRAIL_RUN' },
  {
    matches: (k) =>
      k.includes('run') ||
      k === 'treadmill_running' ||
      k === 'street_running' ||
      k === 'track_running' ||
      k === 'virtual_run',
    sport: 'RUN',
  },
  {
    matches: (k) => k === 'mountain_biking' || k === 'gravel_cycling' || k === 'mtb',
    sport: 'MTB',
  },
  {
    matches: (k) =>
      k.includes('cycl') ||
      k.includes('bike') ||
      k.includes('ride') ||
      k === 'virtual_ride' ||
      k === 'indoor_cycling',
    sport: 'BIKE',
  },
  { matches: (k) => k === 'open_water_swimming', sport: 'OPEN_WATER' },
  { matches: (k) => k.includes('swim') || k === 'lap_swimming', sport: 'SWIM' },
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
    sport: 'TRIATHLON',
  },
  { matches: (k) => k === 'yoga' || k === 'pilates', sport: 'YOGA' },
  {
    matches: (k) =>
      k.includes('strength') ||
      k.includes('hiit') ||
      k.includes('cardio') ||
      k.includes('fitness') ||
      k === 'indoor_cardio',
    sport: 'STRENGTH',
  },
];

/**
 * Maps Garmin's activityType.typeKey to SHARPIT's SportType.
 * Returns null for unsupported activity types (skipped by the sync).
 */
export function mapGarminSportType(typeKey: string): SportType | null {
  const key = typeKey.toLowerCase();
  const rule = GARMIN_SPORT_RULES.find((candidate) => candidate.matches(key));
  return rule?.sport ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration extraction
// ─────────────────────────────────────────────────────────────────────────────

/** Extracts the most appropriate duration in seconds from a Garmin activity. */
function normalizeDurationCandidate(v: number | null | undefined): number | null {
  if (v === undefined || v === null || !Number.isFinite(v) || v <= 0) {
    return null;
  }
  const sec = v > 1_000_000 ? Math.round(v / 1000) : Math.round(v);
  return sec > 0 ? sec : null;
}

function extractDurationSec(activity: IActivity, sportType: SportType): number | null {
  const candidates =
    sportType === 'STRENGTH'
      ? [activity.elapsedDuration, activity.duration, activity.movingDuration]
      : [activity.movingDuration, activity.duration, activity.elapsedDuration];

  for (const v of candidates) {
    const sec = normalizeDurationCandidate(v);
    if (sec !== null) {
      return sec;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main conversion
// ─────────────────────────────────────────────────────────────────────────────

function isCyclingSport(sportType: SportType): boolean {
  return sportType === 'BIKE' || sportType === 'MTB';
}

function isPaceSport(sportType: SportType): boolean {
  return ['RUN', 'TRAIL_RUN', 'SWIM', 'OPEN_WATER'].includes(sportType);
}

function buildGarminPowerData(
  activity: IActivity,
  sportType: SportType,
): SessionPowerData | undefined {
  const avgPower =
    typeof activity.avgPower === 'number' && activity.avgPower > 0 ? activity.avgPower : null;
  if (!avgPower) {
    return undefined;
  }

  const normPower =
    typeof activity.normPower === 'number' && activity.normPower > 0
      ? activity.normPower
      : undefined;
  const tss = resolveGarminTrainingStress(activity);

  return {
    avgWatts: avgPower,
    normalizedPower: normPower,
    sourceComputedTss: tss,
    quality: isCyclingSport(sportType) ? 'MEASURED_DIRECT' : 'MEASURED_OPTICAL',
  };
}

function buildGarminHrData(activity: IActivity): SessionHrData | undefined {
  if (!activity.averageHR || activity.averageHR <= 0) {
    return undefined;
  }

  return {
    avgBpm: Math.round(activity.averageHR),
    maxBpm: activity.maxHR ? Math.round(activity.maxHR) : undefined,
    quality: 'MEASURED_OPTICAL',
  };
}

function buildGarminPaceData(
  activity: IActivity,
  sportType: SportType,
): SessionPaceData | undefined {
  if (!activity.averageSpeed || activity.averageSpeed <= 0 || activity.distance <= 0) {
    return undefined;
  }
  if (!isPaceSport(sportType)) {
    return undefined;
  }

  return {
    avgMinPerKm: 1000 / activity.averageSpeed / 60,
    distanceM: activity.distance,
  };
}

function buildGarminSourceProvidedStress(
  activity: IActivity,
  powerData: SessionPowerData | undefined,
  hrData: SessionHrData | undefined,
): RawSessionObservation['sourceProvidedStress'] {
  if (powerData) {
    return undefined;
  }

  const tss = resolveGarminTrainingStress(activity) ?? null;
  if (!tss) {
    return undefined;
  }

  return {
    value: tss,
    quality: hrData ? 'ESTIMATED' : 'PROPRIETARY_MODEL',
  };
}

/**
 * Converts a Garmin activity to a RawSessionObservation.
 * Returns null if the activity type is not supported by SHARPIT.
 */
export function garminActivityToSession(
  activity: IActivity,
  receivedAt: Date,
): RawSessionObservation | null {
  const sportType = mapGarminSportType(activity.activityType?.typeKey ?? '');
  if (!sportType) {
    return null;
  }

  const durationSec = extractDurationSec(activity, sportType);
  if (!durationSec) {
    return null;
  }

  const powerData = buildGarminPowerData(activity, sportType);
  const hrData = buildGarminHrData(activity);
  const paceData = buildGarminPaceData(activity, sportType);
  const sourceProvidedStress = buildGarminSourceProvidedStress(activity, powerData, hrData);

  return {
    type: 'SESSION',
    source: 'GARMIN',
    timestamp: new Date(activity.startTimeLocal),
    receivedAt,
    sportType,
    durationSec,
    externalId: String(activity.activityId),
    title: activity.activityName || undefined,
    powerData,
    hrData,
    paceData,
    elevationM: activity.elevationGain > 0 ? activity.elevationGain : undefined,
    calories: activity.calories > 0 ? Math.round(activity.calories) : undefined,
    sourceProvidedStress,
  };
}

/**
 * Converts Garmin's post-workout evaluation (RPE + feeling) into a
 * RawSubjectiveObservation linked to the session via sessionExternalId.
 * Returns null if neither RPE nor feeling is available.
 */
const GARMIN_MOOD_MAP: Record<string, number> = {
  'Très mal': 1,
  Mal: 2,
  Correct: 3,
  Bien: 4,
  'Très bien': 5,
};

function hasGarminEvaluation(evaluation: { rpe: number | null; feeling: string | null }): boolean {
  return evaluation.rpe !== undefined && evaluation.rpe !== null
    ? true
    : evaluation.feeling !== undefined && evaluation.feeling !== null;
}

export function garminEvaluationToSubjective(
  evaluation: { rpe: number | null; feeling: string | null; notes: string | null },
  sessionExternalId: string,
  sessionTimestamp: Date,
  receivedAt: Date,
): RawSubjectiveObservation | null {
  if (!hasGarminEvaluation(evaluation)) {
    return null;
  }

  const mood = evaluation.feeling ? (GARMIN_MOOD_MAP[evaluation.feeling] ?? undefined) : undefined;

  return {
    type: 'SUBJECTIVE',
    source: 'GARMIN',
    timestamp: sessionTimestamp,
    receivedAt,
    rpe: evaluation.rpe ?? undefined,
    mood,
    sessionExternalId,
    notes: evaluation.notes ?? undefined,
  };
}
