/**
 * The reads behind the coach context: every source of an athlete's state, loaded at once.
 */
import { subDays } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import { createSourceTimer } from '@sharpit/server/lib/coach/context/source-timer';
import {
  getTrainingZoneNotes,
  getActivitiesForCoach,
  getAthleteProfile,
  getGoals,
  getHealthEntries,
  getPlannedSessionsForCoach,
} from '@sharpit/server/lib/queries';
import {
  loadAthletePmcAnchor,
  loadDailyTrainingStressEntries,
} from '@sharpit/server/lib/training/pmc/pmc-server';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { prisma } from '@sharpit/db/client';
import { pickNutritionRow } from '@sharpit/app/lib/nutrition/food-log/nutrition-source';
import { listTravelContexts } from '@sharpit/server/lib/travel-context/service';
import { loadScenarioComparisonForCoach } from '@sharpit/server/lib/presentation/scenario/scenario-comparison';
import { getActivityStatusStoreDb } from '@sharpit/server/lib/health/activity-status-service';

async function loadNutritionSummary(
  athleteId: string,
  trainingDayId: string,
): Promise<{ calories: number; protein: number; carbs: number; fat: number } | null> {
  try {
    const row = pickNutritionRow(
      await prisma.dailyNutrition.findMany({
        where: { athleteId, date: new Date(`${trainingDayId}T00:00:00Z`) },
      }),
    );
    if (!row) {
      return null;
    }
    return {
      calories: row.calories,
      protein: Math.round(row.protein),
      carbs: Math.round(row.carbohydrates),
      fat: Math.round(row.fat),
    };
  } catch {
    return null;
  }
}

/** Latest home/today weather observation for coach — cheap indexed read, never Open-Meteo. */
export async function loadHomeWeatherHint(
  athleteId: string,
  trainingDayId: string,
): Promise<{
  airTemperatureC: number | null;
  relativeHumidityPct: number | null;
} | null> {
  const row = await prisma.environmentalObservationRecord.findFirst({
    where: {
      athleteId,
      trainingDayId,
      dimension: 'WEATHER',
      supersededBy: null,
    },
    orderBy: { observedAt: 'desc' },
    select: { payload: true },
  });
  if (!row?.payload || typeof row.payload !== 'object') {
    return null;
  }
  const payload = row.payload as Record<string, unknown>;
  const airTemperatureC =
    typeof payload.airTemperatureC === 'number' ? payload.airTemperatureC : null;
  const relativeHumidityPct =
    typeof payload.relativeHumidityPct === 'number' ? payload.relativeHumidityPct : null;
  if (!isSet(airTemperatureC) && !isSet(relativeHumidityPct)) {
    return null;
  }
  return { airTemperatureC, relativeHumidityPct };
}

type LoadCoachContextSourcesInput = {
  athleteId: string;
  today: Date;
  trainingDayId: string;
  includeScenario: boolean;
};

export async function loadCoachContextSources(input: LoadCoachContextSourcesInput) {
  const { athleteId, today, trainingDayId, includeScenario } = input;
  const timer = createSourceTimer();
  const sources = await Promise.all([
    timer.time('activities', getActivitiesForCoach(athleteId, { limit: 120, sinceDays: 90 })),
    timer.time('health', getHealthEntries(athleteId, 30)),
    timer.time('goals', getGoals(athleteId)),
    timer.time(
      'upcomingPlanned',
      getPlannedSessionsForCoach(athleteId, { from: today, to: subDays(today, -21) }),
    ),
    timer.time(
      'pastPlanned',
      getPlannedSessionsForCoach(athleteId, { from: subDays(today, 14), to: today }),
    ),
    timer.time('profile', getAthleteProfile(athleteId)),
    timer.time('physicalNotes', getTrainingZoneNotes(athleteId)),
    timer.time('snapshot', getOrBuildAthleteSnapshot(athleteId, trainingDayId)),
    timer.time('travel', listTravelContexts(prisma, athleteId)),
    timer.time('homeWeather', loadHomeWeatherHint(athleteId, trainingDayId)),
    timer.time(
      'scenario',
      includeScenario
        ? loadScenarioComparisonForCoach(athleteId, { horizonDays: 7 })
        : Promise.resolve(null),
    ),
    timer.time('pmcAnchor', loadAthletePmcAnchor(athleteId, { refDate: today })),
    timer.time('dailyStress', loadDailyTrainingStressEntries(athleteId, { refDate: today })),
    timer.time('nutrition', loadNutritionSummary(athleteId, trainingDayId)),
    timer.time('activityStatus', getActivityStatusStoreDb(prisma, athleteId, trainingDayId)),
  ] as const);
  console.info('[coach-context] sources', timer.durations());
  return sources;
}

export type CoachContextSources = Awaited<ReturnType<typeof loadCoachContextSources>>;
