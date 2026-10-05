import type { FoodHighlight } from './food-health-highlights';
import { gradeOf, type HealthGrade } from './food-health-score';
import { FOOD_MEALS, type FoodMealKey } from './food-log-math';

/**
 * The score of a meal and of a day, from the foods in it (ADR-070). Each food's Sharpit score
 * (ADR-063) weighs by the energy it brings, as the FSAm-NPS dietary index weighs the Nutri-Score of
 * the foods eaten: a spoon of sauce does not count like the plate, and water dilutes nothing.
 * Indicator only — not a medical assessment.
 */

/** What an entry brings to the meal's score; the server's entries and the clients' alike. */
export type ScorableEntry = {
  meal: FoodMealKey;
  kcal: number;
  protein: number;
  fiber?: number | null;
  health?: { score: number | null; nova?: 1 | 2 | 3 | 4 | null } | null;
};

export type MealHealth = {
  /** Null while less than half of the energy comes from scored foods. */
  score: number | null;
  grade: HealthGrade | null;
  /** Share of the energy whose food carries a score, 0–1. */
  coverage: number;
  kcal: number;
  protein: number;
  fiber: number | null;
  /** Share of the energy from ultra-processed foods (NOVA 4) among foods whose NOVA is known. */
  ultraProcessedShare: number | null;
  highlights: FoodHighlight[];
};

export type FoodLogDayHealth = {
  day: MealHealth | null;
  meals: Record<FoodMealKey, MealHealth | null>;
};

/** Below half the energy scored, a number would speak for foods it never read. */
const MIN_COVERAGE = 0.5;
/** A main meal of at least this much energy is expected to carry its protein. */
const MAIN_MEAL_KCAL = 400;
/** Protein per meal that keeps muscle protein synthesis going (ISSN position stand, 20–40 g). */
const MEAL_PROTEIN_G = 20;
/** EFSA's adequate intake of fibre for an adult, per day. */
const DAY_FIBER_G = 25;
/** A meal whose energy comes mostly from ultra-processed foods is worth naming. */
const ULTRA_PROCESSED_WATCH = 0.5;

const round1 = (value: number) => Math.round(value * 10) / 10;

function sum<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((total, item) => total + pick(item), 0);
}

function weightedScore(entries: ScorableEntry[]): { score: number | null; coverage: number } {
  const kcal = sum(entries, (entry) => Math.max(0, entry.kcal));
  const scored = entries.filter(
    (entry) => entry.kcal > 0 && typeof entry.health?.score === 'number',
  );
  const scoredKcal = sum(scored, (entry) => entry.kcal);
  const coverage = kcal > 0 ? scoredKcal / kcal : 0;
  if (scoredKcal === 0 || coverage < MIN_COVERAGE) {
    return { score: null, coverage };
  }
  const weighted = sum(scored, (entry) => entry.health!.score! * entry.kcal) / scoredKcal;
  return { score: Math.round(weighted), coverage };
}

function ultraProcessedShare(entries: ScorableEntry[]): number | null {
  const known = entries.filter((entry) => entry.kcal > 0 && entry.health?.nova);
  const kcal = sum(known, (entry) => entry.kcal);
  if (kcal === 0) {
    return null;
  }
  return (
    sum(
      known.filter((entry) => entry.health!.nova === 4),
      (entry) => entry.kcal,
    ) / kcal
  );
}

function fiberOf(entries: ScorableEntry[]): number | null {
  const known = entries.filter((entry) => typeof entry.fiber === 'number');
  return known.length === 0 ? null : round1(sum(known, (entry) => entry.fiber!));
}

type Scope = { kind: 'meal'; meal: FoodMealKey } | { kind: 'day' };

function proteinHighlight(scope: Scope, kcal: number, protein: number): FoodHighlight | null {
  if (scope.kind !== 'meal' || scope.meal === 'SNACKS') {
    return null;
  }
  const detail = `${Math.round(protein)} g dans le repas`;
  if (protein >= MEAL_PROTEIN_G) {
    return { key: 'protein_meal', tone: 'positive', label: 'Protéines au rendez-vous', detail };
  }
  return kcal >= MAIN_MEAL_KCAL
    ? { key: 'protein_meal_low', tone: 'negative', label: 'Peu de protéines', detail }
    : null;
}

function fiberHighlight(scope: Scope, fiber: number | null): FoodHighlight | null {
  if (scope.kind !== 'day' || fiber === null) {
    return null;
  }
  const detail = `${Math.round(fiber)} g sur ${DAY_FIBER_G} g conseillés`;
  return fiber >= DAY_FIBER_G
    ? { key: 'fiber_day', tone: 'positive', label: 'Fibres suffisantes', detail }
    : { key: 'fiber_day_low', tone: 'negative', label: 'Peu de fibres', detail };
}

function ultraProcessedHighlight(share: number | null): FoodHighlight | null {
  if (share === null || share < ULTRA_PROCESSED_WATCH) {
    return null;
  }
  return {
    key: 'ultra_processed_share',
    tone: 'negative',
    label: 'Surtout ultra-transformé',
    detail: `${Math.round(share * 100)} % de l'énergie`,
  };
}

function coverageHighlight(score: number | null, coverage: number): FoodHighlight | null {
  if (coverage >= 0.999 || coverage === 0) {
    return null;
  }
  const percent = `${Math.round(coverage * 100)} %`;
  return {
    key: 'partial_coverage',
    tone: 'neutral',
    label: score === null ? 'Pas assez d’aliments notés' : 'Note partielle',
    detail: `${percent} de l'énergie vient d'aliments notés`,
  };
}

function healthOf(entries: ScorableEntry[], scope: Scope): MealHealth | null {
  const kcal = sum(entries, (entry) => Math.max(0, entry.kcal));
  if (entries.length === 0 || kcal === 0) {
    return null;
  }
  const { score, coverage } = weightedScore(entries);
  const protein = round1(sum(entries, (entry) => entry.protein));
  const fiber = fiberOf(entries);
  const share = ultraProcessedShare(entries);
  const highlights = [
    proteinHighlight(scope, kcal, protein),
    fiberHighlight(scope, fiber),
    ultraProcessedHighlight(share),
    coverageHighlight(score, coverage),
  ].filter((highlight): highlight is FoodHighlight => highlight !== null);
  return {
    score,
    grade: score === null ? null : gradeOf(score),
    coverage: round1(coverage * 100) / 100,
    kcal: Math.round(kcal),
    protein,
    fiber,
    ultraProcessedShare: share === null ? null : Math.round(share * 100) / 100,
    highlights,
  };
}

/** One meal's score from its entries; null for an empty meal. */
export function mealHealth(meal: FoodMealKey, entries: ScorableEntry[]): MealHealth | null {
  return healthOf(
    entries.filter((entry) => entry.meal === meal),
    { kind: 'meal', meal },
  );
}

/** Every meal of the day, and the day as a whole. */
export function foodLogDayHealth(entries: ScorableEntry[]): FoodLogDayHealth {
  const meals = Object.fromEntries(
    FOOD_MEALS.map((meal) => [meal, mealHealth(meal, entries)]),
  ) as Record<FoodMealKey, MealHealth | null>;
  return { day: healthOf(entries, { kind: 'day' }), meals };
}
