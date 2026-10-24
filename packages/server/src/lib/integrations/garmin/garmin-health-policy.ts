import type { IntegrationSourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';

/**
 * What Garmin may write of the day fields it shares with Apple Health — the night, resting HR,
 * HRV and steps — given the athlete's sources for `wearable_health` (ADR-054). Its own readings
 * (readiness, body battery, stress, sleep score) are not shared and always go in.
 *
 * - `own`: Garmin is the primary, or the only source: as before.
 * - `fill`: Apple Health is the primary: Garmin only fills a gap.
 * - `off`: Garmin is not enabled for the class: the shared fields are left alone.
 */
export type GarminHealthWrite = 'own' | 'fill' | 'off';

export function garminHealthWrite(prefs: IntegrationSourcePrefs): GarminHealthWrite {
  const slot = prefs.classes.wearable_health;
  if (!slot?.enabled.includes('garmin')) {
    return 'off';
  }
  return slot.primary === 'apple-health' ? 'fill' : 'own';
}

const NIGHT_FIELDS = [
  'sleepMinutes',
  'sleepDeepMin',
  'sleepLightMin',
  'sleepRemMin',
  'sleepAwakeMin',
  'sleepBedtimeMin',
  'sleepWakeMin',
] as const;

/** Garmin's RMSSD band and status only mean something beside Garmin's own HRV. */
const HRV_FIELDS = ['hrv', 'hrvBaselineLow', 'hrvBaselineHigh', 'hrvStatus'] as const;

const SHARED_SCALARS = ['restingHr', 'totalSteps'] as const;

type Day = Record<string, unknown>;

function isSet(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function without<T extends Day>(data: T, fields: readonly string[]): T {
  const next = { ...data };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}

/**
 * The Garmin update for one day, cut to what the policy lets it write. The night and HRV go as
 * blocks: stages or a baseline from one source beside a total from another would not add up.
 */
export function restrictGarminHealthUpdate<T extends Day>(
  update: T,
  existing: Day | null,
  write: GarminHealthWrite,
): T {
  if (write === 'own') {
    return update;
  }
  if (write === 'off') {
    return without(update, [...NIGHT_FIELDS, ...HRV_FIELDS, ...SHARED_SCALARS]);
  }
  const current = existing ?? {};
  let next = update;
  if (isSet(current.sleepMinutes)) {
    next = without(next, NIGHT_FIELDS);
  }
  if (isSet(current.hrv)) {
    next = without(next, HRV_FIELDS);
  }
  return without(
    next,
    SHARED_SCALARS.filter((field) => isSet(current[field])),
  );
}

/** Observation types Garmin feeds the Core only when it owns the class's shared fields. */
export const SHARED_OBSERVATION_TYPES = new Set(['SLEEP', 'HRV', 'RESTING_HR']);
