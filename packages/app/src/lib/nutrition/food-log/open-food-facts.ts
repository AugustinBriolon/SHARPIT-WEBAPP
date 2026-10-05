import type { FoodPer100g } from './food-log-math';
import { dietFactsFromOff } from './food-diet-fit';
import {
  computeFoodHealth,
  levelFromAmount,
  type FoodHealthAssessment,
  type HealthDetail,
  type NutrientFlags,
  type NutrientLevel,
  type NutriScoreLetter,
} from './food-health-score';

/**
 * Open Food Facts products → the food log's shape (ADR-061). Data © Open Food Facts
 * contributors, ODbL: shown with its attribution wherever a product is picked.
 */

export const OPEN_FOOD_FACTS_ATTRIBUTION = 'Données Open Food Facts (ODbL)';

/** The fields asked of OFF, for a barcode read and a search alike. */
export const OFF_FIELDS = [
  'code',
  'product_name',
  'product_name_fr',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'nutriscore_grade',
  'nutriscore_score',
  'nova_group',
  'nutrient_levels',
  'additives_tags',
  'additives_n',
  'ingredients_n',
  'ingredients_analysis_tags',
  'allergens_tags',
  'traces_tags',
  'labels_tags',
  'categories_tags',
] as const;

export type OffNutriments = Partial<Record<string, number | string>>;

export type OffNutrientLevels = Partial<
  Record<'fat' | 'salt' | 'saturated-fat' | 'sugars', string>
>;

export type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string | string[];
  nutriments?: OffNutriments;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriscore_grade?: string;
  nutriscore_score?: number | string;
  nova_group?: number | string;
  nutrient_levels?: OffNutrientLevels;
  additives_tags?: string[];
  additives_n?: number | string;
  ingredients_n?: number | string;
  ingredients_analysis_tags?: string[];
  allergens_tags?: string[];
  traces_tags?: string[];
  labels_tags?: string[];
  categories_tags?: string[];
};

export type MappedFood = FoodPer100g & {
  barcode: string;
  name: string;
  brand: string | null;
  servingGrams: number | null;
  servingLabel: string | null;
  saltPer100g: number | null;
  saturatedFatPer100g: number | null;
  health: FoodHealthAssessment;
};

