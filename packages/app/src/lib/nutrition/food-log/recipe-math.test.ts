import { describe, expect, it } from 'vitest';
import { recipeLabel } from './recipe-math';

const RICE = {
  kcalPer100g: 350,
  proteinPer100g: 7,
  carbsPer100g: 78,
  fatPer100g: 1,
  fiberPer100g: 1,
  sugarPer100g: 0.2,
  saltPer100g: 0,
  saturatedFatPer100g: 0.2,
};
const CHICKEN = {
  kcalPer100g: 110,
  proteinPer100g: 23,
  carbsPer100g: 0,
  fatPer100g: 2,
  fiberPer100g: 0,
  sugarPer100g: 0,
  saltPer100g: 0.2,
  saturatedFatPer100g: 0.5,
};

describe('recipeLabel', () => {
  it('sums the ingredients over the raw weight', () => {
    const label = recipeLabel([
      { food: RICE, grams: 100 },
      { food: CHICKEN, grams: 100 },
    ]);
    expect(label).toMatchObject({
      kcalPer100g: 230,
      proteinPer100g: 15,
      carbsPer100g: 39,
      fatPer100g: 1.5,
      totalGrams: 200,
      servingGrams: null,
    });
  });

  it('reads the cooked weight, and splits it in servings', () => {
    const label = recipeLabel([{ food: RICE, grams: 100 }], { cookedGrams: 250, servings: 2 });
    expect(label?.kcalPer100g).toBe(140);
    expect(label?.servingGrams).toBe(125);
  });

  it('leaves a line unknown when one ingredient does not give it', () => {
    const label = recipeLabel([
      { food: RICE, grams: 100 },
      { food: { ...CHICKEN, saltPer100g: null }, grams: 100 },
    ]);
    expect(label?.saltPer100g).toBeNull();
    expect(label?.sugarPer100g).toBe(0.1);
  });

  it('is null without ingredients', () => {
    expect(recipeLabel([])).toBeNull();
  });
});
