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
import { athleteTimeZone, minuteOfClock, minuteOnDay } from '@sharpit/server/lib/athlete-time-zone';
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
  /** A session's state: only a done one is drawn as such (ADR-138). Absent on other kinds. */
  state?: 'done' | 'planned';
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
  /** Its start: the activity's own when done, else the plan's « HH:mm » (ADR-138). */
  minuteOfDay?: number | null;
};

/** A session as Today lists it, with what places it on the clock. */
export type V1DayTimelineSessionSource = {
  title: string;
  kind: 'planned' | 'done';
  /** A done line's id is its activity (a brick's first done leg). */
  id: string;
  plannedSessionId: string | null;
  brickLegs?: ReadonlyArray<{ id: string; activityId?: string | null }> | null;
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
    /** When the latest coffee was noted, on this day; absent or null reads at 16:00. */
    caffeineMinute?: number | null;
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
      state: session.kind,
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
      minuteOfDay: input.journal.caffeineMinute ?? 16 * 60,
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

/** The activity a done line stands for: its own id, or a brick's first done leg's. */
function doneActivityId(session: V1DayTimelineSessionSource): string {
  return session.brickLegs?.find((leg) => leg.activityId)?.activityId ?? session.id;
}

function plannedId(session: V1DayTimelineSessionSource): string | null {
  return session.plannedSessionId ?? session.brickLegs?.[0]?.id ?? null;
}

/**
 * Each session at its start (ADR-138): a done one when its activity began — on this day and not
 * typed by hand, whose stored time is a day, not a clock — else the plan's start; neither leaves
 * it unplaced, at the foot of the rail.
 */
async function placeSessions(
  athleteId: string,
  trainingDayId: string,
  sessions: readonly V1DayTimelineSessionSource[],
): Promise<V1DayTimelineSession[]> {
  if (sessions.length === 0) {
    return [];
  }
  const activityIds = sessions.filter((s) => s.kind === 'done').map(doneActivityId);
  const plannedIds = sessions.flatMap((s) => plannedId(s) ?? []);
  const [activities, planned, timeZone] = await Promise.all([
    activityIds.length
      ? prisma.activity.findMany({
          where: { athleteId, id: { in: activityIds } },
          select: { id: true, date: true, source: true },
        })
      : [],
    plannedIds.length
      ? prisma.plannedSession.findMany({
          where: { athleteId, id: { in: plannedIds } },
          select: { id: true, startTime: true },
        })
      : [],
    athleteTimeZone(athleteId),
  ]);
  const activityStart = new Map(
    activities.map((row) => [
      row.id,
      row.source === 'manual' ? null : minuteOnDay(row.date, trainingDayId, timeZone),
    ]),
  );
  const plannedStart = new Map(planned.map((row) => [row.id, minuteOfClock(row.startTime)]));
  return sessions.map((session) => {
    const planId = plannedId(session);
    const fromPlan = planId ? (plannedStart.get(planId) ?? null) : null;
    const fromActivity =
      session.kind === 'done' ? (activityStart.get(doneActivityId(session)) ?? null) : null;
    return { title: session.title, kind: session.kind, minuteOfDay: fromActivity ?? fromPlan };
  });
}

/**
 * Loads the day's timeline from health, journal and food log, plus caller-supplied sessions.
 */
export async function loadV1DayTimeline(
  athleteId: string,
  trainingDayId: string,
  extras: {
    sessions: readonly V1DayTimelineSessionSource[];
    stress: V1TodayStress | null;
    energyBank: V1TodayEnergyBank | null;
    healthEntries?: Awaited<ReturnType<typeof getHealthEntries>>;
  },
): Promise<V1DayTimelineEvent[]> {
  const refDate = new Date(`${trainingDayId}T12:00:00`);
  const [healthEntries, journal, mealRows, timeZone, caffeine, sessions] = await Promise.all([
    extras.healthEntries
      ? Promise.resolve(extras.healthEntries)
      : getHealthEntries(athleteId, 3, refDate),
    getDayJournalEntry(prisma, athleteId, trainingDayId),
    prisma.foodLogEntry.findMany({
      where: { athleteId, date: foodLogDayDate(trainingDayId) },
      select: { meal: true, kcal: true, eatenMinute: true },
    }),
    athleteTimeZone(athleteId),
    prisma.athleteDayJournal.findUnique({
      where: { athleteId_trainingDayId: { athleteId, trainingDayId } },
      select: { caffeineLoggedAt: true },
    }),
    placeSessions(athleteId, trainingDayId, extras.sessions),
  ]);

  const todayHealth = healthEntries.find((entry) => trainingDayKey(entry.date) === trainingDayId);

  return buildV1DayTimeline({
    bedtimeMin: todayHealth?.sleepBedtimeMin ?? null,
    wakeMin: todayHealth?.sleepWakeMin ?? null,
    sessions,
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
      caffeineMinute: caffeine?.caffeineLoggedAt
        ? minuteOnDay(caffeine.caffeineLoggedAt, trainingDayId, timeZone)
        : null,
    },
    stress: extras.stress,
    energyBank: extras.energyBank,
  });
}
