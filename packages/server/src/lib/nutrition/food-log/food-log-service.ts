import type { FoodLogEntry, FoodProduct } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import {
  portionNutrients,
  projectFoodLogDay,
  type FoodMealKey,
  type LoggedEntry,
} from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import type { MappedFood } from '@sharpit/app/lib/nutrition/food-log/open-food-facts';
import {
  computeFoodHealth,
  FOOD_HEALTH_SCORE_VERSION,
  type FoodHealthAssessment,
} from '@sharpit/app/lib/nutrition/food-log/food-health-score';
import {
  assessDietFit,
  UNKNOWN_DIET_FACTS,
  type DietFit,
} from '@sharpit/app/lib/nutrition/food-log/food-diet-fit';
import { rankFoodsByName } from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';
import { SHARPIT_NUTRITION_PROVIDER } from '@sharpit/app/lib/nutrition/food-log/nutrition-source';
import { gramsFromPercent } from '@sharpit/app/lib/nutrition/food-log/nutrition-targets';
import type {
  CustomFoodInput,
  CustomFoodUpdateInput,
  FoodLogEntryCreateInput,
  FoodLogEntryUpdateInput,
  NutritionTargetsInput,
} from '@sharpit/app/lib/validators/food-log';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { fetchOffProduct } from './open-food-facts-client';
import type { Prisma } from '@prisma/client';

/**
 * The in-app food log (ADR-061). Entries are the source; the day's `DailyNutrition` row
 * (`provider: sharpit`) and its NUTRITION observation are recomputed from them on every change,
 * so every existing reader — page, widget, coach, analysis, FUEL — sees the log unchanged.
 */

/** OFF products are re-read after a month: brands reformulate. */
const OFF_CACHE_DAYS = 30;

/** The diets the athlete declared in the journal, as `loadDeclaredDiet` reads them. */
export type DeclaredDiets = { ids: string[]; labels: string[] };
export const NO_DIETS: DeclaredDiets = { ids: [], labels: [] };

export type ServedHealth = FoodHealthAssessment & { dietFit: DietFit[] };

export class FoodLogNotFoundError extends Error {}

export function foodLogDayDate(trainingDayId: string): Date {
  return new Date(`${trainingDayId}T00:00:00.000Z`);
}

function trainingDayIdOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asLogged(entry: FoodLogEntry): LoggedEntry {
  return {
    meal: entry.meal as FoodMealKey,
    name: entry.name,
    brand: entry.brand,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fiber: entry.fiber,
    sugar: entry.sugar,
  };
}

async function loadTargets(athleteId: string) {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: {
      nutritionTargetKcal: true,
      nutritionTargetProteinG: true,
      nutritionTargetCarbsG: true,
      nutritionTargetFatG: true,
    },
  });
  return {
    goalCalories: profile?.nutritionTargetKcal ?? null,
    goalProtein: profile?.nutritionTargetProteinG ?? null,
    goalCarbohydrates: profile?.nutritionTargetCarbsG ?? null,
    goalFat: profile?.nutritionTargetFatG ?? null,
  };
}

async function ingestDayObservation(
  athleteId: string,
  trainingDayId: string,
  entries: FoodLogEntry[],
) {
  const day = projectFoodLogDay(entries.map(asLogged));
  const targets = await loadTargets(athleteId);
  try {
    await observationEngine.ingest(athleteId, {
      type: 'NUTRITION',
      source: 'MANUAL',
      timestamp: new Date(`${trainingDayId}T12:00:00Z`),
      receivedAt: new Date(),
      energyKcal: day.calories,
      proteinG: day.protein,
      carbohydratesG: day.carbohydrates,
      fatG: day.fat,
      fiberG: day.fiber ?? undefined,
      sugarG: day.sugar ?? undefined,
      goalEnergyKcal: targets.goalCalories ?? undefined,
      goalProteinG: targets.goalProtein ?? undefined,
      goalCarbohydratesG: targets.goalCarbohydrates ?? undefined,
      goalFatG: targets.goalFat ?? undefined,
      diaryComplete: false,
      entryCount: entries.length,
    });
  } catch (error) {
    // The log is written; FUEL catches up on the next change. Never fail the athlete's write.
    console.error('[food-log] observation ingest failed:', error);
  }
}

