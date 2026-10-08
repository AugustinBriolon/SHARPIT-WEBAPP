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
  type ServedFoodHealth,
} from '@sharpit/app/lib/nutrition/food-log/food-health-score';
import {
  assessDietFit,
  UNKNOWN_DIET_FACTS,
} from '@sharpit/app/lib/nutrition/food-log/food-diet-fit';
import {
  matchesFoodQuery,
  rankFoodsByName,
} from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';
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
import type { MappedGenericFood } from '@sharpit/app/lib/nutrition/food-log/ciqual';
import { fetchOffProduct } from './open-food-facts-client';
import { ciqualFoodByCode } from './ciqual-search';
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
    // OFF unavailable: still surface a partial score from the stored label.
    return persistPartialHealth(product);
  }
  return product;
}

async function persistPartialHealth(product: FoodProduct): Promise<FoodProduct> {
  return prisma.foodProduct.update({
    where: { id: product.id },
    data: { health: customHealth(product) },
  });
}

/**
 * The current score of a product. Foods whose data lives with Sharpit are scored on every read:
 * an own food from its label (ADR-066), a Ciqual food from the bundled table (ADR-067) — so one
 * stored before a field or a formula existed reads the current score, with nothing to migrate.
 * Open Food Facts products read what their last OFF fetch stored.
 */
function currentHealth(product: FoodProduct): FoodHealthAssessment | null {
  if (product.source === 'CUSTOM') {
    return labelHealth(product);
  }
  if (product.source === 'CIQUAL' && product.ciqualCode !== null) {
    return ciqualFoodByCode(product.ciqualCode)?.health ?? healthOf(product);
  }
  return healthOf(product);
}

/** The score with the athlete's diets read against it; facts are per food, fit per athlete. */
export function servedHealth(product: FoodProduct, diets: DeclaredDiets): ServedFoodHealth | null {
  const health = currentHealth(product);
  if (!health) {
    return null;
  }
  const facts = health.dietFacts ?? UNKNOWN_DIET_FACTS;
  return { ...health, dietFit: assessDietFit(facts, product.carbsPer100g, diets) };
}

/**
 * Where a food's values come from when they are more than the crowd's (ADR-069): Ciqual's are
 * measured by ANSES, an Open Food Facts product's given by its manufacturer or checked by a
 * moderator. Null for crowd-sourced products and the athlete's own foods.
 */
export type FoodVerifiedBy = 'ciqual' | 'producer' | 'checked';

export function verifiedByOf(product: FoodProduct): FoodVerifiedBy | null {
  if (product.source === 'CIQUAL') {
    return 'ciqual';
  }
  if (product.source === 'OFF' && product.verification) {
    return product.verification === 'PRODUCER' ? 'producer' : 'checked';
  }
  return null;
}

