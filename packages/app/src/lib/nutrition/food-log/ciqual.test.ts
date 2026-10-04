import { describe, expect, it } from 'vitest';
import {
  ciqualDietFacts,
  isRawCiqualFood,
  mapCiqualFood,
  parseCiqualAmount,
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

describe('isRawCiqualFood', () => {
  it('needs both a raw-capable group and the word « cru »', () => {
    expect(isRawCiqualFood({ name: 'Poulet, viande, crue', subgroup: '0402' })).toBe(true);
    expect(isRawCiqualFood({ name: 'Riz blanc, cru', subgroup: '0301' })).toBe(false);
    expect(isRawCiqualFood({ name: 'Crudités, assortiment', subgroup: '0201' })).toBe(false);
    expect(isRawCiqualFood({ name: 'Banane, pulpe, sèche', subgroup: '0204' })).toBe(false);
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
