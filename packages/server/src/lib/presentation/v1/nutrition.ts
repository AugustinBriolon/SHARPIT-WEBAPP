import { format, parseISO, subDays } from 'date-fns';
import {
  calorieAdherence,
  type CalorieAdherence,
} from '@sharpit/server/lib/nutrition/goal-adherence';
import type {
  NutritionCoachReadingView,
  NutritionDaySummary,
  NutritionViewModel,
} from '@sharpit/app/presentation/nutrition-view-model';

/** Days the regularity reads, ending on the selected day. */
export const V1_NUTRITION_HISTORY_DAYS = 14;

/** One day's calories as the food log stored them, for the regularity. */
export type V1NutritionHistoryRow = {
  date: string;
  calories: number;
  goalCalories: number | null;
  exerciseCalories: number | null;
};

type V1Macro = {
  consumed: number;
  goal: number | null;
  remaining: number | null;
  pct: number | null;
};

export type V1NutritionDay = {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  /** The athlete closed the day in their food log. */
  complete: boolean;
  goals: {
    calories: V1Macro;
    protein: V1Macro;
    carbohydrates: V1Macro;
    fat: V1Macro;
    exerciseCalories: number;
    calorieBudget: number;
  } | null;
  fuelDensity: {
    proteinGPerKg: number;
    carbohydratesGPerKg: number;
    referenceWeightKg: number;
  } | null;
  meals: Array<{
    name: string;
    label: string;
    /** Null when it would repeat `label` (title). */
    subtitle: string | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    entries: Array<{ name: string; calories: number; protein: number; carbs: number; fat: number }>;
  }>;
};

export type V1NutritionCoachReading = NutritionCoachReadingView | { state: 'pro_required' } | null;

export type V1NutritionResponse = {
  apiVersion: 1;
  trainingDayId: string;
  /** The athlete keeps a food log — always true since it lives in SHARPIT (ADR-061). */
  connected: boolean;
  /** MyFitnessPal is linked and can be synced. Absent from servers before the in-app log. */
  mfpConnected: boolean;
  empty: { title: string; message: string | null } | null;
  day: V1NutritionDay | null;
  /** `pro_required` below SharpIt Pro: the reading is what SHARPIT adds, the log is not. */
  coachReading: V1NutritionCoachReading;
  /** Diet declared in the journal, as labels. */
  diet: string[];
  /** Oldest first, one entry per day of the 14 ending on `trainingDayId`. */
  history: Array<{
    date: string;
    calories: number | null;
    goalCalories: number | null;
    adherence: CalorieAdherence;
  }>;
  /** How many of those days were logged, and how many kept the calorie goal. */
  regularity: { days: number; logged: number; onTarget: number };
};

function macro(line: V1Macro): V1Macro {
  const { consumed, goal, remaining, pct } = line;
  return { consumed, goal, remaining, pct };
}

function projectDay(day: NutritionDaySummary): V1NutritionDay {
  const goals = day.goalsProgress;
  return {
    calories: day.calories,
    protein: day.protein,
    carbohydrates: day.carbohydrates,
    fat: day.fat,
    fiber: day.fiber,
    sugar: day.sugar,
    complete: day.complete,
    goals: goals
      ? {
          calories: macro(goals.calories),
          protein: macro(goals.protein),
          carbohydrates: macro(goals.carbohydrates),
          fat: macro(goals.fat),
          exerciseCalories: goals.exerciseCalories,
          calorieBudget: goals.calorieBudget,
        }
      : null,
    fuelDensity: day.fuelDensity,
    meals: day.meals.map((meal) => ({
      name: meal.name,
      label: meal.label,
      subtitle: meal.subtitle ?? null,
      calories: meal.calories,
      protein: meal.protein,
      carbs: meal.carbs,
      fat: meal.fat,
      entries: meal.entries.map(({ name, calories, protein, carbs, fat }) => ({
        name,
        calories,
        protein,
        carbs,
        fat,
      })),
    })),
  };
}

function projectHistory(
  rows: V1NutritionHistoryRow[],
  trainingDayId: string,
): V1NutritionResponse['history'] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const end = parseISO(trainingDayId);
  return Array.from({ length: V1_NUTRITION_HISTORY_DAYS }, (_, i) => {
    const date = format(subDays(end, V1_NUTRITION_HISTORY_DAYS - 1 - i), 'yyyy-MM-dd');
    const row = byDate.get(date);
    const calories = row && row.calories > 0 ? row.calories : null;
    return {
      date,
      calories,
      goalCalories: row?.goalCalories ?? null,
      adherence: calorieAdherence(
        calories,
        row?.goalCalories ?? null,
        row?.exerciseCalories ?? null,
      ),
    };
  });
}

function projectRegularity(
  history: V1NutritionResponse['history'],
): V1NutritionResponse['regularity'] {
  return {
    days: history.length,
    logged: history.filter((day) => day.adherence !== 'none').length,
    onTarget: history.filter((day) => day.adherence === 'on_target').length,
  };
}

/** Canonical Nutrition payload for native clients — a projection, no new domain logic. */
export function projectV1Nutrition(
  viewModel: NutritionViewModel,
  trainingDayId: string,
  coachReading: V1NutritionCoachReading = viewModel.coachReading,
  historyRows: V1NutritionHistoryRow[] = [],
): V1NutritionResponse {
  const history = projectHistory(historyRows, trainingDayId);
  const empty = viewModel.emptyState
    ? { title: viewModel.emptyState.title, message: viewModel.emptyState.description || null }
    : null;
  return {
    apiVersion: 1,
    trainingDayId,
    connected: viewModel.connected,
    mfpConnected: viewModel.mfpConnected,
    empty: viewModel.selectedDay ? null : empty,
    day: viewModel.selectedDay ? projectDay(viewModel.selectedDay) : null,
    coachReading,
    diet: viewModel.diet.labels,
    history,
    regularity: projectRegularity(history),
  };
}
