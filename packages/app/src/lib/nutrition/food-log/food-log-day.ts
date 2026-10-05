import { FOOD_MEALS, type FoodMealKey, type FoodPer100g } from './food-log-math';
import type { NutritionTargetMode } from './nutrition-targets';
import type { FoodLogEntryCreateInput } from '@sharpit/app/lib/validators/food-log';
import type { ServedFoodHealth } from './food-health-score';
import { mealHealth, type FoodLogDayHealth, type MealHealth } from './meal-health-score';

/**
 * The food log as the athlete reads it (ADR-061): the wire shapes of `/api/food-log`, the day
 * folded into its four meals, and the portion shortcuts offered when a food is picked.
 */

export const FOOD_MEAL_LABELS: Record<FoodMealKey, string> = {
  BREAKFAST: 'Petit-déjeuner',
  LUNCH: 'Déjeuner',
  DINNER: 'Dîner',
  SNACKS: 'Collations',
};

export type FoodLogEntryPayload = {
  id: string;
  date: string;
  meal: FoodMealKey;
  productId?: string | null;
  name: string;
  brand?: string | null;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number | null;
  sugar?: number | null;
  /** The linked product's Sharpit score, live (ADR-063); absent for a quick add. */
  health?: ServedFoodHealth | null;
};

export type FoodProductPayload = FoodPer100g & {
  id: string;
  source: 'OFF' | 'CUSTOM' | 'CIQUAL';
  barcode?: string | null;
  name: string;
  brand?: string | null;
  servingGrams?: number | null;
  servingLabel?: string | null;
  saltPer100g?: number | null;
  saturatedFatPer100g?: number | null;
  health?: ServedFoodHealth | null;
  /** Values measured (Ciqual) or given by the manufacturer / checked on OFF (ADR-069). */
  verified?: boolean;
  verifiedBy?: 'ciqual' | 'producer' | 'checked' | null;
};

/** Grams are always set from the split in `PERCENT` mode; the shares are kept to prefill it. */
export type NutritionTargetsPayload = {
  mode: NutritionTargetMode;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  proteinPct: number | null;
  carbsPct: number | null;
  fatPct: number | null;
};

/** `GET /api/food-log/foods/mine`. */
export type OwnFoodsPayload = { foods: FoodProductPayload[] };

/** `POST /api/food-log/import/myfitnesspal`. */
export type MfpImportResultPayload = {
  importedDays: number;
  firstDay: string | null;
  lastDay: string | null;
  /** Rows without a readable date or calories, left out. */
  skippedRows: number;
};

export type RecentFoodPayload = { product: FoodProductPayload; lastGrams: number };

export type FoodLogDayPayload = {
  trainingDayId: string;
  entries: FoodLogEntryPayload[];
  /** Each meal's score and the day's (ADR-070); clients may recompute it from `entries`. */
  health?: FoodLogDayHealth;
  targets: NutritionTargetsPayload;
  recent: RecentFoodPayload[];
};

/** A food the athlete logged in the last 90 days, matching the search (ADR-069). */
export type EatenFoodPayload = RecentFoodPayload & { timesEaten: number };

export type FoodSearchPayload = {
  /** Listed first; not repeated in the lists below. */
  eaten?: EatenFoodPayload[];
  own: FoodProductPayload[];
  /** Generic foods from the Ciqual table (ADR-065). */
  generic?: FoodProductPayload[];
  products: FoodProductPayload[];
  offUnavailable: boolean;
};

