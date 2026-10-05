import type { FoodPer100g } from './food-log-math';

/**
 * A recipe is an own food made of other foods (ADR-071): its label per 100 g is the sum of its
 * ingredients' nutrients over its weight — the weight once cooked when the athlete weighed it,
 * since cooking drives water out and concentrates everything else.
 */

export type RecipeIngredientFood = FoodPer100g & {
  saltPer100g?: number | null;
  saturatedFatPer100g?: number | null;
};

export type RecipeIngredient = { food: RecipeIngredientFood; grams: number };

export type RecipeLabel = {
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  /** Null as soon as one ingredient does not say: a partial sum would read as « low ». */
  fiberPer100g: number | null;
  sugarPer100g: number | null;
  saltPer100g: number | null;
  saturatedFatPer100g: number | null;
  /** What the dish weighs: cooked when given, else the sum of the raw ingredients. */
  totalGrams: number;
  servingGrams: number | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

type Key = keyof RecipeIngredientFood;

function total(ingredients: RecipeIngredient[], key: Key): number {
  return ingredients.reduce(
    (sum, item) => sum + ((item.food[key] as number | null | undefined) ?? 0) * (item.grams / 100),
    0,
  );
}

function totalIfKnown(ingredients: RecipeIngredient[], key: Key): number | null {
  const known = ingredients.every((item) => typeof item.food[key] === 'number');
  return known ? total(ingredients, key) : null;
}

/** The recipe's label per 100 g; null when it has no ingredient or weighs nothing. */
export function recipeLabel(
  ingredients: RecipeIngredient[],
  {
    cookedGrams = null,
    servings = null,
  }: { cookedGrams?: number | null; servings?: number | null } = {},
): RecipeLabel | null {
  const rawGrams = ingredients.reduce((sum, item) => sum + item.grams, 0);
  const totalGrams = cookedGrams && cookedGrams > 0 ? cookedGrams : rawGrams;
  if (ingredients.length === 0 || totalGrams <= 0) {
    return null;
  }
  const per100g = (amount: number) => round1((amount * 100) / totalGrams);
  const optional = (key: Key) => {
    const amount = totalIfKnown(ingredients, key);
    return amount === null ? null : per100g(amount);
  };
  return {
    kcalPer100g: per100g(total(ingredients, 'kcalPer100g')),
    proteinPer100g: per100g(total(ingredients, 'proteinPer100g')),
    carbsPer100g: per100g(total(ingredients, 'carbsPer100g')),
    fatPer100g: per100g(total(ingredients, 'fatPer100g')),
    fiberPer100g: optional('fiberPer100g'),
    sugarPer100g: optional('sugarPer100g'),
    saltPer100g: optional('saltPer100g'),
    saturatedFatPer100g: optional('saturatedFatPer100g'),
    totalGrams: round1(totalGrams),
    servingGrams: servings && servings > 0 ? round1(totalGrams / servings) : null,
  };
}
