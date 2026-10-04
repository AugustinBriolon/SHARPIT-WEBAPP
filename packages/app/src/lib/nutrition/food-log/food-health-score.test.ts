import { describe, expect, it } from 'vitest';
import { additiveRisk } from './additives-risk';
import { UNKNOWN_DIET_FACTS } from './food-diet-fit';
import {
  FOOD_HEALTH_SCORE_VERSION,
  computeFoodHealth,
  dedupeAdditives,
  levelFromAmount,
  type OffHealthInput,
} from './food-health-score';

const NO_NUTRIENTS = {
  kcal: null,
  protein: null,
  fiber: null,
  sugars: null,
  salt: null,
  saturatedFat: null,
};

const base: OffHealthInput = {
  nutriScore: 'c',
  nutriScorePoints: null,
  isBeverage: false,
  isSportsNutrition: false,
  nova: 3,
  nutrientLevels: { sugars: 'moderate', salt: 'low', saturatedFat: 'moderate' },
  nutrients: NO_NUTRIENTS,
  additiveTags: [],
  additiveCount: 0,
  dietFacts: UNKNOWN_DIET_FACTS,
  detail: 'full',
};

describe('computeFoodHealth — OFF product', () => {
  it('scores a complete product across nutrition, NOVA and additives', () => {
    const health = computeFoodHealth({
      ...base,
      nutriScore: 'a',
      nova: 1,
      nutrientLevels: { sugars: 'low', salt: 'low', saturatedFat: 'low' },
      additiveTags: ['en:e300'],
    });
    expect(health.coverage).toBe('full');
    expect(health.scoreVersion).toBe(FOOD_HEALTH_SCORE_VERSION);
    expect(health.score).toBeGreaterThanOrEqual(85);
    expect(health.grade).toBe('excellent');
    expect(health.additivesKnown).toBe('list');
    expect(health.additives).toEqual([{ code: 'E300', name: expect.any(String), risk: 'none' }]);
  });

  it('penalises Nutri-Score E, NOVA 4 and high-risk additives', () => {
    const health = computeFoodHealth({
      ...base,
      nutriScore: 'e',
      nova: 4,
      nutrientLevels: { sugars: 'high', salt: 'high', saturatedFat: 'high' },
      additiveTags: ['en:e621', 'en:e150d'],
    });
    expect(health.score).toBeLessThan(25);
    expect(health.grade).toBe('poor');
  });

  it('uses OFF points to place a product inside its letter', () => {
    const lowC = computeFoodHealth({ ...base, nutriScorePoints: 10 });
    const highC = computeFoodHealth({ ...base, nutriScorePoints: 3 });
    expect(highC.score!).toBeGreaterThan(lowC.score!);
    expect(lowC.nutriScore).toBe('c');
  });

  it('ignores the points of a beverage, whose scale differs', () => {
    const drink = computeFoodHealth({ ...base, isBeverage: true, nutriScorePoints: 3 });
    const letterOnly = computeFoodHealth({ ...base, isBeverage: true });
    expect(drink.score).toBe(letterOnly.score);
  });

  it('caps a product with a high-risk additive below the good grade', () => {
    const health = computeFoodHealth({
      ...base,
      nutriScore: 'a',
      nutriScorePoints: -8,
      nova: 1,
      additiveTags: ['en:e250'],
    });
    expect(health.score).toBe(49);
    expect(health.grade).toBe('mediocre');
  });

  it('does not reward an unknown additive list as additive-free', () => {
    const unknown = computeFoodHealth({ ...base, additiveTags: null, additiveCount: null });
    const none = computeFoodHealth({ ...base, additiveTags: [], additiveCount: 0 });
    expect(unknown.additivesKnown).toBe('unknown');
    expect(unknown.score!).toBeLessThan(none.score!);
  });

  it('charges each counted additive when OFF search gave only the number', () => {
    const health = computeFoodHealth({
      ...base,
      additiveTags: null,
      additiveCount: 4,
      detail: 'summary',
    });
    expect(health.additivesKnown).toBe('count');
    expect(health.additiveCount).toBe(4);
    expect(health.detail).toBe('summary');
    expect(health.score).toBeLessThan(computeFoodHealth(base).score!);
  });

  it('estimates the Nutri-Score from the label when OFF has none', () => {
    const banana = computeFoodHealth({
      ...base,
      nutriScore: null,
      nova: 1,
      nutrients: {
        kcal: 89,
        protein: 1.1,
        fiber: 2.6,
        sugars: 12.2,
        salt: 0,
        saturatedFat: 0.1,
        fruitVegetableShare: 100,
      },
    });
    expect(banana.nutriScore).toBe('a');
    expect(banana.nutriScoreEstimated).toBe(true);
    expect(banana.grade).toBe('excellent');
  });

  it('falls back to nutrient levels, then to no score at all', () => {
    const withLevels = computeFoodHealth({ ...base, nutriScore: null });
    expect(withLevels.score).not.toBeNull();
    expect(withLevels.nutriScore).toBeNull();

    const empty = computeFoodHealth({
      ...base,
      nutriScore: null,
      nutrientLevels: { sugars: 'unknown', salt: 'unknown', saturatedFat: 'unknown' },
    });
    expect(empty.coverage).toBe('none');
    expect(empty.score).toBeNull();
    expect(empty.grade).toBeNull();
  });

  it('explains the score with highlights', () => {
    const health = computeFoodHealth({
      ...base,
      nova: 4,
      nutrientLevels: { sugars: 'high', salt: 'low', saturatedFat: 'low' },
      nutrients: { ...NO_NUTRIENTS, kcal: 380, protein: 25, sugars: 20 },
    });
    const keys = health.highlights.map((item) => item.key);
    expect(keys).toContain('sugars_high');
    expect(keys).toContain('ultra_processed');
    expect(keys).toContain('protein_rich');
  });
});

