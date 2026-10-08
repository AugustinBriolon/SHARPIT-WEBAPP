import { describe, expect, it } from 'vitest';
import {
  foodDescribeRequestSchema,
  foodDescribeResultSchema,
  portionFromPer100g,
} from './food-describe-schema';

describe('foodDescribeRequestSchema', () => {
  it('rejects short descriptions', () => {
    expect(foodDescribeRequestSchema.safeParse({ description: 'steak' }).success).toBe(false);
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
  it('requires at least one item', () => {
    expect(foodDescribeResultSchema.safeParse({ items: [] }).success).toBe(false);
  });
});
