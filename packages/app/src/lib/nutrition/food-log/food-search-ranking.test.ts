import { describe, expect, it } from 'vitest';
import {
  dedupeFoods,
  foodQueryVariants,
  matchesFoodQuery,
  normalizeFoodText,
  rankFoodsByName,
  withinOneEdit,
} from './food-search-ranking';

function names(query: string, list: string[]): string[] {
  return rankFoodsByName(
    query,
    list.map((name) => ({ name })),
  ).map((food) => food.name);
}

describe('rankFoodsByName', () => {
  it('puts the banana before the banana nectar', () => {
    expect(
      names('banane', [
        'Nectar de banane',
        'Bananes bio',
        'Le tropical nectar de banane',
        'Banane',
        'Paquito Pom Banan SSUCRE4',
      ]),
    ).toEqual([
      'Banane',
      'Bananes bio',
      'Nectar de banane',
      'Le tropical nectar de banane',
      'Paquito Pom Banan SSUCRE4',
    ]);
  });

  it('ignores accents, case and plurals', () => {
    expect(names('Pâtes', ['Sauce pour pâtes', 'PATES completes', 'pates'])).toEqual([
      'pates',
      'PATES completes',
      'Sauce pour pâtes',
    ]);
  });

  it('reads the last word as a prefix while typing', () => {
    expect(
      names('yaourt na', ['Yaourt grec', 'Yaourt nature', 'Fromage blanc yaourt nature']),
    ).toEqual(['Yaourt nature', 'Fromage blanc yaourt nature', 'Yaourt grec']);
  });

  it('prefers words in the typed order, and keeps the source order on ties', () => {
    expect(
      names('riz complet', [
        'Galettes de complet riz',
        'Riz basmati complet',
        'Riz complet',
        'Riz complet bio',
      ]),
    ).toEqual(['Riz complet', 'Riz complet bio', 'Riz basmati complet', 'Galettes de complet riz']);
  });

  it('puts the very word typed before one that only folds to it', () => {
    expect(names('pates', ['Pâté breton', 'Pâtes alimentaires, cuites'])).toEqual([
      'Pâtes alimentaires, cuites',
      'Pâté breton',
    ]);
  });

  it('keeps the order when the query is empty', () => {
    expect(names('  ', ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('rankFoodsByName — brand, synonyms, preference and quality (ADR-069)', () => {
  it('lets the brand lift a food that the name alone does not match', () => {
    const foods = [
      { name: 'Skyr nature', brand: 'Isey' },
      { name: 'Skyr nature', brand: 'Danone' },
      { name: 'Yaourt danone', brand: null },
    ];
    expect(rankFoodsByName('skyr danone', foods)).toEqual([foods[1], foods[0], foods[2]]);
  });

  it('ranks a food by the best way of saying the query', () => {
    expect(names('blanc de poulet', ['Poulet, cuisse, crue', 'Poulet, filet, cru'])).toEqual([
      'Poulet, filet, cru',
      'Poulet, cuisse, crue',
    ]);
  });

  it('weighs preference before the name length, quality after it', () => {
    const foods = [
      { name: 'Skyr nature bio', verified: false, complete: true },
      { name: 'Skyr nature', verified: false, complete: false },
      { name: 'Skyr nature brassé', verified: true, complete: false },
      { name: 'Skyr nature', verified: false, complete: true },
    ];
    const ranked = rankFoodsByName('skyr', foods, {
      preference: (food) => (food.verified ? 1 : 0),
      quality: (food) => (food.complete ? 1 : 0),
    });
    expect(ranked).toEqual([foods[2], foods[3], foods[1], foods[0]]);
  });
});

describe('foodQueryVariants', () => {
  it('adds the way the tables write a phrase, keeping the query first', () => {
    expect(foodQueryVariants('Blancs de poulet grillés')).toEqual([
      'blancs de poulet grilles',
      'poulet filet grilles',
    ]);
    expect(foodQueryVariants('banane')).toEqual(['banane']);
    expect(foodQueryVariants('  ')).toEqual([]);
  });
});

describe('matchesFoodQuery', () => {
  it('needs every word, in the name or the brand, plural or synonym', () => {
    expect(matchesFoodQuery({ name: 'Skyr', brand: 'Danone' }, 'danone skyrs')).toBe(true);
    expect(matchesFoodQuery({ name: 'Poulet, filet, cru' }, 'filet de poulet')).toBe(true);
    expect(matchesFoodQuery({ name: 'Skyr', brand: 'Danone' }, 'skyr fraise')).toBe(false);
  });
});

describe('dedupeFoods', () => {
  it('keeps the first of a product listed twice, not a lighter version', () => {
    const foods = [
      { name: 'Skyr nature', brand: 'Isey', kcalPer100g: 62, id: 1 },
      { name: 'SKYR Nature', brand: 'isey', kcalPer100g: 63, id: 2 },
      { name: 'Skyr nature', brand: 'Isey', kcalPer100g: 45, id: 3 },
      { name: 'Skyr nature', brand: 'Siggi', kcalPer100g: 62, id: 4 },
    ];
    expect(dedupeFoods(foods).map((food) => food.id)).toEqual([1, 3, 4]);
  });
});

describe('withinOneEdit', () => {
  it('tolerates one letter added, removed, changed or swapped', () => {
    expect(withinOneEdit('bannane', 'banane')).toBe(true);
    expect(withinOneEdit('banan', 'banane')).toBe(true);
    expect(withinOneEdit('quinao', 'quinoa')).toBe(true);
    expect(withinOneEdit('yaourd', 'yaourt')).toBe(true);
    expect(withinOneEdit('bnanae', 'banane')).toBe(false);
  });
});

describe('normalizeFoodText', () => {
  it('folds accents and punctuation into plain words', () => {
    expect(normalizeFoodText("Crème fraîche d'Isigny – 30 %")).toBe('creme fraiche d isigny 30');
  });

  it('spells out the ligatures', () => {
    expect(normalizeFoodText('Œufs de poule, bœuf')).toBe('oeufs de poule boeuf');
  });
});
