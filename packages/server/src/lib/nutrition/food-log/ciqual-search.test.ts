import { PRODUCE } from '@sharpit/app/lib/nutrition/food-log/produce-reference';
import { describe, expect, it } from 'vitest';
import type { CiqualFood } from '@sharpit/app/lib/nutrition/food-log/ciqual';
import table from './ciqual-foods.json';
import { ciqualFoodByCode, produceReferenceKcal, searchCiqualFoods } from './ciqual-search';

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

  it('reads what the athlete types as the table writes it', () => {
    expect(names('blanc de poulet')[0]).toMatch(/^Poulet, filet/);
    expect(names('spaghetti').every((name) => name.startsWith('Pâtes'))).toBe(true);
    expect(names('jambon blanc')[0]).toMatch(/^Jambon cuit/);
  });

  it('folds the « œ » ligature an iPhone keyboard types', () => {
    expect(names('œuf dur')).toEqual(names('oeuf dur'));
    expect(names('œuf dur').length).toBeGreaterThan(0);
  });

  it('forgives one wrong letter only when nothing better is found', () => {
    expect(names('bannane')[0]).toBe('Banane, pulpe, crue');
    expect(names('quinao').some((name) => name.startsWith('Quinoa'))).toBe(true);
  });

  it('finds a food by its code, scored', () => {
    expect(ciqualFoodByCode(13005)?.health.grade).toBe('excellent');
    expect(ciqualFoodByCode(-1)).toBeNull();
  });

  it('opens a fruit or vegetable on the food itself, not a dish or a variety list (ADR-122)', () => {
    expect(names('pomme')[0]).toBe('Pomme Golden, pulpe et peau, crue');
    expect(names('poire')[0]).toBe('Poire Conférence, pulpe, crue');
    expect(names('pêche')[0]).toBe('Pêche blanche, pulpe et peau, crue');
    expect(names('carotte')[0]).toBe('Carotte, crue');
    expect(names('pomme de terre')[0]).toBe('Pomme de terre, sans peau, crue');
    expect(names('pommes').slice(0, 3)).toHaveLength(3);
  });

  it('leaves a query that is not exactly a fruit or vegetable to the ranking', () => {
    expect(names('pomme golden')[0]).toMatch(/^Pomme Golden/);
    expect(produceReferenceKcal('skyr')).toBeNull();
    expect(produceReferenceKcal('banane')).toBeCloseTo(90.5, 1);
  });
});

describe('produce reference table', () => {
  it('points every entry at a fresh fruit or vegetable with a plausible energy', () => {
    const FRESH = ['0201', '0202', '0204'];
    for (const entry of PRODUCE) {
      for (const code of entry.codes) {
        const food = ciqualFoodByCode(code);
        expect(food, `${entry.names[0]} → ${code}`).not.toBeNull();
        expect(food!.kcalPer100g).toBeLessThan(250);
        const energyFromMacros =
          4 * food!.proteinPer100g + 4 * food!.carbsPer100g + 9 * food!.fatPer100g;
        expect(Math.abs(energyFromMacros - food!.kcalPer100g), food!.name).toBeLessThan(
          Math.max(30, food!.kcalPer100g * 0.4),
        );
        const raw = (table as CiqualFood[]).find((candidate) => candidate.code === code);
        expect(FRESH, food!.name).toContain(raw!.subgroup);
      }
    }
  });
});
