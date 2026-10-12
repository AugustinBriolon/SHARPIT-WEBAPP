/**
 * Day timeline for V1 Today — sleep, sessions, meals, stress peaks, journal check-ins.
 *
 * Callers: handlers/v1/today/handler.ts, day-timeline.test.ts, TodayFold (iOS).
 * API: GET /api/v1/today optional `timeline` array.
 * Schema: reads dailyHealth, athleteDayJournal, foodLogEntry (no new tables).
 * User: "fix all" — go-all P2 day timeline sprint.
 */

import { FOOD_MEAL_LABELS } from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import { prisma } from '@sharpit/db/client';
import { getDayJournalEntry } from '@sharpit/server/lib/journal/day-journal-service';
import { foodLogDayDate } from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { getHealthEntries } from '@sharpit/server/lib/queries';
import type {
  V1TodayEnergyBank,
  V1TodayStress,
} from '@sharpit/server/lib/presentation/v1/day-scores';
import { isSet } from '@sharpit/shared/value';
import { format } from 'date-fns';

export type V1DayTimelineKind =
  'sleep' | 'wake' | 'session' | 'meal' | 'stress' | 'note' | 'checkin';

export type V1DayTimelineEvent = {
  kind: V1DayTimelineKind;
  /** Minutes after local midnight; null when the event is day-scoped only. */
  minuteOfDay: number | null;
  title: string;
  detail: string | null;
};

const MEAL_MINUTE: Record<FoodMealKey, number> = {
  BREAKFAST: 8 * 60,
  LUNCH: 12 * 60 + 30,
  SNACKS: 16 * 60,
  DINNER: 19 * 60 + 30,
};

export type V1DayTimelineSession = {
  title: string;
  kind: 'planned' | 'done';
  /** Best-effort start minute when the plan carries a clock. */
  minuteOfDay?: number | null;
};

function trainingDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function stressPeakFromSeries(
  energyBank: V1TodayEnergyBank | null | undefined,
  stress: V1TodayStress | null | undefined,
): V1DayTimelineEvent | null {
  if (!energyBank || energyBank.series.length < 2) {
    if (stress) {
      return {
        kind: 'stress',
        minuteOfDay: 15 * 60,
        title: 'Stress du jour',
        detail: `${Math.round(stress.value)} / 100`,
      };
    }
    return null;
  }
  let steepestDrop = 0;
  let peakMinute = energyBank.series[0]!.minuteOfDay;
  for (let index = 1; index < energyBank.series.length; index += 1) {
    const prev = energyBank.series[index - 1]!;
    const curr = energyBank.series[index]!;
    const drop = prev.value - curr.value;
    if (drop > steepestDrop) {
      steepestDrop = drop;
      peakMinute = curr.minuteOfDay;
    }
  }
  if (steepestDrop < 4) {
    return null;
  }
  return {
    kind: 'stress',
    minuteOfDay: peakMinute,
    title: 'Pic de drain',
    detail: `Réserve −${Math.round(steepestDrop)}`,
  };
}