/** Rebuilds the day's SHARPIT row from its entries; an emptied day loses its row. */
export async function recomputeFoodLogDay(athleteId: string, trainingDayId: string): Promise<void> {
  const date = foodLogDayDate(trainingDayId);
  const entries = await prisma.foodLogEntry.findMany({
    where: { athleteId, date },
    orderBy: { createdAt: 'asc' },
  });
  const key = {
    athleteId_date_provider: { athleteId, date, provider: SHARPIT_NUTRITION_PROVIDER },
  };

  if (entries.length === 0) {
    await prisma.dailyNutrition.deleteMany({
      where: { athleteId, date, provider: SHARPIT_NUTRITION_PROVIDER },
    });
    return;
  }

  const day = projectFoodLogDay(entries.map(asLogged));
  const fields = { ...day, ...(await loadTargets(athleteId)) };
  await prisma.dailyNutrition.upsert({
    where: key,
    create: { athleteId, date, provider: SHARPIT_NUTRITION_PROVIDER, ...fields },
    update: fields,
  });
  await ingestDayObservation(athleteId, trainingDayId, entries);
}

/**
 * Fill a missing / outdated Sharpit score so the day's list and search show a number,
 * not a dash, for foods logged before the score existed.
 */
async function ensureProductHealth(product: FoodProduct): Promise<FoodProduct> {
  const health = healthOf(product);
  if (health && health.scoreVersion === FOOD_HEALTH_SCORE_VERSION) {
    return product;
  }
  if (product.source === 'OFF' && product.barcode) {
    const refreshed = await findProductByBarcode(product.barcode).catch(() => null);
    if (refreshed && healthOf(refreshed)) {
      return refreshed;
    }
    // OFF unavailable: still surface a partial score from stored nutrients when possible.
    return persistPartialHealth(product);
  }
  if (product.source === 'CUSTOM') {
    return persistPartialHealth(product);
  }
  return product;
}

async function persistPartialHealth(product: FoodProduct): Promise<FoodProduct> {
  if (
    product.sugarPer100g === null &&
    product.saltPer100g === null &&
    product.saturatedFatPer100g === null
  ) {
    return product;
  }
  return prisma.foodProduct.update({
    where: { id: product.id },
    data: { health: customHealth(product) },
  });
}

/** The stored score with the athlete's diets read against it; facts are per food, fit per athlete. */
export function servedHealth(product: FoodProduct, diets: DeclaredDiets): ServedHealth | null {
  const health = healthOf(product);
  if (!health) {
    return null;
  }
  const facts = health.dietFacts ?? UNKNOWN_DIET_FACTS;
  return { ...health, dietFit: assessDietFit(facts, product.carbsPer100g, diets) };
}

export function servedProduct(product: FoodProduct, diets: DeclaredDiets) {
  return { ...product, health: servedHealth(product, diets) };
}

export async function listFoodLogDay(
  athleteId: string,
  trainingDayId: string,
  diets: DeclaredDiets = NO_DIETS,
) {
  const rows = await prisma.foodLogEntry.findMany({
    where: { athleteId, date: foodLogDayDate(trainingDayId) },
    orderBy: { createdAt: 'asc' },
    include: { product: true },
  });
  const refreshed = new Map<string, FoodProduct>();
  const uniqueProducts = [
    ...new Map(
      rows.flatMap((row) => (row.product ? [[row.product.id, row.product] as const] : [])),
    ).values(),
  ];
  await Promise.all(
    uniqueProducts.map(async (product) => {
      refreshed.set(product.id, await ensureProductHealth(product));
    }),
  );
  return rows.map(({ product, ...entry }) => {
    const resolved = product ? (refreshed.get(product.id) ?? product) : null;
    return {
      ...entry,
      health: resolved ? servedHealth(resolved, diets) : null,
    };
  });
}

async function productForEntry(athleteId: string, productId: string): Promise<FoodProduct> {
  const product = await prisma.foodProduct.findFirst({
    where: { id: productId, OR: [{ source: 'OFF' }, { ownerId: athleteId }] },
  });
  if (!product) {
    throw new FoodLogNotFoundError('Aliment introuvable');
  }
  return product;
}

