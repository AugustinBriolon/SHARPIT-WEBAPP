/**
 * Declared training rhythm — which days the athlete can train, and how many
 * sessions that implies for the week.
 *
 * The web picker captures days only and derives `targetSessionsPerWeek` from them
 * (N days ⇒ N possible sessions); the iOS onboarding asks an intensity and a count
 * first, then exactly that many days. Distinct from the
 * days *observed* in past activities: this is intent, and the gap between the
 * two is itself coaching signal.
 */

/** `Date#getDay` convention: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Indexed by `Date#getDay()` — do not reorder. */
export const WEEKDAY_LABELS_FR: readonly string[] = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

/** Reading and picking order — a training week starts on Monday, not Sunday. */
export const WEEKDAYS_MONDAY_FIRST: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Short pill labels for the picker, indexed by `Date#getDay()`. */
export const WEEKDAY_SHORT_LABELS_FR: readonly string[] = [
  'Dim',
  'Lun',
  'Mar',
  'Mer',
  'Jeu',
  'Ven',
  'Sam',
];

/**
 * How hard the athlete wants the weeks to be — chosen before the days, it seeds the
 * session count (iOS onboarding) and tells the generator how much intensity to place.
 */
export const TRAINING_INTENSITIES = ['easy', 'steady', 'hard', 'max'] as const;
export type TrainingIntensity = (typeof TRAINING_INTENSITIES)[number];

export const TRAINING_INTENSITY_LABELS_FR: Record<TrainingIntensity, string> = {
  easy: 'tranquille',
  steady: 'régulière',
  hard: 'soutenue',
  max: 'intensive',
};

export function isTrainingIntensity(value: unknown): value is TrainingIntensity {
  return typeof value === 'string' && (TRAINING_INTENSITIES as readonly string[]).includes(value);
}

export const MIN_SESSIONS_PER_WEEK = 1;
export const MAX_SESSIONS_PER_WEEK = 14;

/** Persisted on AthleteProfile.trainingAvailability. */
export type TrainingAvailability = {
  version: 1;
  /**
   * Sessions possible per week. Null when no days are declared.
   */
  targetSessionsPerWeek: number | null;
  /** Days free to train, `Date#getDay` values, stored Monday-first. */
  availableWeekdays: Weekday[];
  /** Wanted effort; absent for athletes who declared days only. */
  intensity?: TrainingIntensity;
};

/** N selected days ⇒ N possible sessions; empty days ⇒ undeclared. */
export function sessionsFromWeekdays(days: readonly Weekday[]): number | null {
  return days.length > 0 ? days.length : null;
}

export const EMPTY_TRAINING_AVAILABILITY: TrainingAvailability = {
  version: 1,
  targetSessionsPerWeek: null,
  availableWeekdays: [],
};

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** Monday-first, deduplicated — storage order matches reading order. */
export function orderWeekdays(days: readonly Weekday[]): Weekday[] {
  const present = new Set(days);
  return WEEKDAYS_MONDAY_FIRST.filter((day) => present.has(day));
}

export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS_FR[day] ?? '';
}

/** « Mardi, Jeudi, Samedi » — empty when nothing is declared. */
export function weekdayLabels(days: readonly Weekday[]): string[] {
  return orderWeekdays(days).map(weekdayLabel);
}
