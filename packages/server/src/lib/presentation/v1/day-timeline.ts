/**
 * Day timeline for V1 Today — sleep, sessions, meals, stress peaks, journal check-ins.
 *
 * Callers: handlers/v1/today/handler.ts, day-timeline.test.ts, TodayFold (iOS).
 * API: GET /api/v1/today optional `timeline` array.
 * Schema: reads dailyHealth, athleteDayJournal, foodLogEntry (its `eatenMinute` places a meal, ADR-137).
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

/** Foods of one meal eaten further apart than this are two moments of the day (ADR-137). */
const MEAL_MOMENT_GAP_MIN = 45;

export type V1DayTimelineMeal = {
  meal: FoodMealKey;
  count: number;
  kcal: number;
  /** When it was eaten; absent or null reads at the meal's usual hour. */
  minuteOfDay?: number | null;
};

type TimelineFood = { meal: FoodMealKey; kcal: number; eatenMinute: number | null };

function mealMoment(meal: FoodMealKey, foods: readonly TimelineFood[], minute: number | null) {
  return {
    meal,
    count: foods.length,
    kcal: foods.reduce((sum, food) => sum + food.kcal, 0),
    minuteOfDay: minute,
  };
}

/**
 * A day's foods as moments on the rail (ADR-137): each meal at the time its foods were eaten,
 * split where they were eaten more than 45 minutes apart — a snack at 10:00 and one at 16:30 are
 * two beats of the day. Foods without a time join the meal's first moment; a meal with no time
 * at all stands at its usual hour.
 */
export function mealMoments(foods: readonly TimelineFood[]): V1DayTimelineMeal[] {
  const moments: V1DayTimelineMeal[] = [];
  for (const meal of Object.keys(MEAL_MINUTE) as FoodMealKey[]) {
    const ofMeal = foods.filter((food) => food.meal === meal);
    if (ofMeal.length === 0) {
      continue;
    }
    const timed = ofMeal
      .filter((food) => food.eatenMinute !== null)
      .sort((a, b) => a.eatenMinute! - b.eatenMinute!);
    const untimed = ofMeal.filter((food) => food.eatenMinute === null);
    if (timed.length === 0) {
      moments.push(mealMoment(meal, untimed, null));
      continue;
    }
    const clusters: TimelineFood[][] = [];
    for (const food of timed) {
      const current = clusters.at(-1);
      const last = current?.at(-1);
      if (current && last && food.eatenMinute! - last.eatenMinute! <= MEAL_MOMENT_GAP_MIN) {
        current.push(food);
      } else {
        clusters.push([food]);
      }
    }
    clusters[0]!.push(...untimed);
    for (const cluster of clusters) {
      moments.push(mealMoment(meal, cluster, cluster[0]!.eatenMinute));
    }
  }
  return moments;
}

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
  meals: readonly V1DayTimelineMeal[];
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
      minuteOfDay: meal.minuteOfDay ?? MEAL_MINUTE[meal.meal],
      title: FOOD_MEAL_LABELS[meal.meal],
      detail: `${meal.count} aliment${meal.count > 1 ? 's' : ''} · ${Math.round(meal.kcal).toLocaleString('fr-FR')} kcal`,
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
    healthEntries?: Awaited<ReturnType<typeof getHealthEntries>>;
  },
): Promise<V1DayTimelineEvent[]> {
  const refDate = new Date(`${trainingDayId}T12:00:00`);
  const [healthEntries, journal, mealRows] = await Promise.all([
    extras.healthEntries
      ? Promise.resolve(extras.healthEntries)
      : getHealthEntries(athleteId, 3, refDate),
    getDayJournalEntry(prisma, athleteId, trainingDayId),
    prisma.foodLogEntry.findMany({
      where: { athleteId, date: foodLogDayDate(trainingDayId) },
      select: { meal: true, kcal: true, eatenMinute: true },
    }),
  ]);

  const todayHealth = healthEntries.find((entry) => trainingDayKey(entry.date) === trainingDayId);

  return buildV1DayTimeline({
    bedtimeMin: todayHealth?.sleepBedtimeMin ?? null,
    wakeMin: todayHealth?.sleepWakeMin ?? null,
    sessions: extras.sessions,
    meals: mealMoments(
      mealRows
        .filter((row) => row.meal in FOOD_MEAL_LABELS)
        .map((row) => ({
          meal: row.meal as FoodMealKey,
          kcal: row.kcal ?? 0,
          eatenMinute: row.eatenMinute,
        })),
    ),
    journal: {
      moodLabel: journal.moodLabel,
      hydrationMl: journal.hydrationMl,
      caffeineMg: journal.caffeineMg,
    },
    stress: extras.stress,
    energyBank: extras.energyBank,
  });
}
