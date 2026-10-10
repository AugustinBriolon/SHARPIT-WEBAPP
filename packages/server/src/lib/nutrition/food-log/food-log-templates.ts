import type { FoodLogEntry, Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import { mealHealth } from '@sharpit/app/lib/nutrition/food-log/meal-health-score';
import { recipeLabel } from '@sharpit/app/lib/nutrition/food-log/recipe-math';
import type {
  FoodLogCopyInput,
  RecipeInput,
  SavedMealCreateInput,
  SavedMealLogInput,
} from '@sharpit/app/lib/validators/food-log';
import {
  customHealth,
  foodLogDayDate,
  FoodLogNotFoundError,
  NO_DIETS,
  productForEntry,
  recomputeFoodLogDay,
  servedEntry,
  portionHealth,
  type DeclaredDiets,
} from './food-log-service';

/**
 * What MyFitnessPal athletes reach for every day (ADR-071): a meal eaten again (copied from
 * another day), a meal kept under a name and logged in one tap, a recipe made of other foods.
 * Every entry they write is a snapshot, like any other entry (ADR-061).
 */

/** One food of a saved meal, as it was logged. */
export type SavedMealItem = {
  productId: string | null;
  name: string;
  brand: string | null;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
};

function itemOf(entry: FoodLogEntry): SavedMealItem {
  return {
    productId: entry.productId,
    name: entry.name,
    brand: entry.brand,
    grams: entry.grams,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fiber: entry.fiber,
    sugar: entry.sugar,
  };
}

/** Writes snapshots into a day, rebuilds it once, and answers the entries as the day lists them. */
async function logItems(
  athleteId: string,
  trainingDayId: string,
  items: { meal: FoodMealKey; item: SavedMealItem }[],
  diets: DeclaredDiets,
) {
  if (items.length === 0) {
    return [];
  }
  const date = foodLogDayDate(trainingDayId);
  const products = await prisma.foodProduct.findMany({
    where: { id: { in: items.flatMap(({ item }) => (item.productId ? [item.productId] : [])) } },
    select: { id: true },
  });
  const existing = new Set(products.map((product) => product.id));
  const entries = await prisma.$transaction(
    items.map(({ meal, item }) =>
      prisma.foodLogEntry.create({
        data: {
          athleteId,
          date,
          meal,
          ...item,
          // A food deleted since still logs as it was, unlinked.
          productId: item.productId && existing.has(item.productId) ? item.productId : null,
        },
      }),
    ),
  );
  await recomputeFoodLogDay(athleteId, trainingDayId);
  return Promise.all(entries.map((entry) => servedEntry(entry, diets)));
}

/** Copies a meal (into `toMeal`, by default the same) or a whole day into another day. */
export async function copyFoodLog(
  athleteId: string,
  input: FoodLogCopyInput,
  diets: DeclaredDiets = NO_DIETS,
) {
  const source = await prisma.foodLogEntry.findMany({
    where: {
      athleteId,
      date: foodLogDayDate(input.fromTrainingDayId),
      ...(input.fromMeal ? { meal: input.fromMeal } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
  return logItems(
    athleteId,
    input.toTrainingDayId,
    source.map((entry) => ({
      meal: (input.toMeal ?? entry.meal) as FoodMealKey,
      item: itemOf(entry),
    })),
    diets,
  );
}

function itemsOf(value: Prisma.JsonValue): SavedMealItem[] {
  return Array.isArray(value) ? (value as unknown as SavedMealItem[]) : [];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** A saved meal as the clients list it: its foods, its totals and its score (ADR-070). */
async function servedSavedMeal(
  meal: { id: string; name: string; items: Prisma.JsonValue; updatedAt: Date },
  diets: DeclaredDiets,
) {
  const items = itemsOf(meal.items);
  const ids = items.flatMap((item) => (item.productId ? [item.productId] : []));
  const products = ids.length
    ? await prisma.foodProduct.findMany({ where: { id: { in: ids } } })
    : [];
  const byId = new Map(products.map((product) => [product.id, product]));
  const scorable = items.map((item) => ({
    meal: 'LUNCH' as const,
    kcal: item.kcal,
    protein: item.protein,
    fiber: item.fiber,
    health: portionHealth(item, byId.get(item.productId ?? '') ?? null, diets),
  }));
  return {
    id: meal.id,
    name: meal.name,
    items,
    kcal: Math.round(items.reduce((sum, item) => sum + item.kcal, 0)),
    protein: round1(items.reduce((sum, item) => sum + item.protein, 0)),
    carbs: round1(items.reduce((sum, item) => sum + item.carbs, 0)),
    fat: round1(items.reduce((sum, item) => sum + item.fat, 0)),
    health: mealHealth('LUNCH', scorable),
    updatedAt: meal.updatedAt,
  };
}

export type ServedSavedMeal = Awaited<ReturnType<typeof servedSavedMeal>>;

export async function listSavedMeals(athleteId: string, diets: DeclaredDiets = NO_DIETS) {
  const meals = await prisma.savedMeal.findMany({
    where: { athleteId },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
  return Promise.all(meals.map((meal) => servedSavedMeal(meal, diets)));
}

/** Keeps a logged meal under a name; an empty meal has nothing to keep. */
export async function createSavedMeal(
  athleteId: string,
  input: SavedMealCreateInput,
  diets: DeclaredDiets = NO_DIETS,
) {
  const entries = await prisma.foodLogEntry.findMany({
    where: { athleteId, date: foodLogDayDate(input.trainingDayId), meal: input.meal },
    orderBy: { createdAt: 'asc' },
  });
  if (entries.length === 0) {
    throw new FoodLogNotFoundError('Ce repas est vide');
  }
  const meal = await prisma.savedMeal.create({
    data: {
      athleteId,
      name: input.name,
      items: entries.map(itemOf) as unknown as Prisma.InputJsonValue,
    },
  });
  return servedSavedMeal(meal, diets);
}

async function ownedSavedMeal(athleteId: string, id: string) {
  const meal = await prisma.savedMeal.findFirst({ where: { id, athleteId } });
  if (!meal) {
    throw new FoodLogNotFoundError('Repas introuvable');
  }
  return meal;
}

export async function deleteSavedMeal(athleteId: string, id: string): Promise<void> {
  await ownedSavedMeal(athleteId, id);
  await prisma.savedMeal.delete({ where: { id } });
}

/** Logs a saved meal into a meal of a day; it rises to the top of the list. */
export async function logSavedMeal(
  athleteId: string,
  id: string,
  input: SavedMealLogInput,
  diets: DeclaredDiets = NO_DIETS,
) {
  const meal = await ownedSavedMeal(athleteId, id);
  const entries = await logItems(
    athleteId,
    input.trainingDayId,
    itemsOf(meal.items).map((item) => ({ meal: input.meal, item })),
    diets,
  );
  await prisma.savedMeal.update({ where: { id }, data: { updatedAt: new Date() } });
  return entries;
}

/** The recipe's label and stored description from its ingredients, read as the athlete may. */
async function recipeData(athleteId: string, input: RecipeInput) {
  const ingredients = await Promise.all(
    input.ingredients.map(async (item) => ({
      product: await productForEntry(athleteId, item.productId),
      grams: item.grams,
    })),
  );
  const label = recipeLabel(
    ingredients.map(({ product, grams }) => ({ food: product, grams })),
    { cookedGrams: input.cookedGrams ?? null, servings: input.servings ?? null },
  );
  if (!label) {
    throw new FoodLogNotFoundError('Recette sans ingrédient');
  }
  const { totalGrams, servingGrams, ...per100g } = label;
  return {
    name: input.name,
    ...per100g,
    servingGrams,
    servingLabel: input.servings && servingGrams ? `1 part · ${Math.round(servingGrams)} g` : null,
    health: customHealth(per100g),
    recipe: {
      // Each ingredient keeps its label, so the recipe is edited and previewed as it was built.
      ingredients: ingredients.map(({ product, grams }) => ({
        productId: product.id,
        name: product.name,
        brand: product.brand,
        grams,
        kcalPer100g: product.kcalPer100g,
        proteinPer100g: product.proteinPer100g,
        carbsPer100g: product.carbsPer100g,
        fatPer100g: product.fatPer100g,
        fiberPer100g: product.fiberPer100g,
        sugarPer100g: product.sugarPer100g,
        saltPer100g: product.saltPer100g,
        saturatedFatPer100g: product.saturatedFatPer100g,
      })),
      cookedGrams: input.cookedGrams ?? null,
      servings: input.servings ?? null,
      totalGrams,
    } as Prisma.InputJsonValue,
  };
}

/** A recipe is an own food (`CUSTOM`): searched, logged and scored like one. */
export async function createRecipe(athleteId: string, input: RecipeInput) {
  return prisma.foodProduct.create({
    data: { source: 'CUSTOM', ownerId: athleteId, ...(await recipeData(athleteId, input)) },
  });
}

/** Replaces a recipe's ingredients; entries already logged keep their snapshot. */
export async function updateRecipe(athleteId: string, id: string, input: RecipeInput) {
  const owned = await prisma.foodProduct.findFirst({
    where: { id, ownerId: athleteId, source: 'CUSTOM' },
    select: { id: true },
  });
  if (!owned) {
    throw new FoodLogNotFoundError('Recette introuvable');
  }
  return prisma.foodProduct.update({ where: { id }, data: await recipeData(athleteId, input) });
}
