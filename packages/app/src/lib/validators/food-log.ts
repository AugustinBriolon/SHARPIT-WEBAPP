import { z } from 'zod';
import { FOOD_MEALS } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import {
  NUTRITION_TARGET_MODES,
  percentTotal,
} from '@sharpit/app/lib/nutrition/food-log/nutrition-targets';

const trainingDayId = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const grams = z.coerce.number().positive().max(5000);
const per100g = z.coerce.number().min(0).max(1000);

/** A new entry: a known product (scanned, searched, own) or a quick add typed in by hand. */
export const foodLogEntryCreateSchema = z
  .object({
    trainingDayId,
    meal: z.enum(FOOD_MEALS),
    grams,
    productId: z.string().min(1).optional(),
    quick: z
      .object({
        name: z.string().trim().min(1).max(120),
        kcal: z.coerce.number().min(0).max(10000),
        protein: z.coerce.number().min(0).max(1000).default(0),
        carbs: z.coerce.number().min(0).max(1000).default(0),
        fat: z.coerce.number().min(0).max(1000).default(0),
      })
      .optional(),
  })
  .refine((value) => Boolean(value.productId) !== Boolean(value.quick), {
    message: 'Un aliment ou une saisie rapide, pas les deux.',
  });

export const foodLogEntryUpdateSchema = z
  .object({ grams: grams.optional(), meal: z.enum(FOOD_MEALS).optional() })
  .refine((value) => value.grams !== undefined || value.meal !== undefined, {
    message: 'Rien à modifier.',
  });

export const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).nullable().optional(),
  kcalPer100g: z.coerce.number().min(0).max(1000),
  proteinPer100g: per100g,
  carbsPer100g: per100g,
  fatPer100g: per100g,
  fiberPer100g: per100g.nullable().optional(),
  sugarPer100g: per100g.nullable().optional(),
  saltPer100g: per100g.nullable().optional(),
  saturatedFatPer100g: per100g.nullable().optional(),
  servingGrams: grams.nullable().optional(),
});

/** An edit of the athlete's own food: any of its fields. */
export const customFoodUpdateSchema = customFoodSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Rien à modifier.' });

const meal = z.enum(FOOD_MEALS);

/**
 * Logs again what was eaten another day (ADR-071): one meal into a meal of the target day, or the
 * whole day, each meal into itself.
 */
export const foodLogCopySchema = z
  .object({
    fromTrainingDayId: trainingDayId,
    toTrainingDayId: trainingDayId,
    fromMeal: meal.optional(),
    toMeal: meal.optional(),
  })
  .refine((value) => value.toMeal === undefined || value.fromMeal !== undefined, {
    message: 'Une journée entière se copie repas par repas.',
  });

/** Keeps a logged meal to log it again in one tap. */
export const savedMealCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  trainingDayId,
  meal,
});

/** Logs a saved meal into a meal of a day. */
export const savedMealLogSchema = z.object({ trainingDayId, meal });

/** An own food made of other foods, weighed raw; the cooked weight and servings are optional. */
export const recipeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  ingredients: z
    .array(z.object({ productId: z.string().min(1), grams }))
    .min(1)
    .max(50),
  cookedGrams: z.coerce.number().positive().max(20000).nullable().optional(),
  servings: z.coerce.number().int().min(1).max(50).nullable().optional(),
});

const target = (max: number) => z.coerce.number().min(0).max(max).nullable().optional();
const percent = z.coerce.number().int().min(0).max(100).optional();

/**
 * The athlete's own daily targets; null clears one. `PERCENT` splits the calorie target, so it
 * needs the calories and three shares that add up to exactly 100. No mode reads as `GRAMS`.
 */
export const nutritionTargetsSchema = z
  .object({
    mode: z.enum(NUTRITION_TARGET_MODES).optional(),
    kcal: z.coerce.number().int().min(800).max(8000).nullable().optional(),
    proteinG: target(600),
    carbsG: target(1500),
    fatG: target(500),
    proteinPct: percent,
    carbsPct: percent,
    fatPct: percent,
  })
  .superRefine((value, context) => {
    if (value.mode !== 'PERCENT') {
      return;
    }
    if (value.kcal === null || value.kcal === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['kcal'],
        message: 'Indique les calories pour les répartir en %.',
      });
    }
    const shares = [value.proteinPct, value.carbsPct, value.fatPct];
    if (shares.some((share) => share === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['proteinPct'],
        message: 'Indique les trois pourcentages.',
      });
      return;
    }
    const total = percentTotal(shares);
    if (total !== 100) {
      context.addIssue({
        code: 'custom',
        path: ['fatPct'],
        message: `La répartition fait ${total} %, elle doit faire 100 %.`,
      });
    }
  });

export type FoodLogEntryCreateInput = z.infer<typeof foodLogEntryCreateSchema>;
export type FoodLogEntryUpdateInput = z.infer<typeof foodLogEntryUpdateSchema>;
export type CustomFoodInput = z.infer<typeof customFoodSchema>;
export type CustomFoodUpdateInput = z.infer<typeof customFoodUpdateSchema>;
export type NutritionTargetsInput = z.infer<typeof nutritionTargetsSchema>;
export type FoodLogCopyInput = z.infer<typeof foodLogCopySchema>;
export type SavedMealCreateInput = z.infer<typeof savedMealCreateSchema>;
export type SavedMealLogInput = z.infer<typeof savedMealLogSchema>;
export type RecipeInput = z.infer<typeof recipeSchema>;
