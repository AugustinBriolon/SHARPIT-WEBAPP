import { describe, expect, it } from 'vitest';
import { ciqualFoodByCode, searchCiqualFoods } from './ciqual-search';

function names(query: string): string[] {
  return searchCiqualFoods(query).map((food) => food.name);
}

describe('searchCiqualFoods (bundled table)', () => {
  it('opens « banane » on the raw banana, plural or not', () => {
    expect(names('banane')[0]).toBe('Banane, pulpe, crue');
    expect(names('bananes')[0]).toBe('Banane, pulpe, crue');
  });

  it('keeps « pâtes » apart from « pâté »', () => {
    expect(names('pates').every((name) => name.startsWith('Pâtes'))).toBe(true);
  });

  it('needs every typed word and caps the list', () => {
    expect(names('riz complet').every((name) => /riz/i.test(name) && /complet/i.test(name))).toBe(
      true,
    );
    expect(searchCiqualFoods('poulet')).toHaveLength(5);
    expect(searchCiqualFoods('  ')).toEqual([]);
    expect(searchCiqualFoods('zzzz')).toEqual([]);
  });

  it('finds a food by its code, scored', () => {
    expect(ciqualFoodByCode(13005)?.health.grade).toBe('excellent');
    expect(ciqualFoodByCode(-1)).toBeNull();
  });
});