export type FoodLogMealGroup = {
  meal: FoodMealKey;
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: FoodLogEntryPayload[];
  /** The meal's score from its foods (ADR-070); null for an empty meal. */
  health: MealHealth | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

function total(entries: FoodLogEntryPayload[], pick: (entry: FoodLogEntryPayload) => number) {
  return entries.reduce((sum, entry) => sum + pick(entry), 0);
}

function mealGroup(meal: FoodMealKey, entries: FoodLogEntryPayload[]): FoodLogMealGroup {
  return {
    meal,
    label: FOOD_MEAL_LABELS[meal],
    kcal: Math.round(total(entries, (entry) => entry.kcal)),
    protein: round1(total(entries, (entry) => entry.protein)),
    carbs: round1(total(entries, (entry) => entry.carbs)),
    fat: round1(total(entries, (entry) => entry.fat)),
    entries,
    health: mealHealth(meal, entries),
  };
}

/** Every meal of the day, breakfast → snacks, each with its entries in logged order. */
export function groupEntriesByMeal(entries: FoodLogEntryPayload[]): FoodLogMealGroup[] {
  return FOOD_MEALS.map((meal) =>
    mealGroup(
      meal,
      entries.filter((entry) => entry.meal === meal),
    ),
  );
}

/** The meal a new entry most likely belongs to, from the hour it is logged. */
export function mealForHour(hour: number): FoodMealKey {
  if (hour < 11) {
    return 'BREAKFAST';
  }
  if (hour < 15) {
    return 'LUNCH';
  }
  if (hour < 18) {
    return 'SNACKS';
  }
  return 'DINNER';
}

export type PortionPreset = { label: string; grams: number };

function servingPreset(product: FoodProductPayload): PortionPreset | null {
  if (!product.servingGrams) {
    return null;
  }
  const grams = round1(product.servingGrams);
  return { label: product.servingLabel || `1 portion · ${grams} g`, grams };
}

/** 100 g, the product's serving, then the last portion logged — one chip per distinct weight. */
export function portionPresets(
  product: FoodProductPayload,
  lastGrams?: number | null,
): PortionPreset[] {
  const candidates = [
    { label: '100 g', grams: 100 },
    servingPreset(product),
    lastGrams
      ? { label: `Dernière fois · ${round1(lastGrams)} g`, grams: round1(lastGrams) }
      : null,
  ].filter((preset): preset is PortionPreset => preset !== null);
  return candidates.filter(
    (preset, index) => candidates.findIndex((other) => other.grams === preset.grams) === index,
  );
}

/** The weight a picked food opens with: the last portion logged, else its serving, else 100 g. */
export function defaultPortionGrams(
  product: FoodProductPayload,
  lastGrams?: number | null,
): number {
  return round1(lastGrams || product.servingGrams || 100);
}

function scaleOptional(value: number | null | undefined, ratio: number) {
  return value === null || value === undefined ? value : round1(value * ratio);
}

/** An entry at a new weight, its snapshot scaled in proportion — the server's own rule. */
export function rescaleEntry(entry: FoodLogEntryPayload, grams: number): FoodLogEntryPayload {
  const ratio = grams / entry.grams;
  return {
    ...entry,
    grams,
    kcal: round1(entry.kcal * ratio),
    protein: round1(entry.protein * ratio),
    carbs: round1(entry.carbs * ratio),
    fat: round1(entry.fat * ratio),
    fiber: scaleOptional(entry.fiber, ratio),
    sugar: scaleOptional(entry.sugar, ratio),
  };
}

/**
 * The create body that logs a deleted entry again — the undo of a delete. A product entry is
 * re-read from its product at the same weight; a quick add keeps its typed nutrients.
 */
export function entryRecreateInput(
  entry: FoodLogEntryPayload,
  trainingDayId: string,
): FoodLogEntryCreateInput {
  const base = { trainingDayId, meal: entry.meal, grams: entry.grams };
  if (entry.productId) {
    return { ...base, productId: entry.productId };
  }
  const { name, kcal, protein, carbs, fat } = entry;
  return { ...base, quick: { name, kcal, protein, carbs, fat } };
}

export type FoodLogDisplay = 'log' | 'imported' | 'empty';

/**
 * What the meals list shows for a day: the SHARPIT log, a day only MyFitnessPal filled (the log
 * wins a day it has entries for — ADR-061), or the invitation to log a first meal.
 */
export function foodLogDisplay(
  loggedEntryCount: number,
  importedMealCount: number,
): FoodLogDisplay {
  if (loggedEntryCount > 0) {
    return 'log';
  }
  return importedMealCount > 0 ? 'imported' : 'empty';
}