function quickEntryFields(quick: NonNullable<FoodLogEntryCreateInput['quick']>) {
  return {
    productId: null,
    name: quick.name,
    brand: null,
    kcal: quick.kcal,
    protein: quick.protein,
    carbs: quick.carbs,
    fat: quick.fat,
    fiber: null,
    sugar: null,
  };
}

export async function addFoodLogEntry(athleteId: string, input: FoodLogEntryCreateInput) {
  const fields = input.productId
    ? await productEntryFields(athleteId, input.productId, input.grams)
    : quickEntryFields(input.quick!);
  const entry = await prisma.foodLogEntry.create({
    data: {
      athleteId,
      date: foodLogDayDate(input.trainingDayId),
      meal: input.meal,
      grams: input.grams,
      ...fields,
    },
  });
  await recomputeFoodLogDay(athleteId, input.trainingDayId);
  return entry;
}

async function productEntryFields(athleteId: string, productId: string, grams: number) {
  const product = await productForEntry(athleteId, productId);
  return {
    productId: product.id,
    name: product.name,
    brand: product.brand,
    ...portionNutrients(product, grams),
  };
}

async function ownedEntry(athleteId: string, id: string) {
  const entry = await prisma.foodLogEntry.findFirst({ where: { id, athleteId } });
  if (!entry) {
    throw new FoodLogNotFoundError('Entrée introuvable');
  }
  return entry;
}

/** A new portion rescales the snapshot; a quick add keeps its kcal per gram. */
async function rescaledNutrients(entry: FoodLogEntry, grams: number) {
  const product = entry.productId
    ? await prisma.foodProduct.findUnique({ where: { id: entry.productId } })
    : null;
  if (product) {
    return portionNutrients(product, grams);
  }
  const ratio = grams / entry.grams;
  const scale = (value: number | null) =>
    value === null ? null : Math.round(value * ratio * 10) / 10;
  return {
    kcal: scale(entry.kcal)!,
    protein: scale(entry.protein)!,
    carbs: scale(entry.carbs)!,
    fat: scale(entry.fat)!,
    fiber: scale(entry.fiber),
    sugar: scale(entry.sugar),
  };
}

export async function updateFoodLogEntry(
  athleteId: string,
  id: string,
  input: FoodLogEntryUpdateInput,
) {
  const entry = await ownedEntry(athleteId, id);
  const nutrients =
    input.grams !== undefined && input.grams !== entry.grams
      ? await rescaledNutrients(entry, input.grams)
      : {};
  const updated = await prisma.foodLogEntry.update({
    where: { id },
    data: { ...nutrients, grams: input.grams ?? entry.grams, meal: input.meal ?? entry.meal },
  });
  await recomputeFoodLogDay(athleteId, trainingDayIdOf(entry.date));
  return updated;
}

export async function deleteFoodLogEntry(athleteId: string, id: string): Promise<void> {
  const entry = await ownedEntry(athleteId, id);
  await prisma.foodLogEntry.delete({ where: { id } });
  await recomputeFoodLogDay(athleteId, trainingDayIdOf(entry.date));
}

function isStale(product: FoodProduct): boolean {
  return Date.now() - product.fetchedAt.getTime() > OFF_CACHE_DAYS * 24 * 60 * 60 * 1000;
}

function healthOf(product: FoodProduct): FoodHealthAssessment | null {
  const value = product.health;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as FoodHealthAssessment;
}

/** Fresh, and scored by the current formula. */
function isCurrent(product: FoodProduct): boolean {
  return !isStale(product) && healthOf(product)?.scoreVersion === FOOD_HEALTH_SCORE_VERSION;
}

/**
 * Age, an outdated score formula, or a score built from a search hit: re-read OFF. A barcode
 * read is how a search hit gets its additive list.
 */
function needsOffRefresh(product: FoodProduct): boolean {
  return product.source === 'OFF' && (!isCurrent(product) || healthOf(product)?.detail !== 'full');
}

type CustomLabel = {
  kcalPer100g?: number | null;
  proteinPer100g?: number | null;
  fiberPer100g?: number | null;
  sugarPer100g?: number | null;
  saltPer100g?: number | null;
  saturatedFatPer100g?: number | null;
};

