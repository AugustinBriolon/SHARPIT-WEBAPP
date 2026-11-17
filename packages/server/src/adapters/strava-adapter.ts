/**
 * ADAPTER — Strava Activity → RawSessionObservation
 *
 * Pure functions. No I/O. No side effects.
 *
 * Strava data is secondary to Garmin in SHARPIT:
 *   - If a Garmin record exists for the same session, the Strava record is ignored
 *     (deduplication by the engine's externalId check handles this case implicitly
 *     since each platform has its own externalId)
 *   - Strava does not provide TSS directly (suffer_score is proprietary)
 *   - Strava does not indicate whether HR is chest strap or optical
 *
 * NOTE: Strava activities do NOT produce SubjectiveObservations — Strava's
 * "perceived exertion" field (if available) is not exposed in the API we use.
 */

import {
  stravaIdString,
  type StravaActivity,
} from '@sharpit/server/lib/integrations/strava/strava';

import type {
  RawSessionObservation,
  SportType,
  SessionPowerData,
  SessionHrData,
  SessionPaceData,
} from '@sharpit/core/observation/types';

// ─────────────────────────────────────────────────────────────────────────────
// SportType mapping
// ─────────────────────────────────────────────────────────────────────────────

type SportTypeRule = { matches: (key: string) => boolean; sport: SportType };

function isCyclingSport(sportType: SportType): boolean {
  return sportType === 'BIKE' || sportType === 'MTB';
}

function isPaceSport(sportType: SportType): boolean {
  return ['RUN', 'TRAIL_RUN', 'SWIM', 'OPEN_WATER'].includes(sportType);
}

const STRAVA_SPORT_RULES: SportTypeRule[] = [
  { matches: (k) => k === 'trailrun', sport: 'TRAIL_RUN' },
  { matches: (k) => k === 'run' || k.includes('run') || k === 'virtualrun', sport: 'RUN' },
  { matches: (k) => k === 'mountainbikeride' || k === 'gravelride', sport: 'MTB' },
  {
    matches: (k) =>
      k.includes('ride') || k.includes('cycl') || k === 'virtualride' || k === 'ebikeride',
    sport: 'BIKE',
  },
  { matches: (k) => k === 'openwater', sport: 'OPEN_WATER' },
  { matches: (k) => k === 'swim', sport: 'SWIM' },
  { matches: (k) => k === 'triathlon', sport: 'TRIATHLON' },
  { matches: (k) => k === 'yoga', sport: 'YOGA' },
  {
    matches: (k) => k === 'weighttraining' || k === 'workout' || k === 'crossfit' || k === 'hiit',
    sport: 'STRENGTH',
  },
];

export function mapStravaSportType(sportType: string): SportType | null {
  const key = (sportType ?? '').toLowerCase();
  const rule = STRAVA_SPORT_RULES.find((candidate) => candidate.matches(key));
  return rule?.sport ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main conversion
// ─────────────────────────────────────────────────────────────────────────────

function buildStravaPowerData(
  activity: StravaActivity,
  sportType: SportType,
): SessionPowerData | undefined {
  if (!activity.average_watts || activity.average_watts <= 0) {
    return undefined;
  }

  return {
    avgWatts: activity.average_watts,
    normalizedPower: activity.weighted_average_watts ?? undefined,
    quality: isCyclingSport(sportType) ? 'MEASURED_DIRECT' : 'MEASURED_OPTICAL',
  };
}

function buildStravaHrData(activity: StravaActivity): SessionHrData | undefined {
  if (!activity.average_heartrate || activity.average_heartrate <= 0) {
    return undefined;
  }

  return {
    avgBpm: Math.round(activity.average_heartrate),
    quality: 'MEASURED_OPTICAL',
  };
}

function buildStravaPaceData(
  activity: StravaActivity,
  sportType: SportType,
): SessionPaceData | undefined {
  if (!activity.average_speed || activity.average_speed <= 0 || activity.distance <= 0) {
    return undefined;
  }
  if (!isPaceSport(sportType)) {
    return undefined;
  }

  return {
    avgMinPerKm: 1000 / activity.average_speed / 60,
    distanceM: activity.distance,
  };
}

function buildStravaSourceProvidedStress(
  activity: StravaActivity,
  powerData: SessionPowerData | undefined,
): RawSessionObservation['sourceProvidedStress'] {
  if (powerData || !activity.suffer_score || activity.suffer_score <= 0) {
    return undefined;
  }

  return {
    value: activity.suffer_score,
    quality: 'PROPRIETARY_MODEL',
  };
}

/**
 * Converts a Strava activity to a RawSessionObservation.
 * Returns null if the activity type is not supported by SHARPIT.
 */
export function stravaActivityToSession(
  activity: StravaActivity,
  receivedAt: Date,
): RawSessionObservation | null {
  const sportType = mapStravaSportType(activity.sport_type ?? activity.type);
  if (!sportType) {
    return null;
  }

  const durationSec = activity.moving_time || activity.elapsed_time || null;
  if (!durationSec) {
    return null;
  }

  const powerData = buildStravaPowerData(activity, sportType);
  const hrData = buildStravaHrData(activity);
  const paceData = buildStravaPaceData(activity, sportType);
  const sourceProvidedStress = buildStravaSourceProvidedStress(activity, powerData);

  return {
    type: 'SESSION',
    source: 'STRAVA',
    timestamp: new Date(activity.start_date),
    receivedAt,
    sportType,
    durationSec,
    externalId: stravaIdString(activity),
    title: activity.name,
    powerData,
    hrData,
    paceData,
    elevationM: activity.total_elevation_gain > 0 ? activity.total_elevation_gain : undefined,
    sourceProvidedStress,
  };
}
