import {
  mapCiqualFood,
  type CiqualFood,
  type MappedGenericFood,
} from '@sharpit/app/lib/nutrition/food-log/ciqual';
import {
  normalizeFoodText,
  rankFoodsByName,
  singular,
} from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';
import table from './ciqual-foods.json';

/**
 * The Ciqual table bundled with the server (ADR-065): about 2,300 generic foods, searched in
 * memory — no database round trip, no external call. Rebuilt with `yarn api data:ciqual`.
 */

const FOODS = table as CiqualFood[];
const INDEX = FOODS.map((food) => ({ food, text: ` ${normalizeFoodText(food.name)}` }));
const BY_CODE = new Map(FOODS.map((food) => [food.code, food]));

/** Each typed word, plural or not, starts a word of the name. */
function matches(text: string, words: string[]): boolean {
  return words.every((word) => text.includes(` ${singular(word)}`));
}

/** The generic foods whose name holds every typed word, best name match first. */
export function searchCiqualFoods(query: string, limit = 5): MappedGenericFood[] {
  const words = normalizeFoodText(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const candidates = INDEX.filter((entry) => matches(entry.text, words)).map((entry) => entry.food);
  return rankFoodsByName(query, candidates).slice(0, limit).map(mapCiqualFood);
}

/** One Ciqual food by code, scored by the current formula; null when the table dropped it. */
export function ciqualFoodByCode(code: number): MappedGenericFood | null {
  const food = BY_CODE.get(code);
  return food ? mapCiqualFood(food) : null;
}
