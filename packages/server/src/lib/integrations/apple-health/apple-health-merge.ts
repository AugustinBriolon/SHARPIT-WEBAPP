import type { IntegrationSourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';

/**
 * Apple Health arrives from the native app as one summary per day. What it may write follows
 * the athlete's sources per data class (ADR-027, ADR-054): off when Apple Health is not enabled
 * for the class, filling only the gaps while another source is primary (ADR-043), and owning the
 * fields when it is the primary itself.
 */

export type AppleHealthDay = {
  date: string;
  sleepMinutes?: number | null;
  sleepDeepMin?: number | null;
  sleepRemMin?: number | null;
  sleepLightMin?: number | null;
  sleepAwakeMin?: number | null;
  sleepBedtimeMin?: number | null;
  sleepWakeMin?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  totalSteps?: number | null;
  calories?: number | null;
  weightKg?: number | null;
};

export type StoredHealthDay = Partial<Record<Exclude<keyof AppleHealthDay, 'date'>, number | null>>;

const SLEEP_FIELDS = [
  'sleepMinutes',
  'sleepDeepMin',
  'sleepRemMin',
  'sleepLightMin',
  'sleepAwakeMin',
  'sleepBedtimeMin',
  'sleepWakeMin',
] as const;

type ScalarField = 'restingHr' | 'hrv' | 'totalSteps' | 'calories' | 'weightKg';
const HEALTH_SCALARS = ['restingHr', 'hrv', 'totalSteps', 'calories'] as const;

function isSet(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

/** What Apple Health may do with one data class's fields. */
export type AppleHealthWrite = 'off' | 'fill' | 'own';

export type AppleHealthPolicy = {
  /** Sleep, resting HR, HRV, steps, active energy — `wearable_health`. */
  health: AppleHealthWrite;
  /** The weight — `body`. */
  body: AppleHealthWrite;
  /** Garmin also feeds `wearable_health`: its overnight RMSSD cannot share a baseline with
   * Apple's SDNN, so Apple HRV only goes in when Apple owns the class. */
  garminHrv: boolean;
};

function writeFor(
  prefs: IntegrationSourcePrefs,
  classId: 'wearable_health' | 'body',
): AppleHealthWrite {
  const slot = prefs.classes[classId];
  if (!slot?.enabled.includes('apple-health')) {
    return 'off';
  }
  return slot.primary === 'apple-health' ? 'own' : 'fill';
}

export function appleHealthPolicy(prefs: IntegrationSourcePrefs): AppleHealthPolicy {
  return {
    health: writeFor(prefs, 'wearable_health'),
    body: writeFor(prefs, 'body'),
    garminHrv: prefs.classes.wearable_health?.enabled.includes('garmin') ?? false,
  };
}

function nightPatch(
  current: StoredHealthDay,
  incoming: AppleHealthDay,
  write: AppleHealthWrite,
): StoredHealthDay {
  const hasNight = isSet(incoming.sleepMinutes) && incoming.sleepMinutes > 0;
  if (write === 'off' || !hasNight || (write === 'fill' && isSet(current.sleepMinutes))) {
    return {};
  }
  // Whole or not at all: stages from one source beside a total from another would not add up,
  // so owning the night also clears the stages Apple Health did not measure.
  const patch: StoredHealthDay = {};
  for (const field of SLEEP_FIELDS) {
    patch[field] = isSet(incoming[field]) ? incoming[field] : null;
  }
  return patch;
}

function fieldPatch(
  current: StoredHealthDay,
  incoming: AppleHealthDay,
  fields: readonly ScalarField[],
  write: AppleHealthWrite,
): StoredHealthDay {
  const patch: StoredHealthDay = {};
  for (const field of fields) {
    const takes = write === 'own' || (write === 'fill' && !isSet(current[field]));
    if (takes && isSet(incoming[field])) {
      patch[field] = incoming[field];
    }
  }
  return patch;
}

/** The fields Apple Health writes for one day, given what the day holds and the policy. */
export function appleHealthPatch(
  existing: StoredHealthDay | null,
  incoming: AppleHealthDay,
  policy: AppleHealthPolicy,
): StoredHealthDay {
  const current = existing ?? {};
  const hrvAllowed = policy.health === 'own' || !policy.garminHrv;
  const healthFields = HEALTH_SCALARS.filter((field) => field !== 'hrv' || hrvAllowed);
  return {
    ...nightPatch(current, incoming, policy.health),
    ...fieldPatch(current, incoming, healthFields, policy.health),
    ...fieldPatch(current, incoming, ['weightKg'], policy.body),
  };
}
