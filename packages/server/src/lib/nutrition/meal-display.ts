import type {
  NutritionFoodEntry,
  NutritionMealSummary,
} from '@sharpit/app/presentation/nutrition-view-model';
import { FOOD_MEALS } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import { FOOD_MEAL_LABELS } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

const MEAL_ORDER = FOOD_MEALS.map((meal) => meal.toLowerCase());

const MEAL_LABELS: Record<string, string> = Object.fromEntries(
  FOOD_MEALS.map((meal) => [meal.toLowerCase(), FOOD_MEAL_LABELS[meal]]),
);

/** French label (and common variants) → stored English key. */
const LABEL_TO_STORED_NAME: Record<string, string> = Object.fromEntries(
  FOOD_MEALS.flatMap((meal) => {
    const stored = meal.toLowerCase();
    const label = FOOD_MEAL_LABELS[meal].toLowerCase();
    const entries: Array<[string, string]> = [[label, stored]];
    if (stored === 'snacks') {
      entries.push(['collation', stored], ['en-cas', stored], ['encas', stored]);
    }
    return entries;
  }),
);

export function formatMealLabel(rawName: string): string {
  const key = rawName.trim().toLowerCase();
  return MEAL_LABELS[key] ?? rawName.charAt(0).toUpperCase() + rawName.slice(1);
}

/** Canonical diary key (breakfast…) when the raw name is a known meal. */
export function canonicalMealName(rawName: string): string {
  const key = rawName.trim().toLowerCase();
  if (MEAL_ORDER.includes(key)) {
    return key;
  }
  return LABEL_TO_STORED_NAME[key] ?? rawName.trim();
}

export function mealSortIndex(rawName: string): number {
  const key = canonicalMealName(rawName).toLowerCase();
  const index = MEAL_ORDER.indexOf(key);
  return index === -1 ? MEAL_ORDER.length : index;
}

/**
 * Subtitle under the meal title — null when it would repeat the title
 * (same string, or a known machine key already labelled in French).
 */
export function mealSubtitle(name: string, label: string): string | null {
  const trimmedName = name.trim();
  const trimmedLabel = label.trim();
  if (!trimmedName) {
    return null;
  }
  if (trimmedName.localeCompare(trimmedLabel, 'fr', { sensitivity: 'accent' }) === 0) {
    return null;
  }
  if (MEAL_ORDER.includes(trimmedName.toLowerCase())) {
    return null;
  }
  return trimmedName;
}

type StoredMeal = Partial<NutritionMealSummary> & {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries?: NutritionFoodEntry[];
};

/** `DailyNutrition.meals` JSON → labelled meals in breakfast → snacks order. */
export function normalizeStoredMeals(raw: unknown): NutritionMealSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return (raw as StoredMeal[])
    .map((meal) => {
      const name = canonicalMealName(meal.name);
      const label = formatMealLabel(meal.name);
      return {
        name,
        label,
        subtitle: mealSubtitle(name, label),
        calories: meal.calories,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        entries: meal.entries ?? [],
      };
    })
    .sort((a, b) => mealSortIndex(a.name) - mealSortIndex(b.name));
}
