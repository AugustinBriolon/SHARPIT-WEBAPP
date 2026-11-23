import { describe, expect, it } from 'vitest';
import {
  coherentPer100g,
  foodDescribeRequestSchema,
  foodDescribeResultSchema,
  portionFromPer100g,
} from './food-describe-schema';

describe('foodDescribeRequestSchema', () => {
  it('rejects a description too short to name a food', () => {
    expect(foodDescribeRequestSchema.safeParse({ description: 'ab' }).success).toBe(false);
  });

  it('accepts a dish named in one word', () => {
    expect(foodDescribeRequestSchema.safeParse({ description: 'pizza' }).success).toBe(true);
  });

  it('accepts a meal description', () => {
    const parsed = foodDescribeRequestSchema.safeParse({
      description: 'Faux-filet 300 g, frites et brocolis',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('portionFromPer100g', () => {
  it('scales macros to the portion weight', () => {
    expect(
      portionFromPer100g({
        name: 'Faux-filet',
        grams: 300,
        kcalPer100g: 200,
        proteinPer100g: 25,
        carbsPer100g: 0,
        fatPer100g: 10,
      }),
    ).toEqual({
      name: 'Faux-filet',
      grams: 300,
      kcal: 600,
      protein: 75,
      carbs: 0,
      fat: 30,
    });
  });
});

describe('foodDescribeResultSchema', () => {
  const item = {
    name: 'Lasagnes',
    searchName: 'lasagnes bolognaise',
    grams: 350,
    kcalPer100g: 150,
    proteinPer100g: 8,
    carbsPer100g: 13,
    fatPer100g: 7,
  };

  it('requires at least one dish, and a food in each', () => {
    expect(foodDescribeResultSchema.safeParse({ dishes: [] }).success).toBe(false);
    expect(
      foodDescribeResultSchema.safeParse({ dishes: [{ name: 'Lasagnes', items: [] }] }).success,
    ).toBe(false);
  });

  it('accepts several dishes, each with its own foods', () => {
    const parsed = foodDescribeResultSchema.safeParse({
      dishes: [
        { name: 'Lasagnes bolognaise', items: [item] },
        { name: 'Mousse au chocolat', items: [{ ...item, name: 'Mousse au chocolat' }] },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('coherentPer100g', () => {
  const figures = (kcal: number, protein: number, carbs: number, fat: number) => ({
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbsPer100g: carbs,
    fatPer100g: fat,
  });

  it('leaves figures that agree as they are', () => {
    expect(coherentPer100g(figures(150, 8, 13, 7))).toEqual(figures(150, 8, 13, 7));
  });

  it('raises an energy the macros alone exceed', () => {
    // 4 × 8 + 4 × 13 + 9 × 7 = 147 kcal: 60 cannot be.
    expect(coherentPer100g(figures(60, 8, 13, 7)).kcalPer100g).toBe(147);
  });

  it('keeps an energy above the macros: alcohol is none of the three', () => {
    expect(coherentPer100g(figures(82, 0.1, 2.6, 0)).kcalPer100g).toBe(82);
  });

  it('brings macros back to 100 g in 100 g', () => {
    const fixed = coherentPer100g(figures(500, 40, 60, 60));
    expect(fixed.proteinPer100g + fixed.carbsPer100g + fixed.fatPer100g).toBeCloseTo(100, 0);
    expect(fixed.fatPer100g).toBe(37.5);
  });
});
