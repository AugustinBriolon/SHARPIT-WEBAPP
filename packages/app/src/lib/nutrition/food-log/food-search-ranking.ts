/**
 * Orders food search results by how the name reads against what was typed. Open Food Facts ranks
 * by popularity, so « banane » used to open on « Nectar de banane »: the athlete looking for a
 * banana should see « Banane » first, then names that start with it, then names that merely
 * contain it. Ties keep the order they came in. Decision record: ADR-064.
 */

export type RankableFood = { name: string };

/** Lowercase, accents and punctuation off, one space between words. */
export function normalizeFoodText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** « bananes », « tomates » and « noix » read as the word typed without its plural. */
function singular(word: string): string {
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

type Ranked<T> = { food: T; tier: number; words: number; index: number };

function compare<T>(a: Ranked<T>, b: Ranked<T>): number {
  return b.tier - a.tier || a.words - b.words || a.index - b.index;
}

/**
 * Best match first: tier of the match, then the shorter name (« Banane » before « Banane plantain
 * frite »), then the original order, which carries the source's own relevance.
 */
export function rankFoodsByName<T extends RankableFood>(query: string, foods: T[]): T[] {
  const normalizedQuery = normalizeFoodText(query);
  if (!normalizedQuery) {
    return foods;
  }
  return foods
    .map((food, index) => {
      const name = normalizeFoodText(food.name);
      return { food, tier: tierOf(name, normalizedQuery), words: name.split(' ').length, index };
    })
    .sort(compare)
    .map((ranked) => ranked.food);
}
