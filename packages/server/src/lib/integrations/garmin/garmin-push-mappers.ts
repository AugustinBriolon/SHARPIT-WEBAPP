import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import {
  emptyGarminDailyHealth,
  type GarminDailyHealth,
} from '@sharpit/server/lib/integrations/garmin/garmin';
import type { RawStreams } from '@sharpit/server/lib/streams/stream-raw-types';

/**
 * Garmin Health / Activity API push payloads (docs/garmin/*.pdf) mapped onto the shapes the
 * rest of SharpIt already reads: a Connect-style `IActivity`, a `GarminDailyHealth` day and
 * `RawStreams`. Pure functions — no I/O.
 */

type Json = Record<string, unknown>;

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value: unknown): number | null {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
}

function minutes(seconds: unknown): number | null {
  const n = num(seconds);
  return n !== null && n >= 0 ? Math.round(n / 60) : null;
}

/** Device wall clock as UTC (Activity.date convention): start + Garmin's offset. */
function wallClock(startSeconds: number, offsetSeconds: unknown): Date {
  return new Date((startSeconds + (num(offsetSeconds) ?? 0)) * 1000);
}

function connectDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function minuteOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function calendarDate(item: Json): string | null {
  return typeof item.calendarDate === 'string' ? item.calendarDate : null;
}

/** Transitions and a multisport parent carry no session of their own: the legs do (ADR-078). */
export function isGarminSessionActivity(item: Json): boolean {
  const type = String(item.activityType ?? '').toUpperCase();
  return item.isParent !== true && type !== 'MULTI_SPORT' && !type.includes('TRANSITION');
}

/** An Activity API summary as the Connect activity the import code maps (`IActivity`). */
export function pushedActivityToConnect(item: Json): IActivity | null {
  const start = num(item.startTimeInSeconds);
  const id = item.activityId ?? item.summaryId;
  if (start === null || id === undefined || id === null) {
    return null;
  }
  const duration = num(item.durationInSeconds);
  return {
    activityId: Number(id),
    activityName: typeof item.activityName === 'string' ? item.activityName : '',
    activityType: { typeKey: String(item.activityType ?? 'other').toLowerCase() },
    startTimeLocal: connectDateTime(wallClock(start, item.startTimeOffsetInSeconds)),
    startTimeGMT: connectDateTime(new Date(start * 1000)),
    duration,
    elapsedDuration: duration,
    movingDuration: null,
    distance: num(item.distanceInMeters) ?? 0,
    averageSpeed: num(item.averageSpeedInMetersPerSecond),
    maxSpeed: num(item.maxSpeedInMetersPerSecond),
    averageHR: num(item.averageHeartRateInBeatsPerMinute),
    maxHR: num(item.maxHeartRateInBeatsPerMinute),
    calories: num(item.activeKilocalories),
    elevationGain: num(item.totalElevationGainInMeters),
    elevationLoss: num(item.totalElevationLossInMeters),
    averageRunningCadenceInStepsPerMinute: num(item.averageRunCadenceInStepsPerMinute),
    averageBikingCadenceInRevPerMinute: num(item.averageBikeCadenceInRoundsPerMinute),
    steps: num(item.steps),
    deviceName: typeof item.deviceName === 'string' ? item.deviceName : null,
  } as unknown as IActivity;
}

/** Per-second samples are thinned to this many points, like the series SharpIt stored before. */
const MAX_STREAM_POINTS = 2000;

/** `activityDetails` samples as the streams the activity screens read. */
export function pushedDetailsToRawStreams(item: Json): RawStreams | null {
  const samples = Array.isArray(item.samples) ? (item.samples as Json[]) : [];
  if (samples.length === 0) {
    return null;
  }
  const summary = (item.summary ?? {}) as Json;
  const t0 = num(summary.startTimeInSeconds) ?? num(samples[0].startTimeInSeconds) ?? 0;
  const stride = Math.max(1, Math.ceil(samples.length / MAX_STREAM_POINTS));
  const raw: RawStreams = {
    time: [],
    distance: [],
    altitude: [],
    heartrate: [],
    watts: [],
    cadence: [],
    velocity: [],
    latlng: [],
  };
  for (let i = 0; i < samples.length; i += stride) {
    const sample = samples[i];
    raw.time.push(Math.max(0, Math.round((num(sample.startTimeInSeconds) ?? t0) - t0)));
    raw.distance.push(num(sample.totalDistanceInMeters) ?? raw.distance.at(-1) ?? 0);
    raw.altitude.push(num(sample.elevationInMeters) ?? 0);
    raw.heartrate.push(num(sample.heartRate) ?? 0);
    raw.watts.push(num(sample.powerInWatts) ?? 0);
    raw.cadence.push(num(sample.bikeCadenceInRPM) ?? num(sample.stepsPerMinute) ?? 0);
    raw.velocity.push(num(sample.speedMetersPerSecond) ?? 0);
    const lat = num(sample.latitudeInDegree);
    const lon = num(sample.longitudeInDegree);
    if (lat !== null && lon !== null) {
      raw.latlng.push([lat, lon]);
    }
  }
  return raw;
}

