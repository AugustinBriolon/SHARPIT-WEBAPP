/**
 * Deterministic facts for one logged nutrition day.
 *
 * Pure: no I/O. Every number the coach reading may quote is computed here, so
 * the model interprets and phrases but never invents a figure. The facts are
 * also the regeneration key — their hash changes exactly when the inputs do.
 */

import {
  CARBOHYDRATE_G_PER_KG,
  FIBRE_MIN_G,
  KCAL_PER_G,
  LOAD_BAND_MAX_MINUTES,
  PROTEIN_G_PER_KG,
  PROTEIN_PER_MEAL_G_PER_KG,
  SUGAR_ENERGY_SHARE_WATCH,
  WEIGHT_MAINTAIN_TOLERANCE_KG,
  type TrainingLoadBand,
} from './nutrition-analysis-bands';
import {
  dietCarbCeilingG,
  findDietConflicts,
  type DietConflict,
} from './nutrition-analysis-diet-rules';

export type BandStatus = 'below' | 'within' | 'above';

export type NutritionAnalysisMealInput = {
  label: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  entries: readonly {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
};

export type NutritionAnalysisSessionInput = {
  type: string;
  minutes: number | null;
  tss: number | null;
};

export type NutritionAnalysisPlannedInput = {
  type: string;
  title: string | null;
  minutes: number | null;
  intensity: string | null;
};

export type NutritionAnalysisInput = {
  day: string;
  complete: boolean;
  /** Labels of the meals skipped on purpose (ADR-113). */
  skippedMeals?: readonly string[];
  totals: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
    fiber: number | null;
    sugar: number | null;
  };
  meals: readonly NutritionAnalysisMealInput[];
  /** MyFitnessPal calorie goal + exercise calories, when the athlete has a goal. */
  energyBudgetKcal: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  diet: { ids: readonly string[]; labels: readonly string[] };
  sessions: readonly NutritionAnalysisSessionInput[];
  nextDayPlanned: readonly NutritionAnalysisPlannedInput[];
};

export type NutritionAnalysisFacts = {
  day: string;
  logging: {
    entryCount: number;
    mealCount: number;
    complete: boolean;
    skippedMeals: string[];
  };
  totals: NutritionAnalysisInput['totals'];
  weightKg: number | null;
  load: {
    band: TrainingLoadBand;
    trainingMinutes: number;
    tss: number | null;
    sessions: NutritionAnalysisSessionInput[];
  };
  nextDayPlanned: NutritionAnalysisPlannedInput[];
  fuel: {
    carbsGPerKg: number | null;
    /** Null when a declared low-carb diet replaces the endurance band (see dietCarbCeilingG). */
    carbTargetGPerKg: { min: number; max: number } | null;
    carbStatus: BandStatus | null;
    dietCarbCeilingG: number | null;
    proteinGPerKg: number | null;
    proteinTargetGPerKg: { min: number; max: number };
    proteinStatus: BandStatus | null;
    mealsReachingProteinDose: number | null;
    mealsWithFood: number;
  };
  quality: {
    fiberG: number | null;
    fiberBelowFloor: boolean | null;
    sugarG: number | null;
    sugarEnergyShare: number | null;
    sugarWatch: boolean | null;
  };
  diet: { ids: string[]; labels: string[]; conflicts: DietConflict[] };
  weightGoal: {
    targetKg: number;
    currentKg: number | null;
    direction: 'lose' | 'gain' | 'maintain' | null;
    energyBudgetKcal: number | null;
    energyBalanceKcal: number | null;
  } | null;
  meals: NutritionAnalysisMealInput[];
};

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function perKg(grams: number, weightKg: number | null): number | null {
  return weightKg && weightKg > 0 ? round(grams / weightKg, 2) : null;
}

function bandStatus(value: number | null, band: { min: number; max: number }): BandStatus | null {
  if (value === null) {
    return null;
  }
  if (value < band.min) {
    return 'below';
  }
  return value > band.max ? 'above' : 'within';
}

export function trainingLoadBand(trainingMinutes: number): TrainingLoadBand {
  if (trainingMinutes <= LOAD_BAND_MAX_MINUTES.rest) {
    return 'rest';
  }
  const bands = ['light', 'moderate', 'high'] as const;
  return bands.find((band) => trainingMinutes <= LOAD_BAND_MAX_MINUTES[band]) ?? 'very_high';
}

function buildLoad(sessions: readonly NutritionAnalysisSessionInput[]) {
  const trainingMinutes = sessions.reduce((sum, session) => sum + (session.minutes ?? 0), 0);
  const tssValues = sessions.map((session) => session.tss).filter((tss) => tss !== null);
  return {
    band: trainingLoadBand(trainingMinutes),
    trainingMinutes,
    tss: tssValues.length > 0 ? Math.round(tssValues.reduce((sum, tss) => sum + tss, 0)) : null,
    sessions: [...sessions],
  };
}

