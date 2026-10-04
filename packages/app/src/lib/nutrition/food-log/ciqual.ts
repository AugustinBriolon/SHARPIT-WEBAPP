import { UNKNOWN_DIET_FACTS, type DietFacts } from './food-diet-fit';
import { computeFoodHealth, levelFromAmount, type FoodHealthAssessment } from './food-health-score';

/**
 * Generic foods from the ANSES Ciqual table (ADR-065): « Banane, pulpe, crue » rather than a
 * brand's banana. Ciqual gives nutrients per 100 g and a food group, nothing about processing or
 * additives: the score reads those as unknown, except for a food Ciqual itself names raw.
 * Data: Table de composition nutritionnelle des aliments Ciqual, Anses — Licence Ouverte Etalab.
 */

export const CIQUAL_ATTRIBUTION = 'Table Ciqual 2020, Anses (Licence Ouverte)';

/** One Ciqual food as stored in the bundled table. Amounts per 100 g, null when not measured. */
export type CiqualFood = {
  code: number;
  name: string;
  /** Ciqual sub-group code, e.g. `0204` for fruits. */
  subgroup: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugars: number | null;
  salt: number | null;
  saturatedFat: number | null;
};

export type MappedGenericFood = {
  ciqualCode: number;
  name: string;
  brand: null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  sugarPer100g: number | null;
  saltPer100g: number | null;
  saturatedFatPer100g: number | null;
  servingGrams: null;
  servingLabel: null;
  health: FoodHealthAssessment;
};

/**
 * A Ciqual amount: « 12,5 », « traces » (0), « < 0,5 » (half the bound, the usual midpoint), or
 * « - » / empty (not measured → null).
 */
export function parseCiqualAmount(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '' || text === '-') {
    return null;
  }
  if (text.toLowerCase() === 'traces') {
    return 0;
  }
  const bound = text.match(/^<\s*([\d.]+)$/);
  const value = bound ? Number(bound[1]) / 2 : Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Fruits, vegetables and legumes: the Nutri-Score counts them whole. */
const FRUIT_VEGETABLE_SUBGROUPS = new Set(['0201', '0203', '0204']);
/** Plant foods with nothing else in them: vegetables, tubers, legumes, fruits, nuts, plant oils. */
const PLANT_SUBGROUPS = new Set(['0201', '0202', '0203', '0204', '0205', '0902']);
/** Meat, fish, seafood and their products. */
const FLESH_SUBGROUPS = new Set([
  '0401',
  '0402',
  '0403',
  '0404',
  '0405',
  '0406',
  '0407',
  '0408',
  '0409',
]);
const EGG_SUBGROUP = '0410';
/** Milks, fresh dairy, cream, butter. Cheese is apart: animal rennet makes it maybe-vegetarian. */
const DAIRY_SUBGROUPS = new Set(['0501', '0502', '0504', '0901']);
const CHEESE_SUBGROUP = '0503';
const BEVERAGE_GROUP = '06';
/** Sub-groups where a food named « cru » is the raw food itself: one ingredient, nothing added. */
const RAW_CAPABLE_SUBGROUPS = new Set([
  '0201',
  '0202',
  '0203',
  '0204',
  '0205',
  '0402',
  '0406',
  '0408',
  '0410',
]);
const RAW_WORD = /\bcrue?s?\b/i;

/** Ciqual's own name says it is raw: NOVA 1 and no additive, read from the label, not guessed. */
export function isRawCiqualFood(food: Pick<CiqualFood, 'name' | 'subgroup'>): boolean {
  return RAW_CAPABLE_SUBGROUPS.has(food.subgroup) && RAW_WORD.test(food.name);
}

export function ciqualDietFacts(subgroup: string): DietFacts {
  if (PLANT_SUBGROUPS.has(subgroup)) {
    return { vegan: 'yes', vegetarian: 'yes', gluten: 'absent', milk: 'absent' };
  }
  if (FLESH_SUBGROUPS.has(subgroup)) {
    return { ...UNKNOWN_DIET_FACTS, vegan: 'no', vegetarian: 'no' };
  }
  if (subgroup === EGG_SUBGROUP) {
    return { ...UNKNOWN_DIET_FACTS, vegan: 'no', vegetarian: 'yes', milk: 'absent' };
  }
  if (DAIRY_SUBGROUPS.has(subgroup)) {
    return { ...UNKNOWN_DIET_FACTS, vegan: 'no', vegetarian: 'yes', milk: 'contains' };
  }
  if (subgroup === CHEESE_SUBGROUP) {
    return { ...UNKNOWN_DIET_FACTS, vegan: 'no', vegetarian: 'maybe', milk: 'contains' };
  }
  return UNKNOWN_DIET_FACTS;
}

function ciqualHealth(food: CiqualFood): FoodHealthAssessment {
  const raw = isRawCiqualFood(food);
  return computeFoodHealth({
    nutriScore: null,
    nutriScorePoints: null,
    isBeverage: food.subgroup.startsWith(BEVERAGE_GROUP),
    isSportsNutrition: false,
    nova: raw ? 1 : null,
    nutrientLevels: {
      sugars: levelFromAmount('sugars', food.sugars),
      salt: levelFromAmount('salt', food.salt),
      saturatedFat: levelFromAmount('saturatedFat', food.saturatedFat),
    },
    nutrients: {
      kcal: food.kcal,
      protein: food.protein,
      fiber: food.fiber,
      sugars: food.sugars,
      salt: food.salt,
      saturatedFat: food.saturatedFat,
      fruitVegetableShare: FRUIT_VEGETABLE_SUBGROUPS.has(food.subgroup) ? 100 : null,
    },
    additiveTags: raw ? [] : null,
    additiveCount: raw ? 0 : null,
    dietFacts: ciqualDietFacts(food.subgroup),
    detail: 'full',
  });
}

/** A Ciqual food in the food log's shape, scored. */
export function mapCiqualFood(food: CiqualFood): MappedGenericFood {
  return {
    ciqualCode: food.code,
    name: food.name,
    brand: null,
    kcalPer100g: food.kcal,
    proteinPer100g: food.protein,
    carbsPer100g: food.carbs,
    fatPer100g: food.fat,
    fiberPer100g: food.fiber,
    sugarPer100g: food.sugars,
    saltPer100g: food.salt,
    saturatedFatPer100g: food.saturatedFat,
    servingGrams: null,
    servingLabel: null,
    health: ciqualHealth(food),
  };
}
