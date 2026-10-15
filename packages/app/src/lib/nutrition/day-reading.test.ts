import { describe, expect, it } from 'vitest';
import { buildGoalsProgress } from '@sharpit/app/lib/nutrition/goals-progress';
import { buildNutritionDayReading } from '@sharpit/app/lib/nutrition/day-reading';
import type { NutritionDaySummary } from '@sharpit/app/presentation/nutrition-view-model';

function day(
  partial: Partial<NutritionDaySummary> & Pick<NutritionDaySummary, 'meals'>,
): NutritionDaySummary {
  return {
    date: '2026-08-19',
    calories: partial.calories ?? 0,
    protein: partial.protein ?? 0,
    carbohydrates: partial.carbohydrates ?? 0,
    fat: partial.fat ?? 0,
    fiber: null,
    sugar: null,
    complete: partial.complete ?? false,
    meals: partial.meals,
    goalsProgress: partial.goalsProgress ?? null,
    fuelDensity: partial.fuelDensity ?? null,
  };
}

describe('buildNutritionDayReading', () => {
  it('returns empty-state headline when no meals are logged', () => {
    expect(buildNutritionDayReading(null, true)).toEqual({
      headline: 'Journal vide',
      caption: null,
    });
  });

  it('avoids repeating goal numbers in the hero caption', () => {
    const goals = buildGoalsProgress({
      consumedCalories: 2310,
      consumedProtein: 194,
      consumedCarbohydrates: 180,
      consumedFat: 65,
      goalCalories: 2400,
      goalProtein: 180,
      goalCarbohydrates: 270,
      goalFat: 67,
      exerciseCalories: 81,
    });

    const reading = buildNutritionDayReading(
      day({
        calories: 2310,
        protein: 194,
        carbohydrates: 180,
        fat: 65,
        meals: [
          {
            name: 'breakfast',
            label: 'Petit-déjeuner',
            subtitle: null,
            calories: 400,
            protein: 30,
            carbs: 40,
            fat: 10,
            entries: [],
          },
          {
            name: 'lunch',
            label: 'Déjeuner',
            subtitle: null,
            calories: 700,
            protein: 50,
            carbs: 70,
            fat: 20,
            entries: [],
          },
          {
            name: 'dinner',
            label: 'Dîner',
            subtitle: null,
            calories: 1210,
            protein: 114,
            carbs: 70,
            fat: 35,
            entries: [],
          },
        ],
        goalsProgress: goals,
      }),
      true,
    );

    expect(reading.headline).toBe('Bonne couverture protéique');
    expect(reading.caption).toBe('Collation absent du journal');
    expect(reading.caption).not.toMatch(/kcal/i);
    expect(reading.caption).not.toMatch(/\d+\s*g/i);
  });

  it('surfaces missing meals as a complementary caption', () => {
    const reading = buildNutritionDayReading(
      day({
        calories: 800,
        meals: [
          {
            name: 'lunch',
            label: 'Déjeuner',
            subtitle: null,
            calories: 800,
            protein: 60,
            carbs: 80,
            fat: 20,
            entries: [],
          },
        ],
      }),
      true,
    );

    expect(reading.headline).toBe('Journal en cours');
    expect(reading.caption).toBe("Un seul repas enregistré pour l'instant");
  });

  it('uses qualitative headline for calorie overshoot', () => {
    const goals = buildGoalsProgress({
      consumedCalories: 2600,
      consumedProtein: 180,
      consumedCarbohydrates: 270,
      consumedFat: 67,
      goalCalories: 2400,
      goalProtein: 180,
      goalCarbohydrates: 270,
      goalFat: 67,
    });

    const reading = buildNutritionDayReading(
      day({
        calories: 2600,
        meals: [
          {
            name: 'dinner',
            label: 'Dîner',
            subtitle: null,
            calories: 2600,
            protein: 180,
            carbs: 270,
            fat: 67,
            entries: [],
          },
        ],
        goalsProgress: goals,
      }),
      true,
    );

    expect(reading.headline).toBe('Légèrement au-dessus');
    expect(reading.caption).toBe("Un seul repas enregistré pour l'instant");
  });
});
