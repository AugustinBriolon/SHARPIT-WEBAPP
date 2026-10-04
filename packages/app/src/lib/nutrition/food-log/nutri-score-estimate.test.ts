import { describe, expect, it } from 'vitest';
import { estimateNutriScorePoints, nutriScoreLetterOf } from './nutri-score-estimate';

describe('estimateNutriScorePoints', () => {
  it('grades a chocolate spread E', () => {
    const points = estimateNutriScorePoints({
      kcal: 539,
      protein: 6.3,
      sugars: 56.3,
      saturatedFat: 10.6,
      salt: 0.107,
      fiber: null,
    });
    expect(nutriScoreLetterOf(points)).toBe('e');
  });

  it('lets protein and fibre offset a lean product', () => {
    const points = estimateNutriScorePoints({
      kcal: 110,
      protein: 23,
      sugars: 0,
      saturatedFat: 0.5,
      salt: 0.15,
      fiber: 0,
    });
    expect(nutriScoreLetterOf(points)).toBe('a');
  });

  it('stops counting protein once the unfavourable points reach 11', () => {
    const salty = { kcal: 400, protein: 25, sugars: 1, saturatedFat: 8, salt: 2.5, fiber: null };
    const points = estimateNutriScorePoints(salty);
    expect(points).toBe(estimateNutriScorePoints({ ...salty, protein: 0 }));
  });

  it('credits a known fruit share, and only then grades a banana A', () => {
    const banana = { kcal: 89, protein: 1.1, sugars: 12.2, saturatedFat: 0.1, salt: 0, fiber: 2.6 };
    expect(nutriScoreLetterOf(estimateNutriScorePoints(banana))).toBe('c');
    expect(
      nutriScoreLetterOf(estimateNutriScorePoints({ ...banana, fruitVegetableShare: 100 })),
    ).toBe('a');
  });
});

describe('nutriScoreLetterOf', () => {
  it('follows the 2023 general-food bands', () => {
    expect(nutriScoreLetterOf(-3)).toBe('a');
    expect(nutriScoreLetterOf(0)).toBe('a');
    expect(nutriScoreLetterOf(2)).toBe('b');
    expect(nutriScoreLetterOf(10)).toBe('c');
    expect(nutriScoreLetterOf(18)).toBe('d');
    expect(nutriScoreLetterOf(19)).toBe('e');
  });
});
