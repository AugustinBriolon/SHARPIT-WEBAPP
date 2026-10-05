import type {
  FoodProductPayload,
  RecipeIngredientPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import { recipeLabel, type RecipeLabel } from '@sharpit/app/lib/nutrition/food-log/recipe-math';
import { recipeSchema, type RecipeInput } from '@sharpit/app/lib/validators/food-log';
import { parseDecimal, type FormResult } from '@/components/nutrition/food-log/food-log-forms';

/**
 * The recipe being built (ADR-071): its ingredients with their label, the grams typed for each,
 * the cooked weight and the servings. Pure, so the arithmetic the athlete sees is tested.
 */

export type RecipeDraftIngredient = { food: RecipeIngredientPayload; grams: string };

export type RecipeDraft = {
  name: string;
  ingredients: RecipeDraftIngredient[];
  cookedGrams: string;
  servings: string;
};

const DEFAULT_INGREDIENT_GRAMS = 100;

const field = (value: number | null | undefined) => (value ? String(value) : '');

/** A blank draft, or the recipe being edited as it was saved. */
export function recipeDraftFrom(product: FoodProductPayload | null): RecipeDraft {
  const recipe = product?.recipe;
  return {
    name: product?.name ?? '',
    ingredients: recipe?.ingredients.map((food) => ({ food, grams: String(food.grams) })) ?? [],
    cookedGrams: field(recipe?.cookedGrams),
    servings: field(recipe?.servings),
  };
}

function ingredientOf(product: FoodProductPayload): RecipeIngredientPayload {
  return {
    productId: product.id,
    name: product.name,
    brand: product.brand ?? null,
    grams: product.servingGrams ?? DEFAULT_INGREDIENT_GRAMS,
    kcalPer100g: product.kcalPer100g,
    proteinPer100g: product.proteinPer100g,
    carbsPer100g: product.carbsPer100g,
    fatPer100g: product.fatPer100g,
    fiberPer100g: product.fiberPer100g ?? null,
    sugarPer100g: product.sugarPer100g ?? null,
    saltPer100g: product.saltPer100g ?? null,
    saturatedFatPer100g: product.saturatedFatPer100g ?? null,
  };
}

/** A food picked again is not added twice: its line stays, the athlete changes its grams. */
export function withIngredient(draft: RecipeDraft, product: FoodProductPayload): RecipeDraft {
  if (draft.ingredients.some((item) => item.food.productId === product.id)) {
    return draft;
  }
  const food = ingredientOf(product);
  return { ...draft, ingredients: [...draft.ingredients, { food, grams: String(food.grams) }] };
}

export function withIngredientGrams(
  draft: RecipeDraft,
  productId: string,
  grams: string,
): RecipeDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.map((item) =>
      item.food.productId === productId ? { ...item, grams } : item,
    ),
  };
}

export function withoutIngredient(draft: RecipeDraft, productId: string): RecipeDraft {
  return {
    ...draft,
    ingredients: draft.ingredients.filter((item) => item.food.productId !== productId),
  };
}

/** The label as the server will compute it, live; null until an ingredient weighs something. */
export function recipeDraftPreview(draft: RecipeDraft): RecipeLabel | null {
  const ingredients = draft.ingredients.flatMap((item) => {
    const grams = parseDecimal(item.grams);
    return grams && grams > 0 ? [{ food: item.food, grams }] : [];
  });
  const cooked = parseDecimal(draft.cookedGrams);
  const servings = parseDecimal(draft.servings);
  return recipeLabel(ingredients, {
    cookedGrams: cooked && cooked > 0 ? cooked : null,
    servings: servings && servings >= 1 ? Math.round(servings) : null,
  });
}

/** The draft checked against the server's schema, with the reason in French when it fails. */
export function buildRecipeInput(draft: RecipeDraft): FormResult<RecipeInput> {
  if (!draft.name.trim()) {
    return { ok: false, message: 'Donne un nom à ta recette.' };
  }
  if (draft.ingredients.length === 0) {
    return { ok: false, message: 'Ajoute au moins un ingrédient.' };
  }
  const blank = draft.ingredients.find((item) => !(Number(parseDecimal(item.grams)) > 0));
  if (blank) {
    return { ok: false, message: `Indique les grammes de « ${blank.food.name} ».` };
  }
  const parsed = recipeSchema.safeParse({
    name: draft.name,
    ingredients: draft.ingredients.map((item) => ({
      productId: item.food.productId,
      grams: parseDecimal(item.grams),
    })),
    cookedGrams: parseDecimal(draft.cookedGrams),
    servings: parseDecimal(draft.servings),
  });
  if (!parsed.success) {
    const path = String(parsed.error.issues[0]?.path[0] ?? '');
    const messages: Record<string, string> = {
      cookedGrams: 'Vérifie le poids une fois cuit.',
      servings: 'Le nombre de parts va de 1 à 50.',
      ingredients: 'Une recette compte 50 ingrédients au plus, de 5 kg chacun au plus.',
    };
    return { ok: false, message: messages[path] ?? 'Vérifie la recette.' };
  }
  return { ok: true, value: parsed.data };
}
