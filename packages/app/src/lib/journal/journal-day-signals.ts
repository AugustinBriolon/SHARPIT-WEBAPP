import { pickNutritionRow } from '@sharpit/app/lib/nutrition/food-log/nutrition-source';
import type { PrismaClient } from '@prisma/client';
import {
  buildJournalAutoChecklist,
  type JournalAutoChecklistItem,
  type JournalAutoHealthInput,
} from '@sharpit/app/lib/journal/journal-auto-checklist';
import {
  activeDietLabels,
  enabledAutoItemIds,
  parseJournalPrefs,
  type JournalPrefs,
} from '@sharpit/app/lib/journal/journal-prefs';
import {
  activityMatchesTrainingDay,
  approximateTrainingDayUtcRange,
} from '@sharpit/core/training/training-day';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

export type JournalNutritionSummary = {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  sugar: number | null;
  mealCount: number;
  complete: boolean;
  goalCalories: number | null;
  goalProtein: number | null;
  goalCarbohydrates: number | null;
  goalFat: number | null;
} | null;

export type JournalDaySignals = {
  trainingDayId: string;
  checklist: JournalAutoChecklistItem[];
  nutrition: JournalNutritionSummary;
  dietLabels: string[];
};

type DailyHealthRow = {
  totalSteps: number | null;
  stress: number | null;
  napMinutes: number | null;
  sleepMinutes: number | null;
  bodyBattery: number | null;
} | null;

type DailyNutritionRow = {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  sugar: number | null;
  water: number | null;
  meals: unknown;
  complete: boolean;
  goalCalories: number | null;
  goalProtein: number | null;
  goalCarbohydrates: number | null;
  goalFat: number | null;
} | null;

function buildAutoHealthInput(
  health: DailyHealthRow,
  nutrition: DailyNutritionRow,
): JournalAutoHealthInput | null {
  if (health) {
    return {
      totalSteps: health.totalSteps,
      stress: health.stress,
      napMinutes: health.napMinutes,
      sleepMinutes: health.sleepMinutes,
      bodyBattery: health.bodyBattery,
      waterMl: nutrition?.water ?? null,
    };
  }
  if (nutrition?.water !== null && nutrition?.water !== undefined) {
    return {
      totalSteps: null,
      stress: null,
      napMinutes: null,
      sleepMinutes: null,
      bodyBattery: null,
      waterMl: nutrition.water,
    };
  }
  return null;
}

function buildNutritionSummary(nutrition: NonNullable<DailyNutritionRow>): JournalNutritionSummary {
  const meals = Array.isArray(nutrition.meals) ? nutrition.meals : [];
  return {
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbohydrates: nutrition.carbohydrates,
    fat: nutrition.fat,
    sugar: nutrition.sugar,
    mealCount: meals.length,
    complete: nutrition.complete,
    goalCalories: nutrition.goalCalories,
    goalProtein: nutrition.goalProtein,
    goalCarbohydrates: nutrition.goalCarbohydrates,
    goalFat: nutrition.goalFat,
  };
}

export async function loadJournalPrefsForAthlete(
  prisma: PrismaClient,
  athleteId: string,
): Promise<JournalPrefs> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { journalPrefs: true },
  });
  return parseJournalPrefs(profile?.journalPrefs ?? null);
}

export async function buildJournalDaySignals(
  prisma: PrismaClient,
  athleteId: string,
  trainingDayId: string,
  prefs?: JournalPrefs,
): Promise<JournalDaySignals> {
  const journalPrefs = prefs ?? (await loadJournalPrefsForAthlete(prisma, athleteId));
  const dayDate = toUtcDateOnly(new Date(`${trainingDayId}T00:00:00.000Z`));
  const activityRange = approximateTrainingDayUtcRange(trainingDayId);

  const [health, activities, nutritionRows] = await Promise.all([
    prisma.dailyHealth.findUnique({
      where: { athleteId_date: { athleteId, date: dayDate } },
      select: {
        totalSteps: true,
        stress: true,
        napMinutes: true,
        sleepMinutes: true,
        bodyBattery: true,
      },
    }),
    prisma.activity.findMany({
      where: {
        athleteId,
        ...visibleActivityWhere,
        date: { gte: activityRange.gte, lte: activityRange.lte },
      },
      select: { type: true, duration: true, date: true },
    }),
    prisma.dailyNutrition.findMany({
      where: { athleteId, date: dayDate },
      select: {
        provider: true,
        calories: true,
        protein: true,
        carbohydrates: true,
        fat: true,
        sugar: true,
        water: true,
        meals: true,
        complete: true,
        goalCalories: true,
        goalProtein: true,
        goalCarbohydrates: true,
        goalFat: true,
      },
    }),
  ]);

  const nutrition = pickNutritionRow(nutritionRows);
  const dayActivities = activities.filter((activity) =>
    activityMatchesTrainingDay(activity.date, trainingDayId),
  );

  const checklist = buildJournalAutoChecklist({
    health: buildAutoHealthInput(health, nutrition),
    activities: dayActivities.map((activity) => ({
      type: activity.type,
      duration: activity.duration,
    })),
    thresholds: journalPrefs.thresholds,
    enabledIds: enabledAutoItemIds(journalPrefs),
  });

  const nutritionSummary: JournalNutritionSummary = nutrition
    ? buildNutritionSummary(nutrition)
    : null;

  return {
    trainingDayId,
    checklist,
    nutrition: nutritionSummary,
    dietLabels: activeDietLabels(journalPrefs),
  };
}