function customHealth(label: CustomLabel): Prisma.InputJsonValue {
  return computeFoodHealth({
    kind: 'custom',
    kcalPer100g: label.kcalPer100g,
    proteinPer100g: label.proteinPer100g,
    fiberPer100g: label.fiberPer100g,
    sugarPer100g: label.sugarPer100g,
    saltPer100g: label.saltPer100g,
    saturatedFatPer100g: label.saturatedFatPer100g,
  }) as unknown as Prisma.InputJsonValue;
}

function productData(food: MappedFood) {
  return {
    name: food.name,
    brand: food.brand,
    kcalPer100g: food.kcalPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    fiberPer100g: food.fiberPer100g ?? null,
    sugarPer100g: food.sugarPer100g ?? null,
    saltPer100g: food.saltPer100g ?? null,
    saturatedFatPer100g: food.saturatedFatPer100g ?? null,
    servingGrams: food.servingGrams,
    servingLabel: food.servingLabel,
    health: food.health as unknown as Prisma.InputJsonValue,
    fetchedAt: new Date(),
  };
}

/** Cached OFF product for a barcode, read from OFF when unknown, stale, or the score formula moved. */
export async function findProductByBarcode(barcode: string): Promise<FoodProduct | null> {
  const cached = await prisma.foodProduct.findUnique({ where: { barcode } });
  if (cached && !needsOffRefresh(cached)) {
    return cached;
  }
  const food = await fetchOffProduct(barcode).catch((error) => {
    if (cached) {
      return null;
    }
    throw error;
  });
  if (!food) {
    return cached;
  }
  return prisma.foodProduct.upsert({
    where: { barcode },
    create: { source: 'OFF', barcode, ...productData(food) },
    update: productData(food),
  });
}

/**
 * OFF search results cached as products, so an entry can point at what was picked. A product
 * already current stays as stored: a search hit must not overwrite the additive list a barcode
 * read brought, and an unchanged row costs no write.
 */
export async function cacheSearchResults(foods: MappedFood[]): Promise<FoodProduct[]> {
  const stored = await prisma.foodProduct.findMany({
    where: { barcode: { in: foods.map((food) => food.barcode) } },
  });
  const current = new Map(
    stored.filter(isCurrent).map((product) => [product.barcode, product] as const),
  );
  return Promise.all(
    foods.map(
      (food) =>
        current.get(food.barcode) ??
        prisma.foodProduct.upsert({
          where: { barcode: food.barcode },
          create: { source: 'OFF', barcode: food.barcode, ...productData(food) },
          update: productData(food),
        }),
    ),
  );
}

const OWN_SEARCH_CANDIDATES = 30;
const OWN_SEARCH_RESULTS = 10;

/** The athlete's own foods matching the query, best name match first (ADR-064). */
export async function searchOwnFoods(athleteId: string, query: string) {
  const foods = await prisma.foodProduct.findMany({
    where: { ownerId: athleteId, name: { contains: query, mode: 'insensitive' } },
    orderBy: { updatedAt: 'desc' },
    take: OWN_SEARCH_CANDIDATES,
  });
  return rankFoodsByName(query, foods).slice(0, OWN_SEARCH_RESULTS);
}

export async function createCustomFood(athleteId: string, input: CustomFoodInput) {
  return prisma.foodProduct.create({
    data: {
      source: 'CUSTOM',
      ownerId: athleteId,
      name: input.name,
      brand: input.brand ?? null,
      kcalPer100g: input.kcalPer100g,
      proteinPer100g: input.proteinPer100g,
      carbsPer100g: input.carbsPer100g,
      fatPer100g: input.fatPer100g,
      fiberPer100g: input.fiberPer100g ?? null,
      sugarPer100g: input.sugarPer100g ?? null,
      saltPer100g: input.saltPer100g ?? null,
      saturatedFatPer100g: input.saturatedFatPer100g ?? null,
      servingGrams: input.servingGrams ?? null,
      health: customHealth(input),
    },
  });
}

/** The athlete's own foods, last edited first. */
export async function listOwnFoods(athleteId: string) {
  return prisma.foodProduct.findMany({
    where: { ownerId: athleteId, source: 'CUSTOM' },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });
}

async function assertOwnFood(athleteId: string, id: string) {
  const owned = await prisma.foodProduct.findFirst({
    where: { id, ownerId: athleteId, source: 'CUSTOM' },
    select: { id: true },
  });
  if (!owned) {
    throw new FoodLogNotFoundError('Aliment introuvable');
  }
}

