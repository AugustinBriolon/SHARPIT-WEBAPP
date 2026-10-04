import { describe, expect, it } from 'vitest';
import { normalizeFoodText, rankFoodsByName } from './food-search-ranking';

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

  it('keeps the order when the query is empty', () => {
    expect(names('  ', ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('normalizeFoodText', () => {
  it('folds accents and punctuation into plain words', () => {
    expect(normalizeFoodText("Crème fraîche d'Isigny – 30 %")).toBe('creme fraiche d isigny 30');
  });
});