function carbTarget(band: TrainingLoadBand, ceilingG: number | null) {
  return ceilingG === null ? CARBOHYDRATE_G_PER_KG[band] : null;
}

function buildFuel(input: NutritionAnalysisInput, band: TrainingLoadBand) {
  const carbsGPerKg = perKg(input.totals.carbohydrates, input.weightKg);
  const ceilingG = dietCarbCeilingG(input.diet.ids);
  const target = carbTarget(band, ceilingG);
  const proteinGPerKg = perKg(input.totals.protein, input.weightKg);
  const mealsWithFood = input.meals.filter((meal) => meal.calories > 0);
  const doseG = input.weightKg ? input.weightKg * PROTEIN_PER_MEAL_G_PER_KG : null;
  return {
    carbsGPerKg,
    carbTargetGPerKg: target,
    carbStatus: target ? bandStatus(carbsGPerKg, target) : null,
    dietCarbCeilingG: ceilingG,
    proteinGPerKg,
    proteinTargetGPerKg: { ...PROTEIN_G_PER_KG },
    proteinStatus: bandStatus(proteinGPerKg, PROTEIN_G_PER_KG),
    mealsReachingProteinDose:
      doseG === null ? null : mealsWithFood.filter((meal) => meal.protein >= doseG).length,
    mealsWithFood: mealsWithFood.length,
  };
}

function sugarEnergyShare(sugarG: number | null, calories: number): number | null {
  if (sugarG === null || calories <= 0) {
    return null;
  }
  return round((sugarG * KCAL_PER_G.carbohydrates) / calories, 2);
}

function buildQuality(totals: NutritionAnalysisInput['totals']) {
  const share = sugarEnergyShare(totals.sugar, totals.calories);
  return {
    fiberG: totals.fiber === null ? null : round(totals.fiber),
    fiberBelowFloor: totals.fiber === null ? null : totals.fiber < FIBRE_MIN_G,
    sugarG: totals.sugar === null ? null : round(totals.sugar),
    sugarEnergyShare: share,
    sugarWatch: share === null ? null : share > SUGAR_ENERGY_SHARE_WATCH,
  };
}

function weightDirection(currentKg: number | null, targetKg: number) {
  if (currentKg === null) {
    return null;
  }
  const delta = targetKg - currentKg;
  if (Math.abs(delta) <= WEIGHT_MAINTAIN_TOLERANCE_KG) {
    return 'maintain' as const;
  }
  return delta < 0 ? ('lose' as const) : ('gain' as const);
}

function buildWeightGoal(input: NutritionAnalysisInput): NutritionAnalysisFacts['weightGoal'] {
  if (input.targetWeightKg === null) {
    return null;
  }
  const budget = input.energyBudgetKcal;
  return {
    targetKg: input.targetWeightKg,
    currentKg: input.weightKg,
    direction: weightDirection(input.weightKg, input.targetWeightKg),
    energyBudgetKcal: budget,
    energyBalanceKcal: budget === null ? null : Math.round(input.totals.calories - budget),
  };
}

function dietEntries(meals: readonly NutritionAnalysisMealInput[]) {
  return meals.flatMap((meal) =>
    meal.entries.map((entry) => ({ meal: meal.label, name: entry.name })),
  );
}

export function countLoggedEntries(meals: readonly NutritionAnalysisMealInput[]): number {
  return meals.reduce((sum, meal) => sum + meal.entries.length, 0);
}

export function buildNutritionAnalysisFacts(raw: NutritionAnalysisInput): NutritionAnalysisFacts {
  // Weigh-ins come back as 81.082000000001 — one decimal is what the athlete reads.
  const input = { ...raw, weightKg: raw.weightKg === null ? null : round(raw.weightKg) };
  const load = buildLoad(input.sessions);
  return {
    day: input.day,
    logging: {
      entryCount: countLoggedEntries(input.meals),
      mealCount: input.meals.filter((meal) => meal.calories > 0).length,
      complete: input.complete,
      skippedMeals: [...(input.skippedMeals ?? [])],
    },
    totals: { ...input.totals },
    weightKg: input.weightKg,
    load,
    nextDayPlanned: [...input.nextDayPlanned],
    fuel: buildFuel(input, load.band),
    quality: buildQuality(input.totals),
    diet: {
      ids: [...input.diet.ids],
      labels: [...input.diet.labels],
      conflicts: findDietConflicts({
        dietIds: input.diet.ids,
        entries: dietEntries(input.meals),
        carbohydratesG: input.totals.carbohydrates,
      }),
    },
    weightGoal: buildWeightGoal(input),
    meals: input.meals.map((meal) => ({ ...meal, entries: [...meal.entries] })),
  };
}