/** Edits an own food. Entries already logged keep their snapshot; the next portions use this. */
export async function updateCustomFood(
  athleteId: string,
  id: string,
  input: CustomFoodUpdateInput,
) {
  await assertOwnFood(athleteId, id);
  const current = await prisma.foodProduct.findUniqueOrThrow({ where: { id } });
  const typed = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as CustomLabel;
  return prisma.foodProduct.update({
    where: { id },
    data: { ...input, health: customHealth({ ...current, ...typed }) },
  });
}

/** Deletes an own food; its logged entries stay, unlinked (`onDelete: SetNull`). */
export async function deleteCustomFood(athleteId: string, id: string): Promise<void> {
  await assertOwnFood(athleteId, id);
  await prisma.foodProduct.delete({ where: { id } });
}

/** The foods the athlete logged lately, newest first, one per food. */
export async function recentFoods(athleteId: string, limit = 15) {
  const entries = await prisma.foodLogEntry.findMany({
    where: { athleteId, productId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: limit * 4,
    select: { grams: true, product: true },
  });
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.product && !seen.has(entry.product.id) && seen.add(entry.product.id))
    .slice(0, limit)
    .map((entry) => ({ product: entry.product!, lastGrams: entry.grams }));
}

const TARGET_COLUMNS = {
  nutritionTargetMode: true,
  nutritionTargetKcal: true,
  nutritionTargetProteinG: true,
  nutritionTargetCarbsG: true,
  nutritionTargetFatG: true,
  nutritionTargetProteinPct: true,
  nutritionTargetCarbsPct: true,
  nutritionTargetFatPct: true,
} as const;

export async function getNutritionTargets(athleteId: string) {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: TARGET_COLUMNS,
  });
  const read = <Key extends keyof typeof TARGET_COLUMNS>(key: Key) => profile?.[key] ?? null;
  return {
    mode: read('nutritionTargetMode') ?? 'GRAMS',
    kcal: read('nutritionTargetKcal'),
    proteinG: read('nutritionTargetProteinG'),
    carbsG: read('nutritionTargetCarbsG'),
    fatG: read('nutritionTargetFatG'),
    proteinPct: read('nutritionTargetProteinPct'),
    carbsPct: read('nutritionTargetCarbsPct'),
    fatPct: read('nutritionTargetFatPct'),
  };
}

/** A calorie total split in percent, stored in grams too so every reader keeps reading grams. */
function percentTargetsData(input: NutritionTargetsInput) {
  const kcal = input.kcal!;
  const [protein, carbs, fat] = [input.proteinPct!, input.carbsPct!, input.fatPct!];
  return {
    nutritionTargetMode: 'PERCENT' as const,
    nutritionTargetKcal: kcal,
    nutritionTargetProteinPct: protein,
    nutritionTargetCarbsPct: carbs,
    nutritionTargetFatPct: fat,
    nutritionTargetProteinG: gramsFromPercent(kcal, protein, 'protein'),
    nutritionTargetCarbsG: gramsFromPercent(kcal, carbs, 'carbs'),
    nutritionTargetFatG: gramsFromPercent(kcal, fat, 'fat'),
  };
}

/** Grams as typed; leaving a split behind forgets its shares. */
function gramTargetsData(input: NutritionTargetsInput) {
  return {
    nutritionTargetMode: 'GRAMS' as const,
    nutritionTargetProteinPct: null,
    nutritionTargetCarbsPct: null,
    nutritionTargetFatPct: null,
    ...(input.kcal === undefined ? {} : { nutritionTargetKcal: input.kcal }),
    ...(input.proteinG === undefined ? {} : { nutritionTargetProteinG: input.proteinG }),
    ...(input.carbsG === undefined ? {} : { nutritionTargetCarbsG: input.carbsG }),
    ...(input.fatG === undefined ? {} : { nutritionTargetFatG: input.fatG }),
  };
}

/** Saves the targets, then gives today's logged row its new goals. */
export async function setNutritionTargets(
  athleteId: string,
  input: NutritionTargetsInput,
  trainingDayId: string,
) {
  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: input.mode === 'PERCENT' ? percentTargetsData(input) : gramTargetsData(input),
  });
  await recomputeFoodLogDay(athleteId, trainingDayId);
  return getNutritionTargets(athleteId);
}
