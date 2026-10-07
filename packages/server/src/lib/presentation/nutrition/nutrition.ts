import { format, parseISO, subDays } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import type {
  NutritionDaySummary,
  NutritionGoalsProgress,
  NutritionFuelDensity,
  NutritionViewModel,
} from '@sharpit/app/presentation/nutrition-view-model';
import { getLiveNutrientGoals } from '@sharpit/server/lib/integrations/myfitnesspal/myfitnesspal-sync';
import {
  getLatestBodyWeightKg,
  macroGPerKg,
} from '@sharpit/server/lib/nutrition/body-weight-for-fuel';
import { buildGoalsProgress } from '@sharpit/app/lib/nutrition/goals-progress';
import { normalizeStoredMeals } from '@sharpit/server/lib/nutrition/meal-display';
import { loadDeclaredDiet } from '@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs';
import { prisma } from '@sharpit/db/client';
import { dedupeNutritionRowsByDay } from '@sharpit/app/lib/nutrition/food-log/nutrition-source';

type NutritionRow = {
  date: Date;
  provider: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  complete: boolean;
  meals: unknown;
  goalCalories: number | null;
  goalProtein: number | null;
  goalCarbohydrates: number | null;
  goalFat: number | null;
  exerciseCalories: number | null;
};

function goalsFromRow(row: NutritionRow): NutritionGoalsProgress | null {
  return buildGoalsProgress({
    consumedCalories: row.calories,
    consumedProtein: row.protein,
    consumedCarbohydrates: row.carbohydrates,
    consumedFat: row.fat,
    goalCalories: row.goalCalories,
    goalProtein: row.goalProtein,
    goalCarbohydrates: row.goalCarbohydrates,
    goalFat: row.goalFat,
    exerciseCalories: row.exerciseCalories,
  });
}

function mapRow(r: NutritionRow): NutritionDaySummary {
  return {
    date: format(r.date, 'yyyy-MM-dd'),
    calories: r.calories,
    protein: r.protein,
    carbohydrates: r.carbohydrates,
    fat: r.fat,
    fiber: r.fiber,
    sugar: r.sugar,
    complete: r.complete,
    meals: normalizeStoredMeals(r.meals),
    goalsProgress: goalsFromRow(r),
    fuelDensity: null,
  };
}

/**
 * Protein and carbohydrates per kilogram of the latest weigh-in, read from the day's row. It is
 * the Feature Engine's fuel extraction (same rule: something logged, the same weigh-in window),
 * done here rather than through `computeDayFeatures`, which recomputes and saves every feature
 * of the day — load, recovery, body, condition, sessions — to read this one pair of numbers,
 * and made each read of the food log wait on all of them.
 */
async function loadFuelDensity(
  athleteId: string,
  trainingDayId: string,
  row: NutritionRow,
): Promise<NutritionFuelDensity | null> {
  const meals = normalizeStoredMeals(row.meals);
  const entryCount = meals.reduce((sum, meal) => sum + meal.entries.length, 0);
  if (entryCount === 0 || row.protein <= 0) {
    return null;
  }

  const referenceWeightKg = await getLatestBodyWeightKg(athleteId, trainingDayId);
  const proteinGPerKg = macroGPerKg(row.protein, referenceWeightKg);
  const carbohydratesGPerKg = macroGPerKg(row.carbohydrates, referenceWeightKg);
  if (!isSet(referenceWeightKg) || !isSet(proteinGPerKg) || !isSet(carbohydratesGPerKg)) {
    return null;
  }

  return { proteinGPerKg, carbohydratesGPerKg, referenceWeightKg };
}

async function resolveGoalsProgress(
  athleteId: string,
  row: NutritionRow,
  fetchLive: boolean,
): Promise<NutritionGoalsProgress | null> {
  const cached = goalsFromRow(row);
  if (cached || !fetchLive) {
    return cached;
  }

  const live = await getLiveNutrientGoals(athleteId, format(row.date, 'yyyy-MM-dd'));
  if (!live) {
    return null;
  }

  return buildGoalsProgress({
    consumedCalories: row.calories,
    consumedProtein: row.protein,
    consumedCarbohydrates: row.carbohydrates,
    consumedFat: row.fat,
    goalCalories: live.calories,
    goalProtein: live.protein,
    goalCarbohydrates: live.carbohydrates,
    goalFat: live.fat,
    exerciseCalories: row.exerciseCalories,
  });
}

async function enrichSelectedDay(
  athleteId: string,
  day: NutritionDaySummary,
  row: NutritionRow | undefined,
  fetchLiveGoals: boolean,
): Promise<NutritionDaySummary> {
  if (!row) {
    return { ...day, goalsProgress: null, fuelDensity: null };
  }
  const [goalsProgress, fuelDensity] = await Promise.all([
    resolveGoalsProgress(athleteId, row, fetchLiveGoals),
    loadFuelDensity(athleteId, day.date, row),
  ]);
  return { ...day, goalsProgress, fuelDensity };
}

function buildNutritionEmptyState(
  selectedDay: NutritionDaySummary | null,
  selectedDayId: string,
  todayId: string,
) {
  if (isSet(selectedDay)) {
    return null;
  }
  return {
    title: 'Aucune donnée ce jour-là',
    description:
      selectedDayId === todayId
        ? 'Ajoute ton premier repas : scanne un code-barres ou cherche un aliment.'
        : 'Aucun repas enregistré pour cette date.',
  };
}

async function enrichDayIfPresent(
  athleteId: string,
  day: NutritionDaySummary | null | undefined,
  row: NutritionRow | undefined,
): Promise<NutritionDaySummary | null> {
  if (!day) {
    return null;
  }
  return enrichSelectedDay(athleteId, day, row, !isSet(row?.goalCalories));
}

async function buildConnectedNutritionViewModel(
  athleteId: string,
  trainingDayId?: string,
): Promise<NutritionViewModel> {
  const referenceDate = trainingDayId ? parseISO(trainingDayId) : new Date();
  const selectedDayId = format(referenceDate, 'yyyy-MM-dd');
  const todayId = format(new Date(), 'yyyy-MM-dd');
  const from = subDays(referenceDate, 6);

  const rows = dedupeNutritionRowsByDay(
    (await prisma.dailyNutrition.findMany({
      where: {
        athleteId,
        date: { gte: new Date(`${format(from, 'yyyy-MM-dd')}T00:00:00Z`) },
      },
      orderBy: { date: 'desc' },
    })) as NutritionRow[],
  );

  const history: NutritionDaySummary[] = rows.map(mapRow);
  const enrichDay = (dayId: string) =>
    enrichDayIfPresent(
      athleteId,
      history.find((d) => d.date === dayId) ?? null,
      rows.find((d) => format(d.date, 'yyyy-MM-dd') === dayId),
    );

  // The selected day is today on every read of the Résumé card: enrich it once.
  const [selectedDay, today, diet] = await Promise.all([
    enrichDay(selectedDayId),
    selectedDayId === todayId ? null : enrichDay(todayId),
    loadDeclaredDiet(athleteId),
  ]);

  const emptyState = buildNutritionEmptyState(selectedDay, selectedDayId, todayId);

  return {
    connected: true,
    mfpConnected: false,
    diet,
    coachReading: null,
    selectedDay,
    today: selectedDayId === todayId ? selectedDay : today,
    history,
    emptyState,
  };
}

/** The Nutrition page. The log lives in SHARPIT (ADR-061); every athlete has one. */
export async function buildNutritionViewModel(
  athleteId: string,
  trainingDayId?: string,
): Promise<NutritionViewModel> {
  return buildConnectedNutritionViewModel(athleteId, trainingDayId);
}