describe('computeFoodHealth — own food', () => {
  it('scores a typed label partially, protein and fibre included', () => {
    const health = computeFoodHealth({
      kind: 'custom',
      kcalPer100g: 120,
      proteinPer100g: 22,
      fiberPer100g: 0,
      sugarPer100g: 2,
      saltPer100g: 0.2,
      saturatedFatPer100g: 1,
    });
    expect(health.coverage).toBe('partial');
    expect(health.nutriScoreEstimated).toBe(true);
    expect(health.score).toBeGreaterThanOrEqual(85);
    expect(health.additives).toEqual([]);
    expect(health.nova).toBeNull();
    expect(health.highlights.map((item) => item.key)).toContain('protein_rich');
  });

  it('falls back to nutrient levels when part of the label is missing', () => {
    const health = computeFoodHealth({ kind: 'custom', kcalPer100g: 200, sugarPer100g: 20 });
    expect(health.coverage).toBe('partial');
    expect(health.nutriScore).toBeNull();
    expect(health.grade).toBe('poor');
  });

  it('returns no score without any of the scored nutrients', () => {
    const health = computeFoodHealth({ kind: 'custom' });
    expect(health.coverage).toBe('none');
    expect(health.score).toBeNull();
  });
});

describe('dedupeAdditives', () => {
  it('counts a sub-variant once and keeps lettered codes apart', () => {
    expect(dedupeAdditives(['en:e322', 'en:e322i']).map((item) => item.code)).toEqual(['E322']);
    expect(dedupeAdditives(['en:e450i']).map((item) => item.code)).toEqual(['E450']);
    expect(dedupeAdditives(['en:e150a', 'en:e150d']).map((item) => item.code)).toEqual([
      'E150A',
      'E150D',
    ]);
  });
});

describe('levelFromAmount', () => {
  it('uses EU solid thresholds for sugars, salt and saturated fat', () => {
    expect(levelFromAmount('sugars', 4)).toBe('low');
    expect(levelFromAmount('sugars', 8)).toBe('moderate');
    expect(levelFromAmount('sugars', 20)).toBe('high');
    expect(levelFromAmount('salt', 0.2)).toBe('low');
    expect(levelFromAmount('salt', 2)).toBe('high');
    expect(levelFromAmount('saturatedFat', 1)).toBe('low');
    expect(levelFromAmount('saturatedFat', 6)).toBe('high');
    expect(levelFromAmount('sugars', null)).toBe('unknown');
  });
});

describe('additiveRisk', () => {
  it('classifies known E-codes and defaults unknown ones to limited', () => {
    expect(additiveRisk('en:e300').risk).toBe('none');
    expect(additiveRisk('en:e621').risk).toBe('high');
    expect(additiveRisk('en:e150d')).toEqual({
      code: 'E150D',
      name: 'Caramel au sulfite d’ammonium',
      risk: 'high',
    });
    expect(additiveRisk('en:e330').risk).toBe('none');
    expect(additiveRisk('en:e9999').risk).toBe('limited');
  });
});