function numberOf(value: unknown): number | null {
  const parsed = signedNumberOf(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/** Nutri-Score points go below zero. */
function signedNumberOf(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function tagsOf(value: unknown): string[] | null {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === 'string')
    : null;
}

const BEVERAGE_CATEGORY = 'en:beverages';
const SPORTS_CATEGORIES = [
  'en:sports-nutrition',
  'en:energy-gels',
  'en:sports-drinks',
  'en:energy-bars-for-sport',
];

function hasCategory(product: OffProduct, wanted: string[]): boolean {
  return (tagsOf(product.categories_tags) ?? []).some((category) => wanted.includes(category));
}

/**
 * The additive list when OFF gave it. OFF's search index carries only the count, and a product
 * with no readable ingredients has neither — that is « unknown », not « no additive ».
 */
function additiveFacts(product: OffProduct): { tags: string[] | null; count: number | null } {
  const ingredientsRead = (numberOf(product.ingredients_n) ?? 0) > 0;
  const tags = tagsOf(product.additives_tags);
  if (tags && (tags.length > 0 || ingredientsRead)) {
    return { tags, count: tags.length };
  }
  const count = numberOf(product.additives_n);
  return { tags: null, count: ingredientsRead || (count ?? 0) > 0 ? count : null };
}

/** kcal per 100 g, from kJ when OFF only carries energy in kJ. */
function kcalPer100g(nutriments: OffNutriments): number | null {
  const kcal = numberOf(nutriments['energy-kcal_100g']);
  if (kcal !== null) {
    return kcal;
  }
  const kj = numberOf(nutriments['energy-kj_100g']) ?? numberOf(nutriments['energy_100g']);
  return kj === null ? null : Math.round(kj / 4.184);
}

function firstBrand(brands: OffProduct['brands']): string | null {
  const list = Array.isArray(brands) ? brands : (brands ?? '').split(',');
  const brand = list.map((item) => item.trim()).find(Boolean);
  return brand ?? null;
}

function asNutriScore(value: unknown): NutriScoreLetter | null {
  if (typeof value !== 'string') {
    return null;
  }
  const letter = value.trim().toLowerCase();
  return letter === 'a' || letter === 'b' || letter === 'c' || letter === 'd' || letter === 'e'
    ? letter
    : null;
}

function asNova(value: unknown): 1 | 2 | 3 | 4 | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

function asLevel(value: unknown): NutrientLevel {
  return value === 'low' || value === 'moderate' || value === 'high' ? value : 'unknown';
}

function nutrientFlagsFromOff(
  levels: OffNutrientLevels | undefined,
  nutriments: OffNutriments,
): NutrientFlags {
  return {
    sugars:
      asLevel(levels?.sugars) !== 'unknown'
        ? asLevel(levels?.sugars)
        : levelFromAmount('sugars', numberOf(nutriments['sugars_100g'])),
    salt:
      asLevel(levels?.salt) !== 'unknown'
        ? asLevel(levels?.salt)
        : levelFromAmount('salt', numberOf(nutriments['salt_100g'])),
    saturatedFat:
      asLevel(levels?.['saturated-fat']) !== 'unknown'
        ? asLevel(levels?.['saturated-fat'])
        : levelFromAmount('saturatedFat', numberOf(nutriments['saturated-fat_100g'])),
  };
}

function healthOf(
  product: OffProduct,
  food: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number | null;
    sugars: number | null;
  },
  detail: HealthDetail,
): FoodHealthAssessment {
  const nutriments = product.nutriments ?? {};
  const additives = additiveFacts(product);
  return computeFoodHealth({
    nutriScore: asNutriScore(product.nutriscore_grade),
    nutriScorePoints: signedNumberOf(product.nutriscore_score),
    isBeverage: hasCategory(product, [BEVERAGE_CATEGORY]),
    isSportsNutrition: hasCategory(product, SPORTS_CATEGORIES),
    nova: asNova(product.nova_group),
    nutrientLevels: nutrientFlagsFromOff(product.nutrient_levels, nutriments),
    nutrients: {
      kcal: food.kcal,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      sugars: food.sugars,
      salt: numberOf(nutriments['salt_100g']),
      saturatedFat: numberOf(nutriments['saturated-fat_100g']),
      fruitVegetableShare: numberOf(
        nutriments['fruits-vegetables-legumes-estimate-from-ingredients_100g'],
      ),
    },
    additiveTags: additives.tags,
    additiveCount: additives.count,
    dietFacts: dietFactsFromOff({
      ingredientsAnalysis: tagsOf(product.ingredients_analysis_tags),
      allergens: tagsOf(product.allergens_tags),
      traces: tagsOf(product.traces_tags),
      labels: tagsOf(product.labels_tags),
      categories: tagsOf(product.categories_tags),
      ingredientCount: numberOf(product.ingredients_n),
    }),
    detail,
  });
}

/**
 * A product the log can use, or null: no name or no energy and macros means a half-filled OFF
 * entry, and logging it would show a meal as zero. `detail` says whether OFF answered with the
 * whole product (barcode read) or a search hit, which lacks the additive list.
 */
export function mapOffProduct(
  product: OffProduct,
  detail: HealthDetail = 'full',
): MappedFood | null {
  const nutriments = product.nutriments ?? {};
  const name = (product.product_name_fr || product.product_name || '').trim();
  const kcal = kcalPer100g(nutriments);
  const protein = numberOf(nutriments['proteins_100g']);
  const carbs = numberOf(nutriments['carbohydrates_100g']);
  const fat = numberOf(nutriments['fat_100g']);
  if (
    !product.code ||
    !name ||
    kcal === null ||
    protein === null ||
    carbs === null ||
    fat === null
  ) {
    return null;
  }
  const servingGrams = numberOf(product.serving_quantity);
  const sugarPer100g = numberOf(nutriments['sugars_100g']);
  const saltPer100g = numberOf(nutriments['salt_100g']);
  const saturatedFatPer100g = numberOf(nutriments['saturated-fat_100g']);
  const fiberPer100g = numberOf(nutriments['fiber_100g']);
  return {
    barcode: product.code,
    name,
    brand: firstBrand(product.brands),
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbsPer100g: carbs,
    fatPer100g: fat,
    fiberPer100g,
    sugarPer100g,
    saltPer100g,
    saturatedFatPer100g,
    servingGrams: servingGrams && servingGrams > 0 ? servingGrams : null,
    servingLabel: product.serving_size?.trim() || null,
    health: healthOf(
      product,
      { kcal, protein, carbs, fat, fiber: fiberPer100g, sugars: sugarPer100g },
      detail,
    ),
  };
}

/** EAN-8, UPC-A, EAN-13 and GTIN-14: digits only, the lengths a scanner reads. */
export function isBarcode(value: string): boolean {
  return /^(\d{8}|\d{12,14})$/.test(value);
}
