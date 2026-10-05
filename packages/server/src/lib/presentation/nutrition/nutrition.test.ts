import { format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@sharpit/db/client', () => ({ prisma: { dailyNutrition: { findMany } } }));
const computeDayFeatures = vi.fn();
vi.mock('@sharpit/server/lib/engines/feature-engine', () => ({
  featureEngine: { computeDayFeatures },
}));
vi.mock('@sharpit/server/lib/integrations/myfitnesspal/myfitnesspal-sync', () => ({
  getMfpAccount: vi.fn().mockResolvedValue(null),
  getLiveNutrientGoals: vi.fn().mockResolvedValue(null),
}));
const getLatestBodyWeightKg = vi.fn();
vi.mock('@sharpit/server/lib/nutrition/body-weight-for-fuel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sharpit/server/lib/nutrition/body-weight-for-fuel')>()),
  getLatestBodyWeightKg,
}));
vi.mock('@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs', () => ({
  loadDeclaredDiet: vi.fn().mockResolvedValue({ ids: [], labels: [] }),
}));

const today = format(new Date(), 'yyyy-MM-dd');

function row(overrides: Record<string, unknown> = {}) {
  return {
    date: new Date(`${today}T00:00:00.000Z`),
    provider: 'sharpit',
    calories: 2000,
    protein: 150,
    carbohydrates: 250,
    fat: 60,
    fiber: null,
    sugar: null,
    complete: false,
    meals: [
      {
        name: 'Déjeuner',
        entries: [{ name: 'Riz', calories: 2000, protein: 150, carbohydrates: 250, fat: 60 }],
      },
    ],
    goalCalories: 2500,
    goalProtein: 160,
    goalCarbohydrates: 300,
    goalFat: 70,
    exerciseCalories: null,
    ...overrides,
  };
}

describe('buildNutritionViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLatestBodyWeightKg.mockResolvedValue(75);
  });

  it('reads the fuel density from the day without recomputing every feature of the day', async () => {
    findMany.mockResolvedValue([row()]);
    const { buildNutritionViewModel } = await import('./nutrition');

    const viewModel = await buildNutritionViewModel('athlete-1', today);

    expect(computeDayFeatures).not.toHaveBeenCalled();
    expect(viewModel.selectedDay?.fuelDensity).toEqual({
      proteinGPerKg: 2,
      carbohydratesGPerKg: 3.33,
      referenceWeightKg: 75,
    });
  });

  it('enriches today once when today is the day asked', async () => {
    findMany.mockResolvedValue([row()]);
    const { buildNutritionViewModel } = await import('./nutrition');

    const viewModel = await buildNutritionViewModel('athlete-1', today);

    expect(getLatestBodyWeightKg).toHaveBeenCalledTimes(1);
    expect(viewModel.today).toBe(viewModel.selectedDay);
  });

  it('gives no density for a day with nothing logged or no weigh-in', async () => {
    findMany.mockResolvedValue([row({ meals: [] })]);
    const { buildNutritionViewModel } = await import('./nutrition');
    expect((await buildNutritionViewModel('athlete-1', today)).selectedDay?.fuelDensity).toBeNull();

    findMany.mockResolvedValue([row()]);
    getLatestBodyWeightKg.mockResolvedValue(null);
    expect((await buildNutritionViewModel('athlete-1', today)).selectedDay?.fuelDensity).toBeNull();
  });
});
