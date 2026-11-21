/**
 * Biological plausibility priors for habit × physiology associations.
 *
 * Presentation layer only: ranks which contrasts are fair game for a priority
 * lever vs exploratory noise. Not a causal model — a honesty filter for n=1
 * medians with uncontrolled confounders.
 */

import type { JournalOutcomeKey } from '@sharpit/app/lib/journal/journal-habit-analysis';

/** How seriously we take a factor×outcome contrast in the athlete mirror. */
export type HabitOutcomePlausibility = 'primary' | 'secondary' | 'exploratory';

/**
 * Default: exploratory. Explicit lists below are the scientific shortlist for
 * a Digital Twin coach — sleep hygiene / load-adjacent levers first, supplements
 * last (and never as a sleep priority without a controlled experiment).
 */
const PRIMARY: Partial<Record<JournalOutcomeKey, ReadonlySet<string>>> = {
  sleepMinutes: new Set([
    'late_meal',
    'device_in_bed',
    'alcohol',
    'coffee',
    'late_coffee',
    'shared_bed',
    'night_work',
    'earplugs',
    'sleep_mask',
  ]),
  recoveryScore: new Set([
    'alcohol',
    'device_in_bed',
    'late_meal',
    'cold_shower',
    'ice_bath',
    'sauna',
    'meditation',
    'mobility',
    'easy_walk',
    'yoga',
    'night_work',
  ]),
  bodyBattery: new Set([
    'alcohol',
    'device_in_bed',
    'late_meal',
    'cold_shower',
    'ice_bath',
    'sauna',
    'meditation',
    'easy_walk',
    'yoga',
    'night_work',
  ]),
};

const SECONDARY: Partial<Record<JournalOutcomeKey, ReadonlySet<string>>> = {
  sleepMinutes: new Set([
    'magnesium',
    'ashwagandha',
    'melatonin',
    'cbd',
    'fever',
    'pain',
    'cold_congestion',
    'headache',
    'menstruation',
  ]),
  recoveryScore: new Set([
    'late_coffee',
    'creatine',
    'magnesium',
    'ashwagandha',
    'electrolytes',
    'massage',
    'pneumatic_recovery',
    'sun_exposure',
    'hydration_low',
    'hydration_quality',
    'fever',
    'pain',
    'menstruation',
  ]),
  bodyBattery: new Set([
    'creatine',
    'magnesium',
    'electrolytes',
    'massage',
    'pneumatic_recovery',
    'sun_exposure',
    'hydration_low',
    'hydration_quality',
    'fever',
    'pain',
  ]),
};

function inSet(
  table: Partial<Record<JournalOutcomeKey, ReadonlySet<string>>>,
  factorId: string,
  outcome: JournalOutcomeKey,
): boolean {
  return table[outcome]?.has(factorId) ?? false;
}

export function habitOutcomePlausibility(
  factorId: string,
  outcome: JournalOutcomeKey,
): HabitOutcomePlausibility {
  if (inSet(PRIMARY, factorId, outcome)) {
    return 'primary';
  }
  if (inSet(SECONDARY, factorId, outcome)) {
    return 'secondary';
  }
  return 'exploratory';
}

/** Priority / experiment CTAs need a primary or secondary lever — not a supplement fluke. */
export function canBeHabitPriorityLever(factorId: string, outcome: JournalOutcomeKey): boolean {
  const rank = habitOutcomePlausibility(factorId, outcome);
  return rank === 'primary' || rank === 'secondary';
}
