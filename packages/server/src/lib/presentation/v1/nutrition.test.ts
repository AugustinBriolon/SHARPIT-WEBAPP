import { describe, expect, it } from 'vitest';
import type {
  NutritionDaySummary,
  NutritionViewModel,
} from '@sharpit/app/presentation/nutrition-view-model';
import { projectV1Nutrition } from '@sharpit/server/lib/presentation/v1/nutrition';

const line = (consumed: number, goal: number | null) => ({
  consumed,
  goal,
  remaining: goal === null ? null : goal - consumed,
  pct: goal === null ? null : Math.round((consumed / goal) * 100),
  unit: 'kcal' as const,
});

function day(date: string, calories: number, goal: number | null = 2400): NutritionDaySummary {
  return {
    date,
    calories,
    protein: 120,
    carbohydrates: 280,
    fat: 70,
    fiber: 30,
    sugar: 50,
    complete: true,
    meals: [
      {
        name: 'breakfast',
        label: 'Petit-déjeuner',
        subtitle: null,
        calories: 520,
        protein: 25,
        carbs: 70,
        fat: 14,
        entries: [
          { name: 'Flocons d’avoine', calories: 300, protein: 10, carbs: 54, fat: 6, sugar: 1 },
        ],
      },
    ],
    goalsProgress: goal
      ? {
          calories: line(calories, goal),
          protein: line(120, 140),
          carbohydrates: line(280, 300),
          fat: line(70, 80),
          exerciseCalories: 450,
          calorieBudget: goal + 450,
        }
      : null,
    fuelDensity: { proteinGPerKg: 1.7, carbohydratesGPerKg: 4, referenceWeightKg: 70 },
  };
}

function viewModel(overrides: Partial<NutritionViewModel>): NutritionViewModel {
  return {
    connected: true,
    mfpConnected: false,
    diet: { ids: ['vegetarian'], labels: ['Végétarien'] },
    coachReading: null,
    selectedDay: null,
    today: null,
    history: [],
    emptyState: null,
    ...overrides,
  };
}

describe('projectV1Nutrition', () => {
  it('projects the selected day without the web-only fields', () => {
    const selected = day('2026-09-27', 2100);
    const result = projectV1Nutrition(
      viewModel({ selectedDay: selected, history: [selected] }),
      '2026-09-27',
    );
    expect(result.empty).toBeNull();
    expect(result.diet).toEqual(['Végétarien']);
    expect(result.day?.goals?.calories).toEqual({
      consumed: 2100,
      goal: 2400,
      remaining: 300,
      pct: 88,
    });
    expect(result.day?.meals[0]).toMatchObject({
      name: 'breakfast',
      label: 'Petit-déjeuner',
      subtitle: null,
    });
    expect(result.day?.meals[0]?.entries[0]).toEqual({
      name: 'Flocons d’avoine',
      calories: 300,
      protein: 10,
      carbs: 54,
      fat: 6,
    });
  });

  it('hides meal subtitle when it would repeat the title', () => {
    const selected = day('2026-09-27', 2100);
    selected.meals = [
      {
        name: 'Petit-déjeuner',
        label: 'Petit-déjeuner',
        subtitle: null,
        calories: 400,
        protein: 20,
        carbs: 40,
        fat: 10,
        entries: [],
      },
    ];
    const result = projectV1Nutrition(
      viewModel({ selectedDay: selected, history: [selected] }),
      '2026-09-27',
    );
    expect(result.day?.meals[0]?.subtitle).toBeNull();
    expect(result.day?.meals[0]?.label).toBe('Petit-déjeuner');
  });

  it('lays 14 days out, oldest first, gaps included, each read against its goal', () => {
    const result = projectV1Nutrition(viewModel({}), '2026-09-27', null, [
      { date: '2026-09-27', calories: 2100, goalCalories: 2400, exerciseCalories: 450 },
      { date: '2026-09-24', calories: 1800, goalCalories: 2400, exerciseCalories: null },
      { date: '2026-09-20', calories: 0, goalCalories: 2400, exerciseCalories: null },
    ]);
    expect(result.history).toHaveLength(14);
    expect(result.history[0]?.date).toBe('2026-09-14');
    expect(result.history[13]).toEqual({
      date: '2026-09-27',
      calories: 2100,
      goalCalories: 2400,
      adherence: 'under',
    });
    expect(result.history.find((day) => day.date === '2026-09-20')?.adherence).toBe('none');
    expect(result.regularity).toEqual({ days: 14, logged: 2, onTarget: 0 });
  });

  it('keeps the empty state only when the day has nothing', () => {
    const result = projectV1Nutrition(
      viewModel({
        emptyState: { title: 'Nutrition indisponible', description: 'Connecte MyFitnessPal.' },
      }),
      '2026-09-27',
    );
    expect(result.day).toBeNull();
    expect(result.empty).toEqual({
      title: 'Nutrition indisponible',
      message: 'Connecte MyFitnessPal.',
    });
  });
});
