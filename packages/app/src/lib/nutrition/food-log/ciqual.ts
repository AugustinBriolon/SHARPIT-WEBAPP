import { UNKNOWN_DIET_FACTS, type DietFacts } from './food-diet-fit';
import { missingNutrientsPhrase, type FoodHighlight } from './food-health-highlights';
import { computeFoodHealth, levelFromAmount, type FoodHealthAssessment } from './food-health-score';
import { normalizeFoodText } from './food-search-ranking';

/**
 * Generic foods from the ANSES Ciqual table (ADR-065): « Banane, pulpe, crue » rather than a
 * brand's banana. Ciqual gives nutrients per 100 g and a food group, nothing about processing or
 * additives: the score reads those as unknown, except for a food Ciqual itself names raw or plainly
 * cooked.
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
/**
 * Single-ingredient sub-groups — vegetables, tubers, legumes, fruits, nuts, plain pasta, rice and
 * grains, meat, fish, seafood, eggs — where a food named raw or simply cooked is that food alone.
 */
const WHOLE_FOOD_SUBGROUPS = new Set([
  '0201',
  '0202',
  '0203',
  '0204',
  '0205',
  '0301',
  '0401',
  '0402',
  '0405',
  '0406',
  '0407',
  '0408',
  '0410',
]);
/** Raw, or cooked with nothing but heat and water (accents folded). */
const PLAIN_PREPARATION =
  /\b(crue?s?|cuite?s?|dure?s?|pochee?s?|a la coque|au plat|vapeur|bouillie?s?|grillee?s?|rotie?s?|au four)\b/;
/**
 * Anything added or industrially processed takes the food out (fried, salted, canned…); « non
 * salé » and « sans sucre » say the opposite and do not.
 */
const ADDED_OR_PROCESSED =
  /(?<!non |sans )\b(frite?s?|sautee?s?|salee?s?|sucree?s?|fumee?s?|panee?s?|appertisee?s?|conserve|poudre|preemballee?s?|sirop|confite?s?|marinee?s?|farcie?s?|sauce|beurre|huile|avec matiere grasse)\b/;

/**
 * Ciqual's own name says the food is raw or plainly cooked (« Oeuf, au plat, sans matière grasse »,
 * « Banane, pulpe, crue »): NOVA 1 and no additive, read from the name, not guessed (ADR-067).
 */
export function isWholeCiqualFood(food: Pick<CiqualFood, 'name' | 'subgroup'>): boolean {
  if (!WHOLE_FOOD_SUBGROUPS.has(food.subgroup)) {
    return false;
  }
  const name = normalizeFoodText(food.name);
  return PLAIN_PREPARATION.test(name) && !ADDED_OR_PROCESSED.test(name);
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

/** The nutrients Ciqual sometimes leaves unmeasured, which the score needs. */
export type TypicalNutrient = 'sugars' | 'saturatedFat' | 'salt';
export type TypicalValues = Partial<Record<TypicalNutrient, number>>;

const TYPICAL_NUTRIENTS: { key: TypicalNutrient; word: string }[] = [
  { key: 'sugars', word: 'sucres' },
  { key: 'saturatedFat', word: 'graisses saturées' },
  { key: 'salt', word: 'sel' },
];

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Per Ciqual sub-group, the median of each nutrient the table measured (ADR-067): what an
 * unmeasured sugar, saturated fat or salt typically is among foods of the same family.
 */
export function typicalValuesBySubgroup(foods: CiqualFood[]): Map<string, TypicalValues> {
  const bySubgroup = new Map<string, CiqualFood[]>();
  for (const food of foods) {
    bySubgroup.set(food.subgroup, [...(bySubgroup.get(food.subgroup) ?? []), food]);
  }
  return new Map(
    [...bySubgroup].map(([subgroup, members]) => [
      subgroup,
      Object.fromEntries(
        TYPICAL_NUTRIENTS.flatMap(({ key }) => {
          const value = median(members.flatMap((food) => (food[key] === null ? [] : [food[key]])));
          return value === undefined ? [] : [[key, value]];
        }),
      ) as TypicalValues,
    ]),
  );
}

/** Unmeasured nutrients filled with their family's typical value, and the note that says so. */
function withTypicalValues(
  food: CiqualFood,
  typical: TypicalValues,
): { food: CiqualFood; note: FoodHighlight | null } {
  const filled = TYPICAL_NUTRIENTS.filter(
    ({ key }) => food[key] === null && typical[key] !== undefined,
  );
  if (filled.length === 0) {
    return { food, note: null };
  }
  const words = filled.map(({ word }) => word);
  return {
    food: { ...food, ...Object.fromEntries(filled.map(({ key }) => [key, typical[key]])) },
    note: {
      key: 'typical_values',
      tone: 'neutral',
      label: 'Valeur typique',
      detail: `${missingNutrientsPhrase(words, 'non mesuré')} par l’Anses : valeur typique de sa famille`,
    },
  };
}

function ciqualHealth(measured: CiqualFood, typical: TypicalValues): FoodHealthAssessment {
  const { food, note } = withTypicalValues(measured, typical);
  const raw = isWholeCiqualFood(food);
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
      carbs: food.carbs,
      fat: food.fat,
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
    notes: note ? [note] : [],
  });
}

/**
 * A Ciqual food in the food log's shape, scored. The nutrients shown stay the measured ones; only
 * the score reads `typical` values for what Ciqual did not measure.
 */
export function mapCiqualFood(food: CiqualFood, typical: TypicalValues = {}): MappedGenericFood {
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
    health: ciqualHealth(food, typical),
  };
}
