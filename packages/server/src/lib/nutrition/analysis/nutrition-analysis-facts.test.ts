import { describe, expect, it } from 'vitest';
import {
  buildNutritionAnalysisFacts,
  trainingLoadBand,
  type NutritionAnalysisInput,
} from './nutrition-analysis-facts';

function meal(label: string, protein: number, entries: string[] = ['Riz']) {
  return {
    label,
    calories: protein > 0 ? 500 : 0,
    protein,
    carbs: 60,
    fat: 15,
    entries: entries.map((name) => ({ name, calories: 100, protein: 5, carbs: 10, fat: 2 })),
  };
}

function input(overrides: Partial<NutritionAnalysisInput> = {}): NutritionAnalysisInput {
  return {
    day: '2026-09-10',
    complete: true,
    totals: { calories: 2400, protein: 120, carbohydrates: 300, fat: 80, fiber: 18, sugar: 140 },
    meals: [meal('Petit-déjeuner', 15), meal('Déjeuner', 40), meal('Dîner', 45)],
    energyBudgetKcal: 2600,
    weightKg: 70,
    targetWeightKg: null,
    diet: { ids: [], labels: [] },
    sessions: [{ type: 'RUN', minutes: 75, tss: 80 }],
    nextDayPlanned: [],
    ...overrides,
  };
}

describe('trainingLoadBand', () => {
  it('follows the IOC volume bands', () => {
    expect(trainingLoadBand(0)).toBe('rest');
    expect(trainingLoadBand(40)).toBe('light');
    expect(trainingLoadBand(75)).toBe('moderate');
    expect(trainingLoadBand(180)).toBe('high');
    expect(trainingLoadBand(300)).toBe('very_high');
  });
});

describe('buildNutritionAnalysisFacts', () => {
  it('compares carbohydrate and protein per kg to the load band', () => {
    const facts = buildNutritionAnalysisFacts(input());

    expect(facts.load).toMatchObject({ band: 'moderate', trainingMinutes: 75, tss: 80 });
    expect(facts.fuel).toMatchObject({
      carbsGPerKg: 4.29,
      carbTargetGPerKg: { min: 5, max: 7 },
      carbStatus: 'below',
      proteinGPerKg: 1.71,
      proteinStatus: 'within',
    });
  });

  it('counts meals that reach the 0.3 g/kg protein dose', () => {
    // 70 kg → 21 g per meal; breakfast (15 g) misses it.
    const facts = buildNutritionAnalysisFacts(input());
    expect(facts.fuel).toMatchObject({ mealsReachingProteinDose: 2, mealsWithFood: 3 });
  });

  it('replaces the endurance carbohydrate band by the ceiling of a declared low-carb diet', () => {
    const facts = buildNutritionAnalysisFacts(
      input({ diet: { ids: ['keto'], labels: ['Cétogène'] } }),
    );
    expect(facts.fuel).toMatchObject({
      carbTargetGPerKg: null,
      carbStatus: null,
      dietCarbCeilingG: 50,
    });
    expect(buildNutritionAnalysisFacts(input()).fuel.dietCarbCeilingG).toBeNull();
  });

  it('rounds the body weight the athlete reads', () => {
    const facts = buildNutritionAnalysisFacts(
      input({ weightKg: 81.082000000001, targetWeightKg: 78 }),
    );
    expect(facts.weightKg).toBe(81.1);
    expect(facts.weightGoal?.currentKg).toBe(81.1);
  });

  it('drops every per-kg fact without a body weight', () => {
    const facts = buildNutritionAnalysisFacts(input({ weightKg: null }));
    expect(facts.fuel).toMatchObject({
      carbsGPerKg: null,
      carbStatus: null,
      proteinGPerKg: null,
      mealsReachingProteinDose: null,
    });
  });

  it('flags low fibre and a high sugar share', () => {
    const facts = buildNutritionAnalysisFacts(input());
    expect(facts.quality).toEqual({
      fiberG: 18,
      fiberBelowFloor: true,
      sugarG: 140,
      sugarEnergyShare: 0.23,
      sugarWatch: true,
    });
  });

  it('reads the weight goal against the energy budget', () => {
    const facts = buildNutritionAnalysisFacts(input({ targetWeightKg: 67 }));
    expect(facts.weightGoal).toEqual({
      targetKg: 67,
      currentKg: 70,
      direction: 'lose',
      energyBudgetKcal: 2600,
      energyBalanceKcal: -200,
    });
    expect(buildNutritionAnalysisFacts(input()).weightGoal).toBeNull();
    expect(buildNutritionAnalysisFacts(input({ targetWeightKg: 70.3 })).weightGoal?.direction).toBe(
      'maintain',
    );
  });

  it('carries diet conflicts found in the entries', () => {
    const facts = buildNutritionAnalysisFacts(
      input({
        diet: { ids: ['vegetarian'], labels: ['Végétarien'] },
        meals: [meal('Déjeuner', 40, ['Steak haché', 'Haricots verts'])],
      }),
    );
    expect(facts.diet.conflicts).toEqual([
      {
        dietId: 'vegetarian',
        kind: 'product',
        meal: 'Déjeuner',
        entry: 'Steak haché',
        detail: 'steak',
      },
    ]);
  });

  it('reports what was logged', () => {
    const facts = buildNutritionAnalysisFacts(
      input({
        complete: false,
        meals: [meal('Déjeuner', 30, ['Riz', 'Poulet']), meal('Dîner', 0, [])],
      }),
    );
    expect(facts.logging).toEqual({
      entryCount: 2,
      mealCount: 1,
      complete: false,
      skippedMeals: [],
    });
  });

  it('carries the meals skipped on purpose to the reading', () => {
    const facts = buildNutritionAnalysisFacts(
      input({ complete: true, skippedMeals: ['Déjeuner'], meals: [meal('Dîner', 50, ['Riz'])] }),
    );
    expect(facts.logging.skippedMeals).toEqual(['Déjeuner']);
  });
});
