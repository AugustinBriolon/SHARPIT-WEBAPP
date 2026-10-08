import { FOOD_SYNONYMS } from './food-search-synonyms';

/**
 * Orders food search results by how the name reads against what was typed. Open Food Facts ranks
 * by popularity, so « banane » used to open on « Nectar de banane »: the athlete looking for a
 * banana should see « Banane » first, then names that start with it, then names that merely
 * contain it. Ties keep the order they came in. Decision records: ADR-064, ADR-069 (brand,
 * synonyms, preference and quality).
 */

export type RankableFood = { name: string; brand?: string | null };

/** Lowercase, accents, ligatures and punctuation off, one space between words. */
export function normalizeFoodText(text: string): string {
  return text
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** « bananes », « tomates » and « noix » read as the word typed without its plural. */
export function singular(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word;
}

function sameWord(a: string, b: string): boolean {
  return a === b || singular(a) === singular(b);
}

const TIER = {
  exact: 6,
  leadingPhrase: 5,
  leadingWord: 4,
  allWordsInOrder: 3,
  allWords: 2,
  substring: 1,
  elsewhere: 0,
} as const;

function startsWithWords(name: string[], query: string[]): boolean {
  return query.every((word, index) => {
    const candidate = name[index];
    if (candidate === undefined) {
      return false;
    }
    const isLast = index === query.length - 1;
    return sameWord(candidate, word) || (isLast && candidate.startsWith(word));
  });
}

function containsWord(name: string[], word: string): boolean {
  return name.some((candidate) => sameWord(candidate, word) || candidate.startsWith(word));
}

function inOrder(name: string[], query: string[]): boolean {
  let cursor = 0;
  for (const word of query) {
    const found = name.findIndex(
      (candidate, index) =>
        index >= cursor && (sameWord(candidate, word) || candidate.startsWith(word)),
    );
    if (found === -1) {
      return false;
    }
    cursor = found + 1;
  }
  return true;
}

function tierOf(name: string, query: string): number {
  const nameWords = name.split(' ');
  const queryWords = query.split(' ');
  if (
    nameWords.length === queryWords.length &&
    nameWords.every((word, i) => sameWord(word, queryWords[i]!))
  ) {
    return TIER.exact;
  }
  if (startsWithWords(nameWords, queryWords)) {
    return queryWords.length > 1 ? TIER.leadingPhrase : TIER.leadingWord;
  }
  if (queryWords.every((word) => containsWord(nameWords, word))) {
    return inOrder(nameWords, queryWords) ? TIER.allWordsInOrder : TIER.allWords;
  }
  return name.includes(query) ? TIER.substring : TIER.elsewhere;
}

/** The best tier the name reaches; the brand can only lift a food to « every word present ». */
function tierWithBrand(name: string, brand: string, query: string): number {
  const byName = tierOf(name, query);
  if (!brand || byName >= TIER.allWords) {
    return byName;
  }
  const byBrand = Math.max(tierOf(`${name} ${brand}`, query), tierOf(`${brand} ${name}`, query));
  return Math.max(byName, Math.min(TIER.allWords, byBrand));
}

/**
 * The query as typed, then as the tables would write it (« blanc de poulet » → « poulet filet »).
 * Every variant is folded; the first is always the query itself.
 */
export function foodQueryVariants(query: string): string[] {
  const normalized = normalizeFoodText(query);
  if (!normalized) {
    return [];
  }
  const words = normalized.split(' ');
  const variants = [normalized];
  for (const [typed, written] of FOOD_SYNONYMS) {
    const typedWords = typed.split(' ');
    for (let start = 0; start + typedWords.length <= words.length; start++) {
      const hit = typedWords.every((word, i) => sameWord(words[start + i]!, word));
      if (hit) {
        const variant = [
          ...words.slice(0, start),
          written,
          ...words.slice(start + typedWords.length),
        ].join(' ');
        if (!variants.includes(variant)) {
          variants.push(variant);
        }
        break;
      }
    }
  }
  return variants;
}

/** Each typed word, plural or not, starts a word of the name or the brand, for one variant. */
export function matchesFoodQuery(food: RankableFood, query: string): boolean {
  const text = ` ${normalizeFoodText(`${food.name} ${food.brand ?? ''}`)}`;
  return foodQueryVariants(query).some((variant) =>
    variant.split(' ').every((word) => text.includes(` ${singular(word)}`)),
  );
}

/**
 * How closely the food's name (or brand) reads against the query — same tiers as
 * `rankFoodsByName`. Used to accept or reject an auto-match (e.g. meal describe).
 */
export function foodMatchTier(food: RankableFood, query: string): number {
  const variants = foodQueryVariants(query);
  if (variants.length === 0) {
    return TIER.elsewhere;
  }
  const name = normalizeFoodText(food.name);
  const brand = normalizeFoodText(food.brand ?? '');
  return Math.max(...variants.map((variant) => tierWithBrand(name, brand, variant)));
}

/** Minimum tier for a confident auto-match on a personal food (eaten / own). */
export const FOOD_MATCH_TIER_PERSONAL = TIER.allWords;
/** Minimum tier for a confident auto-match on Ciqual. */
export const FOOD_MATCH_TIER_GENERIC = TIER.allWordsInOrder;
/** Minimum tier for a confident auto-match on Open Food Facts (noisier than Ciqual). */
export const FOOD_MATCH_TIER_OFF = TIER.allWordsInOrder;

export type RankOptions<T> = {
  /**
   * What the athlete would rather see first among names that read alike — a verified food over a
   * crowd-sourced one. Higher first; weighed after the match, before the name's length.
   */
  preference?: (food: T) => number;
  /**
   * How trustworthy the entry looks — a complete label, sold in France, scanned often. Higher
   * first; weighed after the name's length, before the source's own order.
   */
  quality?: (food: T) => number;
};

type Ranked<T> = {
  food: T;
  tier: number;
  sameLead: number;
  preference: number;
  words: number;
  quality: number;
  index: number;
};

function compare<T>(a: Ranked<T>, b: Ranked<T>): number {
  return (
    b.tier - a.tier ||
    b.sameLead - a.sameLead ||
    b.preference - a.preference ||
    a.words - b.words ||
    b.quality - a.quality ||
    a.index - b.index
  );
}

/**
 * Best match first: tier of the match (against the query or one of its synonyms, the name alone or
 * with its brand), then a name opening on the very word typed (« pâtes » before « pâté », which fold
 * to the same letters), then the athlete's preference, then the shorter name (« Banane » before
 * « Banane plantain frite »), then the entry's quality, then the original order, which carries the
 * source's own relevance.
 */
export function rankFoodsByName<T extends RankableFood>(
  query: string,
  foods: T[],
  options: RankOptions<T> = {},
): T[] {
  const variants = foodQueryVariants(query);
  if (variants.length === 0) {
    return foods;
  }
  const leads = variants.map((variant) => variant.split(' ')[0]);
  return foods
    .map((food, index) => {
      const name = normalizeFoodText(food.name);
      const brand = normalizeFoodText(food.brand ?? '');
      const words = name.split(' ');
      return {
        food,
        tier: Math.max(...variants.map((variant) => tierWithBrand(name, brand, variant))),
        sameLead: leads.includes(words[0]) ? 1 : 0,
        preference: options.preference?.(food) ?? 0,
        words: words.length,
        quality: options.quality?.(food) ?? 0,
        index,
      };
    })
    .sort(compare)
    .map((ranked) => ranked.food);
}

/**
 * One entry per product: Open Food Facts often holds the same product several times, scanned under
 * different barcodes. Same name, same brand and energy within 2 % (or 2 kcal) read as one; the
 * first kept is the best ranked.
 */
export function dedupeFoods<T extends RankableFood & { kcalPer100g: number }>(foods: T[]): T[] {
  const kept: { key: string; kcal: number; food: T }[] = [];
  for (const food of foods) {
    const key = `${normalizeFoodText(food.name)}|${normalizeFoodText(food.brand ?? '')}`;
    const twin = kept.some(
      (other) =>
        other.key === key &&
        Math.abs(other.kcal - food.kcalPer100g) <= Math.max(2, other.kcal * 0.02),
    );
    if (!twin) {
      kept.push({ key, kcal: food.kcalPer100g, food });
    }
  }
  return kept.map((entry) => entry.food);
}

/** True when `typed` and `word` differ by one letter added, removed, changed or swapped. */
export function withinOneEdit(typed: string, word: string): boolean {
  if (typed === word) {
    return true;
  }
  const [a, b] = [typed, word];
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  if (a.length === b.length) {
    const swapped = a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    return swapped || a.slice(i + 1) === b.slice(i + 1);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
