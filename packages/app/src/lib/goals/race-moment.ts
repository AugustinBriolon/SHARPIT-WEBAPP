import { isMultisportLegArray, type MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';

/** Days after the race the result stays on Today (needs a linked activity). */
export const POST_RACE_DAYS = 3;

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type RaceGoalLike = {
  id: string;
  kind: string;
  title: string;
  raceFormat: string | null;
  targetPerformance: string | null;
  targetDate: Date | string | null;
};

type RaceActivityLike = {
  id: string;
  title: string | null;
  duration: number | null;
  goalId?: string | null;
  multisportLegs?: unknown;
};

export type RaceMomentActivity = {
  id: string;
  title: string | null;
  durationSec: number | null;
  legs: MultisportLeg[];
};

export type RaceMoment = {
  goalId: string;
  title: string;
  raceFormat: string | null;
  targetPerformance: string | null;
  /** 'YYYY-MM-DD' athlete-local. */
  targetDate: string;
  phase: 'raceDay' | 'postRace';
  activity: RaceMomentActivity | null;
};

/**
 * Calendar day of a race goal. Clients send either a bare day (UTC midnight) or a local
 * midnight with offset (the evening before in UTC); half a day forward lands both on the race day.
 */
export function raceDayKey(targetDate: Date | string): string {
  return dayKeyFromDate(new Date(new Date(targetDate).getTime() + HALF_DAY_MS));
}

function daysBetween(fromDayKey: string, toDayKey: string): number {
  return Math.round(
    (Date.parse(`${toDayKey}T00:00:00Z`) - Date.parse(`${fromDayKey}T00:00:00Z`)) / DAY_MS,
  );
}

/** The race result: the longest visible activity linked to the goal. */
function linkedActivity(
  goalId: string,
  activities: readonly RaceActivityLike[],
): RaceMomentActivity | null {
  const [linked] = activities
    .filter((activity) => activity.goalId === goalId)
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
  if (!linked) {
    return null;
  }
  return {
    id: linked.id,
    title: linked.title,
    durationSec: linked.duration,
    legs: isMultisportLegArray(linked.multisportLegs) ? linked.multisportLegs : [],
  };
}

function momentFor(
  goal: RaceGoalLike,
  activities: readonly RaceActivityLike[],
  trainingDayId: string,
): RaceMoment | null {
  if (goal.kind !== 'RACE' || !goal.targetDate) {
    return null;
  }
  const targetDate = raceDayKey(goal.targetDate);
  const daysAfter = daysBetween(targetDate, trainingDayId);
  if (daysAfter < 0 || daysAfter > POST_RACE_DAYS) {
    return null;
  }
  const activity = linkedActivity(goal.id, activities);
  if (daysAfter > 0 && !activity) {
    return null;
  }
  return {
    goalId: goal.id,
    title: goal.title,
    raceFormat: goal.raceFormat,
    targetPerformance: goal.targetPerformance,
    targetDate,
    phase: daysAfter === 0 ? 'raceDay' : 'postRace',
    activity,
  };
}

/**
 * The race Today should put first: race day on the goal's date, then its result for
 * `POST_RACE_DAYS` days once an activity is linked. Race day wins, then the latest race.
 */
export function selectRaceMoment(
  goals: readonly RaceGoalLike[],
  activities: readonly RaceActivityLike[],
  trainingDayId: string,
): RaceMoment | null {
  const moments = goals
    .map((goal) => momentFor(goal, activities, trainingDayId))
    .filter((moment): moment is RaceMoment => moment !== null);
  moments.sort((a, b) => {
    if (a.phase !== b.phase) {
      return a.phase === 'raceDay' ? -1 : 1;
    }
    return b.targetDate.localeCompare(a.targetDate);
  });
  return moments[0] ?? null;
}
