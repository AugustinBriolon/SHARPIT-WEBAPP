import {
  mapCiqualFood,
  typicalValuesBySubgroup,
  type CiqualFood,
  type MappedGenericFood,
} from '@sharpit/app/lib/nutrition/food-log/ciqual';
import {
  foodQueryVariants,
  normalizeFoodText,
  rankFoodsByName,
  singular,
  withinOneEdit,
} from '@sharpit/app/lib/nutrition/food-log/food-search-ranking';
import table from './ciqual-foods.json';

/**
 * The Ciqual table bundled with the server (ADR-065): about 2,300 generic foods, searched in
 * memory — no database round trip, no external call. Rebuilt with `yarn api data:ciqual`.
 */

const FOODS = table as CiqualFood[];
const INDEX = FOODS.map((food) => {
  const text = ` ${normalizeFoodText(food.name)}`;
  return { food, text, words: text.trim().split(' ') };
});
const BY_CODE = new Map(FOODS.map((food) => [food.code, food]));
/** What each family typically holds, for the nutrients a food was not measured for (ADR-067). */
const TYPICAL = typicalValuesBySubgroup(FOODS);

function scored(food: CiqualFood): MappedGenericFood {
  return mapCiqualFood(food, TYPICAL.get(food.subgroup));
}

/** Each typed word, plural or not, starts a word of the name. */
function matches(text: string, words: string[]): boolean {
  return words.every((word) => text.includes(` ${singular(word)}`));
}

/** A typo tolerated: words of five letters or more may be one letter off a word of the name. */
const TYPO_MIN_LENGTH = 5;

function matchesWithTypo(nameWords: string[], words: string[]): boolean {
  return words.every((word) =>
    word.length >= TYPO_MIN_LENGTH
      ? nameWords.some((candidate) => withinOneEdit(singular(word), singular(candidate)))
      : nameWords.some((candidate) => candidate.startsWith(singular(word))),
  );
}

/** Ciqual groups for composed dishes (`01`) and infant foods (`11`): rarely what a name means. */
const SECOND_CHOICE_GROUPS = ['01', '11'];

/**
 * A food before a dish or a baby food named after it: « poulet » opens on chicken, not on
 * « Poulet basquaise »; « lait » on milk, not on « Lait 1er âge ».
 */
function plainFoodFirst(food: CiqualFood): number {
  return SECOND_CHOICE_GROUPS.some((group) => food.subgroup.startsWith(group)) ? 0 : 1;
}

/**
 * The generic foods whose name holds every typed word — as typed, or as the tables write it
 * (`FOOD_SYNONYMS`) — best name match first. Only when that finds too few does a word one letter
 * off count (« yaourth », « bannane »), ranked after the exact matches. ADR-065, ADR-069.
 */
export function searchCiqualFoods(query: string, limit = 5): MappedGenericFood[] {
  const variants = foodQueryVariants(query).map((variant) => variant.split(' '));
  if (variants.length === 0) {
    return [];
  }
  const exact = INDEX.filter((entry) => variants.some((words) => matches(entry.text, words)));
  const typo =
    exact.length >= limit
      ? []
      : INDEX.filter(
          (entry) => !exact.includes(entry) && matchesWithTypo(entry.words, variants[0]!),
        );
  const foods = (entries: typeof INDEX) => entries.map((entry) => entry.food);
  return [
    ...rankFoodsByName(query, foods(exact), { preference: plainFoodFirst }),
    ...rankFoodsByName(query, foods(typo)),
  ]
    .slice(0, limit)
    .map(scored);
}

/** One Ciqual food by code, scored by the current formula; null when the table dropped it. */
export function ciqualFoodByCode(code: number): MappedGenericFood | null {
  const food = BY_CODE.get(code);
  return food ? scored(food) : null;
}
