import { describe, expect, it } from 'vitest';
import {
  isFoodLogDayComplete,
  portionNutrients,
  projectFoodLogDay,
  type LoggedEntry,
} from './food-log-math';

const SKYR = {
  kcalPer100g: 62,
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0.2,
  sugarPer100g: 4,
};

describe('portionNutrients', () => {
  it('scales per-100 g nutrients to the portion, to a tenth', () => {
    expect(portionNutrients(SKYR, 150)).toEqual({
      kcal: 93,
      protein: 16.5,
      carbs: 6,
      fat: 0.3,
      fiber: null,
      sugar: 6,
    });
  });
});

describe('projectFoodLogDay', () => {
  const entry = (meal: LoggedEntry['meal'], kcal: number, protein: number): LoggedEntry => ({
    meal,
    name: 'Skyr',
    brand: 'Isey',
    kcal,
    protein,
    carbs: 4,
    fat: 1,
    fiber: null,
    sugar: 2,
  });

  it('totals the day and groups entries by meal, in the order the readers expect', () => {
    const day = projectFoodLogDay([entry('SNACKS', 100, 10), entry('BREAKFAST', 300.4, 20.25)]);

    expect(day.calories).toBe(400);
    expect(day.protein).toBe(30.3);
    expect(day.fiber).toBeNull();
    expect(day.sugar).toBe(4);
    expect(day.meals.map((meal) => meal.name)).toEqual(['breakfast', 'snacks']);
    expect(day.meals[0]!.entries[0]).toEqual({
      name: 'Skyr · Isey',
      calories: 300,
      protein: 20.25,
      carbs: 4,
      fat: 1,
      sugar: 2,
    });
  });

  it('is an empty day when nothing is logged', () => {
    expect(projectFoodLogDay([])).toEqual({
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: null,
      sugar: null,
      meals: [],
    });
  });
});

describe('isFoodLogDayComplete', () => {
  it('needs breakfast, lunch and dinner eaten or skipped; snacks are optional', () => {
    expect(isFoodLogDayComplete(['BREAKFAST', 'DINNER'], [])).toBe(false);
    expect(isFoodLogDayComplete(['BREAKFAST', 'DINNER'], ['LUNCH'])).toBe(true);
    expect(isFoodLogDayComplete(['SNACKS'], ['BREAKFAST', 'LUNCH', 'DINNER'])).toBe(true);
  });
});