/** Pure merge of already-loaded day signals into a sorted timeline. */
export function buildV1DayTimeline(input: {
  bedtimeMin: number | null;
  wakeMin: number | null;
  sessions: readonly V1DayTimelineSession[];
  meals: ReadonlyArray<{ meal: FoodMealKey; count: number; kcal: number }>;
  journal: {
    moodLabel: string | null;
    hydrationMl: number | null;
    caffeineMg: number | null;
  };
  stress: V1TodayStress | null;
  energyBank: V1TodayEnergyBank | null;
}): V1DayTimelineEvent[] {
  const events: V1DayTimelineEvent[] = [];

  if (isSet(input.bedtimeMin)) {
    events.push({
      kind: 'sleep',
      minuteOfDay: input.bedtimeMin,
      title: 'Coucher',
      detail: null,
    });
  }
  if (isSet(input.wakeMin)) {
    events.push({
      kind: 'wake',
      minuteOfDay: input.wakeMin,
      title: 'Réveil',
      detail: null,
    });
  }

  for (const session of input.sessions) {
    events.push({
      kind: 'session',
      minuteOfDay: session.minuteOfDay ?? null,
      title: session.title,
      detail: session.kind === 'done' ? 'Faite' : 'Prévue',
    });
  }

  for (const meal of input.meals) {
    events.push({
      kind: 'meal',
      minuteOfDay: MEAL_MINUTE[meal.meal],
      title: FOOD_MEAL_LABELS[meal.meal],
      detail: `${meal.count} aliment${meal.count > 1 ? 's' : ''} · ${Math.round(meal.kcal)} kcal`,
    });
  }

  const peak = stressPeakFromSeries(input.energyBank, input.stress);
  if (peak) {
    events.push(peak);
  }

  if (input.journal.moodLabel) {
    events.push({
      kind: 'checkin',
      minuteOfDay: 9 * 60,
      title: 'Humeur',
      detail: input.journal.moodLabel,
    });
  }
  if (isSet(input.journal.hydrationMl) && input.journal.hydrationMl > 0) {
    events.push({
      kind: 'checkin',
      minuteOfDay: 10 * 60,
      title: 'Hydratation',
      detail: `${Math.round(input.journal.hydrationMl)} ml`,
    });
  }
  if (isSet(input.journal.caffeineMg) && input.journal.caffeineMg > 0) {
    events.push({
      kind: 'checkin',
      minuteOfDay: 16 * 60,
      title: 'Caféine',
      detail: `${Math.round(input.journal.caffeineMg)} mg`,
    });
  }

  return events.sort((a, b) => {
    const left = a.minuteOfDay ?? Number.POSITIVE_INFINITY;
    const right = b.minuteOfDay ?? Number.POSITIVE_INFINITY;
    if (left !== right) {
      return left - right;
    }
    return a.title.localeCompare(b.title, 'fr');
  });
}

/**
 * Loads the day's timeline from health, journal and food log, plus caller-supplied sessions.
 */
export async function loadV1DayTimeline(
  athleteId: string,
  trainingDayId: string,
  extras: {
    sessions: readonly V1DayTimelineSession[];
    stress: V1TodayStress | null;
    energyBank: V1TodayEnergyBank | null;
  },
): Promise<V1DayTimelineEvent[]> {
  const refDate = new Date(`${trainingDayId}T12:00:00`);
  const [healthEntries, journal, mealRows] = await Promise.all([
    getHealthEntries(athleteId, 3, refDate),
    getDayJournalEntry(prisma, athleteId, trainingDayId),
    prisma.foodLogEntry.findMany({
      where: { athleteId, date: foodLogDayDate(trainingDayId) },
      select: { meal: true, kcal: true },
    }),
  ]);

  const todayHealth = healthEntries.find((entry) => trainingDayKey(entry.date) === trainingDayId);

  const mealsByKey = new Map<FoodMealKey, { count: number; kcal: number }>();
  for (const row of mealRows) {
    const meal = row.meal as FoodMealKey;
    if (!(meal in FOOD_MEAL_LABELS)) {
      continue;
    }
    const current = mealsByKey.get(meal) ?? { count: 0, kcal: 0 };
    mealsByKey.set(meal, {
      count: current.count + 1,
      kcal: current.kcal + (row.kcal ?? 0),
    });
  }

  return buildV1DayTimeline({
    bedtimeMin: todayHealth?.sleepBedtimeMin ?? null,
    wakeMin: todayHealth?.sleepWakeMin ?? null,
    sessions: extras.sessions,
    meals: [...mealsByKey.entries()].map(([meal, stats]) => ({ meal, ...stats })),
    journal: {
      moodLabel: journal.moodLabel,
      hydrationMl: journal.hydrationMl,
      caffeineMg: journal.caffeineMg,
    },
    stress: extras.stress,
    energyBank: extras.energyBank,
  });
}
