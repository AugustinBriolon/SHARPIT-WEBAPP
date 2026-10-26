import { addDays, endOfDay, format, parseISO, startOfDay } from 'date-fns';
import {
  activeDietIds,
  activeDietLabels,
  parseJournalPrefs,
} from '@sharpit/app/lib/journal/journal-prefs';
import { getLatestBodyWeightKg } from '@sharpit/server/lib/nutrition/body-weight-for-fuel';
import { formatMealLabel, normalizeStoredMeals } from '@sharpit/server/lib/nutrition/meal-display';
import { skippedMealsOf } from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { getAthleteProfile } from '@sharpit/server/lib/queries';
import { prisma } from '@sharpit/db/client';
import { pickNutritionRow } from '@sharpit/app/lib/nutrition/food-log/nutrition-source';
import type { NutritionAnalysisInput } from './nutrition-analysis-facts';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

/** Nutrition days are stored at UTC midnight. */
export function nutritionDayDate(trainingDayId: string): Date {
  return new Date(`${trainingDayId}T00:00:00.000Z`);
}

async function loadNutritionRow(athleteId: string, trainingDayId: string) {
  return pickNutritionRow(
    await prisma.dailyNutrition.findMany({
      where: { athleteId, date: nutritionDayDate(trainingDayId) },
    }),
  );
}

async function loadDaySessions(athleteId: string, trainingDayId: string) {
  const day = parseISO(trainingDayId);
  const rows = await prisma.activity.findMany({
    where: {
      athleteId,
      ...visibleActivityWhere,
      date: { gte: startOfDay(day), lte: endOfDay(day) },
    },
    select: { type: true, duration: true, load: true },
    orderBy: { date: 'asc' },
  });
  return rows.map((row) => ({
    type: row.type,
    minutes: row.duration === null ? null : Math.round(row.duration / 60),
    tss: row.load === null ? null : Math.round(row.load),
  }));
}

async function loadNextDayPlanned(athleteId: string, trainingDayId: string) {
  const nextDay = format(addDays(parseISO(trainingDayId), 1), 'yyyy-MM-dd');
  const rows = await prisma.plannedSession.findMany({
    where: { athleteId, date: nutritionDayDate(nextDay) },
    select: { type: true, title: true, durationMin: true, intensity: true },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((row) => ({
    type: row.type,
    title: row.title,
    minutes: row.durationMin,
    intensity: row.intensity,
  }));
}

/** Diet declared in the journal preferences — the single diet source for nutrition. */
export function declaredDiet(journalPrefs: unknown): { ids: string[]; labels: string[] } {
  const prefs = parseJournalPrefs(journalPrefs ?? null);
  return { ids: activeDietIds(prefs), labels: activeDietLabels(prefs) };
}

export async function loadDeclaredDiet(athleteId: string) {
  const profile = await getAthleteProfile(athleteId);
  return declaredDiet(profile?.journalPrefs);
}

function energyBudget(goalCalories: number | null, exerciseCalories: number | null) {
  return goalCalories === null ? null : goalCalories + (exerciseCalories ?? 0);
}

/**
 * Everything the facts need for one day, or null when the day has no logged
 * entry — an empty diary gets no reading.
 */
export async function loadNutritionAnalysisInput(
  athleteId: string,
  trainingDayId: string,
): Promise<NutritionAnalysisInput | null> {
  const row = await loadNutritionRow(athleteId, trainingDayId);
  const meals = row ? normalizeStoredMeals(row.meals) : [];
  if (!row || meals.every((meal) => meal.entries.length === 0)) {
    return null;
  }
  const [profile, weightKg, sessions, nextDayPlanned, skipped] = await Promise.all([
    getAthleteProfile(athleteId),
    getLatestBodyWeightKg(athleteId, trainingDayId),
    loadDaySessions(athleteId, trainingDayId),
    loadNextDayPlanned(athleteId, trainingDayId),
    skippedMealsOf(athleteId, trainingDayId),
  ]);
  return {
    day: trainingDayId,
    complete: row.complete,
    skippedMeals: skipped.map((meal) => formatMealLabel(meal.toLowerCase())),
    totals: {
      calories: row.calories,
      protein: row.protein,
      carbohydrates: row.carbohydrates,
      fat: row.fat,
      fiber: row.fiber,
      sugar: row.sugar,
    },
    meals,
    energyBudgetKcal: energyBudget(row.goalCalories, row.exerciseCalories),
    weightKg,
    targetWeightKg: profile?.targetWeightKg ?? null,
    diet: declaredDiet(profile?.journalPrefs),
    sessions,
    nextDayPlanned,
  };
}
