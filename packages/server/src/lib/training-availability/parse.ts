import {
  EMPTY_TRAINING_AVAILABILITY,
  isTrainingIntensity,
  isWeekday,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  orderWeekdays,
  type TrainingAvailability,
  type Weekday,
} from '@sharpit/app/lib/training-availability/types';

/** Out-of-range or non-integer counts read as "not declared", never as a clamp. */
function parseSessionsPerWeek(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return null;
  }
  if (raw < MIN_SESSIONS_PER_WEEK || raw > MAX_SESSIONS_PER_WEEK) {
    return null;
  }
  return raw;
}

function parseWeekdays(raw: unknown): Weekday[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return orderWeekdays(raw.filter(isWeekday));
}

/**
 * Read a stored blob into a usable shape. Anything unreadable degrades to
 * "nothing declared" rather than throwing — an athlete who predates the field
 * must still get a coach prompt.
 */
export function normalizeTrainingAvailability(raw: unknown): TrainingAvailability {
  if (!raw || typeof raw !== 'object') {
    return EMPTY_TRAINING_AVAILABILITY;
  }
  const record = raw as {
    targetSessionsPerWeek?: unknown;
    availableWeekdays?: unknown;
    intensity?: unknown;
  };
  const availability: TrainingAvailability = {
    version: 1,
    targetSessionsPerWeek: parseSessionsPerWeek(record.targetSessionsPerWeek),
    availableWeekdays: parseWeekdays(record.availableWeekdays),
  };
  // An unknown word reads as undeclared, like an out-of-range count.
  if (isTrainingIntensity(record.intensity)) {
    availability.intensity = record.intensity;
  }
  return availability;
}

/** Explicit null clears the column; anything else is normalised before it is written. */
export function sanitizeTrainingAvailabilityForPersist(raw: unknown): TrainingAvailability | null {
  if (raw === null) {
    return null;
  }
  return normalizeTrainingAvailability(raw);
}

/** True when the athlete declared at least one of the two answers. */
export function hasDeclaredAvailability(availability: TrainingAvailability): boolean {
  return availability.targetSessionsPerWeek !== null || availability.availableWeekdays.length > 0;
}
