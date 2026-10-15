import { describe, expect, it } from 'vitest';
import {
  canonicalMealName,
  formatMealLabel,
  mealSortIndex,
  mealSubtitle,
  normalizeStoredMeals,
} from '@sharpit/server/lib/nutrition/meal-display';

describe('meal-display', () => {
  it('maps known MFP meal names to French labels', () => {
    expect(formatMealLabel('breakfast')).toBe('Petit-déjeuner');
    expect(formatMealLabel('Lunch')).toBe('Déjeuner');
    expect(formatMealLabel('DINNER')).toBe('Dîner');
    expect(formatMealLabel('snacks')).toBe('Collations');
  });

  it('orders meals in standard diary sequence', () => {
    expect(mealSortIndex('dinner')).toBeLessThan(mealSortIndex('snacks'));
    expect(mealSortIndex('breakfast')).toBeLessThan(mealSortIndex('lunch'));
  });

  it('canonicalises French meal titles to stored English keys', () => {
    expect(canonicalMealName('Petit-déjeuner')).toBe('breakfast');
    expect(canonicalMealName('Déjeuner')).toBe('lunch');
    expect(canonicalMealName('Collation')).toBe('snacks');
    expect(canonicalMealName('breakfast')).toBe('breakfast');
  });

  it('hides subtitle when it equals the title', () => {
    expect(mealSubtitle('Petit-déjeuner', 'Petit-déjeuner')).toBeNull();
    expect(mealSubtitle('breakfast', 'Petit-déjeuner')).toBeNull();
    expect(mealSubtitle('Bowl maison', 'Bowl maison')).toBeNull();
    expect(mealSubtitle('Bowl maison', 'Collations')).toBe('Bowl maison');
  });

  it('normalizeStoredMeals never repeats the French title as subtitle', () => {
    const meals = normalizeStoredMeals([
      {
        name: 'Petit-déjeuner',
        calories: 400,
        protein: 20,
        carbs: 50,
        fat: 10,
        entries: [],
      },
    ]);
    expect(meals[0]).toMatchObject({
      name: 'breakfast',
      label: 'Petit-déjeuner',
      subtitle: null,
    });
  });
});
