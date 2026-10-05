import { describe, expect, it } from 'vitest';
import {
  ciqualDietFacts,
  isWholeCiqualFood,
  mapCiqualFood,
  parseCiqualAmount,
  typicalValuesBySubgroup,
  type CiqualFood,
} from './ciqual';

const BANANA: CiqualFood = {
  code: 13005,
  name: 'Banane, pulpe, crue',
  subgroup: '0204',
  kcal: 90.5,
  protein: 1.06,
  carbs: 19.7,
  fat: 0.25,
  fiber: 2.7,
  sugars: 15.6,
  salt: 0.01,
  saturatedFat: 0.01,
};

describe('parseCiqualAmount', () => {
  it('reads decimal commas, traces, bounds and missing values', () => {
    expect(parseCiqualAmount(' 12,5 ')).toBe(12.5);
    expect(parseCiqualAmount('traces')).toBe(0);
    expect(parseCiqualAmount('< 0,5')).toBe(0.25);
    expect(parseCiqualAmount('-')).toBeNull();
    expect(parseCiqualAmount('')).toBeNull();
  });
});

describe('mapCiqualFood', () => {
  it('scores a raw banana as an excellent, additive-free whole food', () => {
    const food = mapCiqualFood(BANANA);
    expect(food).toMatchObject({ ciqualCode: 13005, name: 'Banane, pulpe, crue', brand: null });
    expect(food.health).toMatchObject({
      grade: 'excellent',
      nutriScore: 'a',
      nutriScoreEstimated: true,
      nova: 1,
      additivesKnown: 'list',
      dietFacts: { vegan: 'yes', vegetarian: 'yes', gluten: 'absent', milk: 'absent' },
    });
    expect(food.health.highlights.map((item) => item.key)).toContain('additive_free');
  });

  it('leaves processing and additives unknown for a food not named raw', () => {
    const smoked = mapCiqualFood({
      ...BANANA,
      code: 26037,
      name: 'Saumon fumé',
      subgroup: '0409',
      kcal: 180,
      protein: 22,
      carbs: 0.5,
      fat: 10,
      fiber: 0,
      sugars: 0.5,
      salt: 3,
      saturatedFat: 2,
    });
    expect(smoked.health.nova).toBeNull();
    expect(smoked.health.additivesKnown).toBe('unknown');
    expect(smoked.health.highlights.map((item) => item.key)).toContain('salt_high');
    expect(smoked.health.dietFacts.vegetarian).toBe('no');
  });
});

describe('typical values', () => {
  const egg = (code: number, name: string, sugars: number | null): CiqualFood => ({
    ...BANANA,
    code,
    name,
    subgroup: '0410',
    kcal: 147,
    protein: 13.8,
    carbs: 0.7,
    fat: 9.7,
    sugars,
    saturatedFat: 2.7,
    salt: 0.4,
  });

  it('reads an unmeasured sugar as its family median, says so, and keeps it off the label', () => {
    const family = [egg(1, 'Oeuf, cru', 0.3), egg(2, 'Oeuf, dur', 0.5), egg(3, 'Oeuf, poché', 0.7)];
    const typical = typicalValuesBySubgroup(family).get('0410')!;
    expect(typical.sugars).toBe(0.5);

    const fried = mapCiqualFood(egg(4, 'Oeuf, au plat, sans matière grasse', null), typical);
    expect(fried.sugarPer100g).toBeNull();
    expect(fried.health.nova).toBe(1);
    expect(fried.health.grade).toBe('excellent');
    expect(fried.health.highlights[0]).toMatchObject({
      key: 'typical_values',
      detail: 'Sucres non mesurés par l’Anses : valeur typique de sa famille',
    });
  });
});

describe('isWholeCiqualFood', () => {
  const whole = (name: string, subgroup: string) => isWholeCiqualFood({ name, subgroup });

  it('reads raw or plainly cooked single foods as whole', () => {
    expect(whole('Poulet, viande, crue', '0402')).toBe(true);
    expect(whole('Riz blanc, cru', '0301')).toBe(true);
    expect(whole('Oeuf, au plat, sans matière grasse', '0410')).toBe(true);
    expect(whole('Oeuf, poché', '0410')).toBe(true);
    expect(whole('Saumon, cuit à la vapeur', '0405')).toBe(true);
    expect(whole('Pâtes sèches standard, cuites, non salées', '0301')).toBe(true);
  });

  it('keeps out anything fried, salted, canned or outside single-food groups', () => {
    expect(whole('Oeuf, au plat, frit, salé', '0410')).toBe(false);
    expect(whole('Oeuf, brouillé, avec matière grasse', '0410')).toBe(false);
    expect(whole('Pomme de terre, appertisée, égouttée', '0202')).toBe(false);
    expect(whole('Crudités, assortiment', '0201')).toBe(false);
    expect(whole('Banane, pulpe, sèche', '0204')).toBe(false);
    expect(whole('Pizza, cuite', '0104')).toBe(false);
  });
});

describe('ciqualDietFacts', () => {
  it('reads plant, flesh, egg, dairy and cheese groups', () => {
    expect(ciqualDietFacts('0203').vegan).toBe('yes');
    expect(ciqualDietFacts('0402')).toMatchObject({ vegan: 'no', vegetarian: 'no' });
    expect(ciqualDietFacts('0410')).toMatchObject({ vegan: 'no', vegetarian: 'yes' });
    expect(ciqualDietFacts('0501')).toMatchObject({ vegetarian: 'yes', milk: 'contains' });
    expect(ciqualDietFacts('0503').vegetarian).toBe('maybe');
    expect(ciqualDietFacts('0103').vegan).toBe('unknown');
  });
});
