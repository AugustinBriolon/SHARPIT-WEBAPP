/**
 * The in-app food log's arithmetic (ADR-061): what a portion of a food weighs in nutrients, and
 * how a day's entries fold into the `DailyNutrition` shape every existing reader already knows.
 */

export const FOOD_MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'] as const;
export type FoodMealKey = (typeof FOOD_MEALS)[number];

/** Snacks are optional: a day is fully logged once these are eaten or skipped (ADR-113). */
const MAIN_MEALS: readonly FoodMealKey[] = ['BREAKFAST', 'LUNCH', 'DINNER'];

export function isFoodLogDayComplete(
  mealsWithFood: Iterable<FoodMealKey>,
  skippedMeals: Iterable<FoodMealKey>,
): boolean {
  const covered = new Set([...mealsWithFood, ...skippedMeals]);
  return MAIN_MEALS.every((meal) => covered.has(meal));
}

/** `DailyNutrition.meals[].name` — the names MyFitnessPal wrote and `meal-display` labels. */
const STORED_MEAL_NAME: Record<FoodMealKey, string> = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  SNACKS: 'snacks',
};

export type FoodPer100g = {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g?: number | null;
  sugarPer100g?: number | null;
};

export type PortionNutrients = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

function scale(per100g: number, grams: number): number {
  return round1((per100g * grams) / 100);
}

function scaleOptional(per100g: number | null | undefined, grams: number): number | null {
  return per100g === null || per100g === undefined ? null : scale(per100g, grams);
}

/** Nutrients of `grams` of a food, snapshotted onto the entry when it is logged. */
export function portionNutrients(food: FoodPer100g, grams: number): PortionNutrients {
  return {
    kcal: scale(food.kcalPer100g, grams),
    protein: scale(food.proteinPer100g, grams),
    carbs: scale(food.carbsPer100g, grams),
    fat: scale(food.fatPer100g, grams),
    fiber: scaleOptional(food.fiberPer100g, grams),
    sugar: scaleOptional(food.sugarPer100g, grams),
  };
}

export type LoggedEntry = PortionNutrients & {
  meal: FoodMealKey;
  name: string;
  brand?: string | null;
};

type StoredFoodEntry = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  fiber?: number;
};

type StoredMeal = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: StoredFoodEntry[];
};

export type DailyNutritionProjection = {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  meals: StoredMeal[];
};

function sum(values: Array<number | null>): number | null {
  const set = values.filter((value): value is number => value !== null);
  return set.length ? round1(set.reduce((total, value) => total + value, 0)) : null;
}

function storedEntry(entry: LoggedEntry): StoredFoodEntry {
  return {
    name: entry.brand ? `${entry.name} · ${entry.brand}` : entry.name,
    calories: Math.round(entry.kcal),
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    ...(entry.sugar === null ? {} : { sugar: entry.sugar }),
    ...(entry.fiber === null ? {} : { fiber: entry.fiber }),
  };
}

function storedMeal(meal: FoodMealKey, entries: LoggedEntry[]): StoredMeal {
  return {
    name: STORED_MEAL_NAME[meal],
    calories: Math.round(entries.reduce((total, entry) => total + entry.kcal, 0)),
    protein: Math.round(entries.reduce((total, entry) => total + entry.protein, 0)),
    carbs: Math.round(entries.reduce((total, entry) => total + entry.carbs, 0)),
    fat: Math.round(entries.reduce((total, entry) => total + entry.fat, 0)),
    entries: entries.map(storedEntry),
  };
}

/** A day's entries as the `DailyNutrition` row the readers know — empty meals left out. */
export function projectFoodLogDay(entries: LoggedEntry[]): DailyNutritionProjection {
  return {
    calories: Math.round(entries.reduce((total, entry) => total + entry.kcal, 0)),
    protein: round1(entries.reduce((total, entry) => total + entry.protein, 0)),
    carbohydrates: round1(entries.reduce((total, entry) => total + entry.carbs, 0)),
    fat: round1(entries.reduce((total, entry) => total + entry.fat, 0)),
    fiber: sum(entries.map((entry) => entry.fiber)),
    sugar: sum(entries.map((entry) => entry.sugar)),
    meals: FOOD_MEALS.map((meal) => [meal, entries.filter((entry) => entry.meal === meal)] as const)
      .filter(([, mealEntries]) => mealEntries.length > 0)
      .map(([meal, mealEntries]) => storedMeal(meal, mealEntries)),
  };
}