/** Dailies: resting heart rate, steps and the day's average stress (-1 means unknown). */
export function pushedDailyToHealth(item: Json): GarminDailyHealth | null {
  const date = calendarDate(item);
  if (!date) {
    return null;
  }
  const health = emptyGarminDailyHealth(date);
  health.restingHr = positive(item.restingHeartRateInBeatsPerMinute);
  health.totalSteps = num(item.steps);
  const stress = num(item.averageStressLevel);
  health.stress = stress !== null && stress >= 0 ? stress : null;
  return health;
}

function averageOf(map: unknown): number | null {
  if (!map || typeof map !== 'object') {
    return null;
  }
  const values = Object.values(map as Json)
    .map(num)
    .filter((v): v is number => v !== null);
  return values.length > 0
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
    : null;
}

/** A night: stages, score and bed / wake times on the device's wall clock. */
export function pushedSleepToHealth(item: Json): GarminDailyHealth | null {
  const date = calendarDate(item);
  const start = num(item.startTimeInSeconds);
  if (!date || start === null) {
    return null;
  }
  const health = emptyGarminDailyHealth(date);
  const asleep = num(item.durationInSeconds);
  const awake = num(item.awakeDurationInSeconds) ?? 0;
  const bedtime = wallClock(start, item.startTimeOffsetInSeconds);
  const score = (item.overallSleepScore ?? null) as Json | null;
  health.sleepMinutes = minutes(asleep);
  health.napMinutes = positive(item.totalNapDurationInSeconds)
    ? minutes(item.totalNapDurationInSeconds)
    : null;
  health.sleep = {
    ...health.sleep,
    sleepMinutes: health.sleepMinutes,
    napMinutes: health.napMinutes,
    sleepScore: positive(score?.value),
    sleepScoreFeedback: typeof score?.qualifierKey === 'string' ? score.qualifierKey : null,
    sleepDeepMin: minutes(item.deepSleepDurationInSeconds),
    sleepLightMin: minutes(item.lightSleepDurationInSeconds),
    sleepRemMin: minutes(item.remSleepInSeconds),
    sleepAwakeMin: minutes(item.awakeDurationInSeconds),
    sleepBedtimeMin: minuteOfDay(bedtime),
    sleepWakeMin:
      asleep !== null ? minuteOfDay(new Date(bedtime.getTime() + (asleep + awake) * 1000)) : null,
    sleepRespiration: averageOf(item.timeOffsetSleepRespiration),
  };
  return health;
}

/** The night's average HRV (RMSSD). Garmin's status and baseline are not in the Health API. */
export function pushedHrvToHealth(item: Json): GarminDailyHealth | null {
  const date = calendarDate(item);
  if (!date) {
    return null;
  }
  const health = emptyGarminDailyHealth(date);
  health.hrv = positive(item.lastNightAvg);
  return health;
}

/** A weighing, on the day of the device's wall clock. */
export function pushedBodyCompToHealth(item: Json): GarminDailyHealth | null {
  const at = num(item.measurementTimeInSeconds);
  const grams = positive(item.weightInGrams);
  if (at === null || grams === null) {
    return null;
  }
  const date = wallClock(at, item.measurementTimeOffsetInSeconds).toISOString().slice(0, 10);
  const health = emptyGarminDailyHealth(date);
  health.weightKg = Math.round(grams / 10) / 100;
  return health;
}

/** VO2max estimates from `userMetrics`, for the athlete profile. */
export function pushedUserMetricsToProfile(item: Json): {
  vo2maxRunning: number | null;
  vo2maxCycling: number | null;
} {
  return { vo2maxRunning: positive(item.vo2Max), vo2maxCycling: positive(item.vo2MaxCycling) };
}