export function servedProduct(product: FoodProduct, diets: DeclaredDiets) {
  const verifiedBy = verifiedByOf(product);
  return {
    ...product,
    health: servedHealth(product, diets),
    verified: verifiedBy !== null,
    verifiedBy,
  };
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

export async function productForEntry(athleteId: string, productId: string): Promise<FoodProduct> {
  const product = await prisma.foodProduct.findFirst({
    where: { id: productId, OR: [{ source: { in: ['OFF', 'CIQUAL'] } }, { ownerId: athleteId }] },
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

/**
 * The entry as the day lists it: with its food's score. A write answers this, so a client that
 * swaps its row for the server's echo keeps the score (it lost it on every portion change).
 */
export async function servedEntry(entry: FoodLogEntry, diets: DeclaredDiets) {
  const product = entry.productId
    ? await prisma.foodProduct.findUnique({ where: { id: entry.productId } })
    : null;
  return { ...entry, health: product ? servedHealth(product, diets) : null };
}

/** Resolves product / quick-add fields for a create, without writing. Used by batch + coach tools. */
export async function resolveFoodLogEntryCreateData(
  athleteId: string,
  input: FoodLogEntryCreateInput,
) {
  const fields = input.productId
    ? await productEntryFields(athleteId, input.productId, input.grams)
    : quickEntryFields(input.quick!);
  return {
    athleteId,
    date: foodLogDayDate(input.trainingDayId),
    meal: input.meal,
    grams: input.grams,
    ...fields,
  };
}

export async function addFoodLogEntry(
  athleteId: string,
  input: FoodLogEntryCreateInput,
  diets: DeclaredDiets = NO_DIETS,
) {
  const entry = await prisma.foodLogEntry.create({
    data: await resolveFoodLogEntryCreateData(athleteId, input),
  });
  await recomputeFoodLogDay(athleteId, input.trainingDayId);
  return servedEntry(entry, diets);
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
  diets: DeclaredDiets = NO_DIETS,
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
  return servedEntry(updated, diets);
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

export type CustomLabel = {
  kcalPer100g?: number | null;
  proteinPer100g?: number | null;
  carbsPer100g?: number | null;
  fatPer100g?: number | null;
  fiberPer100g?: number | null;
  sugarPer100g?: number | null;
  saltPer100g?: number | null;
  saturatedFatPer100g?: number | null;
};

function labelHealth(label: CustomLabel): FoodHealthAssessment {
  return computeFoodHealth({
    kind: 'custom',
    kcalPer100g: label.kcalPer100g,
    proteinPer100g: label.proteinPer100g,
    carbsPer100g: label.carbsPer100g,
    fatPer100g: label.fatPer100g,
    fiberPer100g: label.fiberPer100g,
    sugarPer100g: label.sugarPer100g,
    saltPer100g: label.saltPer100g,
    saturatedFatPer100g: label.saturatedFatPer100g,
  });
}

export function customHealth(label: CustomLabel): Prisma.InputJsonValue {
  return labelHealth(label) as unknown as Prisma.InputJsonValue;
}

/** What a cached product holds, from Open Food Facts or Ciqual alike. */
type ProductFields = Omit<MappedFood, 'barcode'> | MappedGenericFood;

function productData(food: ProductFields) {
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
    verification: 'verification' in food ? food.verification : null,
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
    foods.map((food) => {
      const kept = current.get(food.barcode);
      if (!kept) {
        return prisma.foodProduct.upsert({
          where: { barcode: food.barcode },
          create: { source: 'OFF', barcode: food.barcode, ...productData(food) },
          update: productData(food),
        });
      }
      // A current row still learns its verification, which a row stored before ADR-069 lacks.
      return kept.verification === food.verification
        ? kept
        : prisma.foodProduct.update({
            where: { id: kept.id },
            data: { verification: food.verification },
          });
    }),
  );
}

/**
 * Ciqual foods cached as products, so an entry can point at what was picked. A current row stays
 * as stored; a missing or outdated one is written from the bundled table.
 */
export async function cacheGenericFoods(foods: MappedGenericFood[]): Promise<FoodProduct[]> {
  const stored = await prisma.foodProduct.findMany({
    where: { ciqualCode: { in: foods.map((food) => food.ciqualCode) } },
  });
  const current = new Map(
    stored
      .filter((product) => healthOf(product)?.scoreVersion === FOOD_HEALTH_SCORE_VERSION)
      .map((product) => [product.ciqualCode, product] as const),
  );
  return Promise.all(
    foods.map(
      (food) =>
        current.get(food.ciqualCode) ??
        prisma.foodProduct.upsert({
          where: { ciqualCode: food.ciqualCode },
          create: { source: 'CIQUAL', ciqualCode: food.ciqualCode, ...productData(food) },
          update: productData(food),
        }),
    ),
  );
}

const OWN_FOODS_READ = 500;
const OWN_SEARCH_RESULTS = 10;

/**
 * The athlete's own foods matching the query by name or brand, plural or synonym, best match
 * first (ADR-064, ADR-069). An athlete keeps a few hundred at most: read them and match here, so
 * « skyr maison » and « maison skyr » both find « Skyr (maison) ».
 */
export async function searchOwnFoods(athleteId: string, query: string) {
  const foods = await prisma.foodProduct.findMany({
    where: { ownerId: athleteId, source: 'CUSTOM' },
    orderBy: { updatedAt: 'desc' },
    take: OWN_FOODS_READ,
  });
  const matching = foods.filter((food) => matchesFoodQuery(food, query));
  return rankFoodsByName(query, matching).slice(0, OWN_SEARCH_RESULTS);
}

/** How far back « already eaten » reaches, and how many foods it weighs. */
const EATEN_WINDOW_DAYS = 90;
const EATEN_FOODS_READ = 300;
const EATEN_SEARCH_RESULTS = 5;

export type EatenFood = { product: FoodProduct; timesEaten: number; lastGrams: number };

/**
 * The foods the athlete logged in the last 90 days that match the query, the most eaten first
 * among names that read alike (ADR-069): what MyFitnessPal lists first, and what an athlete
 * searching « skyr » most likely means.
 */
export async function searchEatenFoods(
  athleteId: string,
  query: string,
  now: Date = new Date(),
): Promise<EatenFood[]> {
  const since = new Date(now.getTime() - EATEN_WINDOW_DAYS * 86_400_000);
  const counts = await prisma.foodLogEntry.groupBy({
    by: ['productId'],
    where: { athleteId, productId: { not: null }, createdAt: { gte: since } },
    _count: { _all: true },
    orderBy: { _count: { productId: 'desc' } },
    take: EATEN_FOODS_READ,
  });
  const ids = counts.flatMap((row) => (row.productId ? [row.productId] : []));
  if (ids.length === 0) {
    return [];
  }
  const products = await prisma.foodProduct.findMany({ where: { id: { in: ids } } });
  const matching = products.filter((product) => matchesFoodQuery(product, query));
  if (matching.length === 0) {
    return [];
  }
  const times = new Map(counts.map((row) => [row.productId, row._count._all] as const));
  const ranked = rankFoodsByName(query, matching, {
    preference: (product) => times.get(product.id) ?? 0,
  }).slice(0, EATEN_SEARCH_RESULTS);
  const lastEntries = await prisma.foodLogEntry.findMany({
    where: { athleteId, productId: { in: ranked.map((product) => product.id) } },
    orderBy: { createdAt: 'desc' },
    distinct: ['productId'],
    select: { productId: true, grams: true },
  });
  const lastGrams = new Map(lastEntries.map((entry) => [entry.productId, entry.grams] as const));
  return ranked.map((product) => ({
    product,
    timesEaten: times.get(product.id) ?? 0,
    lastGrams: lastGrams.get(product.id) ?? 100,
  }));
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
