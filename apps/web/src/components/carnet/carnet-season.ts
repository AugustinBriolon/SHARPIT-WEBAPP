import type { SessionRoutines } from '@sharpit/app/lib/planned-session/routines/session-routines';
import { ActivityType, type PlanPhase, SessionIntensity } from '@prisma/client';
import { addDays } from 'date-fns';
import { comparePlannedSessionsBySchedule } from '@sharpit/app/lib/planned-session/planned-session-dates';
import { dayIdOf, dayOf, weekLabel } from './carnet-time';

/** What the season page needs of a planned session, as `/api/v1/planned-sessions` sends it. */
export type SeasonSession = {
  id?: string;
  date: string;
  completed: boolean;
  isKey?: boolean;
  activity?: { id: string } | null;
  title?: string | null;
  type?: ActivityType;
  intensity?: SessionIntensity | null;
  durationMin?: number | null;
  startTime?: string | null;
  description?: string | null;
  load?: number | null;
  rationale?: string | null;
  /** The server's reading of the session; only its warm-up and stretches are read here. */
  breakdown?: { routines?: SessionRoutines | null } | null;
};

export type SeasonWeek = {
  monday: string;
  label: string;
  planned: number;
  done: number;
  keyPlanned: number;
  keyDone: number;
  /** Share of the planned sessions done, null for a week with none planned. */
  adherence: number | null;
  /** The week is still running or ahead: what is not done yet is not missed. */
  open: boolean;
};

function isDone(session: SeasonSession): boolean {
  return session.completed || Boolean(session.activity);
}

/**
 * The plan's weeks read against what was done — the beta's own measure (planned sessions
 * done). A week with no key session marked counts every session as key, as the plan does.
 */
export function seasonWeeks(
  sessions: readonly SeasonSession[],
  mondays: readonly Date[],
  today: string,
): SeasonWeek[] {
  return mondays.map((monday) => {
    const from = dayIdOf(monday);
    const to = dayIdOf(addDays(monday, 6));
    const inWeek = sessions.filter((s) => {
      const day = s.date.slice(0, 10);
      return day >= from && day <= to;
    });
    const anyKey = inWeek.some((s) => s.isKey);
    const keys = anyKey ? inWeek.filter((s) => s.isKey) : inWeek;
    const done = inWeek.filter(isDone).length;
    return {
      monday: from,
      label: weekLabel(monday),
      planned: inWeek.length,
      done,
      keyPlanned: keys.length,
      keyDone: keys.filter(isDone).length,
      adherence: inWeek.length > 0 ? done / inWeek.length : null,
      open: to >= today,
    };
  });
}

/** Planned, still open sessions from today on — the list the season page opens. */
export function upcomingSeasonSessions(
  sessions: readonly SeasonSession[],
  today: string,
): SeasonSession[] {
  return sessions
    .filter(
      (session): session is SeasonSession & { id: string } =>
        Boolean(session.id) && !isDone(session) && session.date.slice(0, 10) >= today,
    )
    .sort(comparePlannedSessionsBySchedule);
}

/** Planned sessions done over the closed weeks, the number the beta is judged on. */
export function closedAdherence(weeks: readonly SeasonWeek[]): number | null {
  const closed = weeks.filter((w) => !w.open);
  const planned = closed.reduce((sum, w) => sum + w.planned, 0);
  if (planned === 0) {
    return null;
  }
  return closed.reduce((sum, w) => sum + w.done, 0) / planned;
}

export const WEEK_DAY_NAMES = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

export type WeekDayKind = 'done' | 'key' | 'planned' | 'none';

/**
 * What each day of a week holds, Monday first: `done` once every session of the day is done,
 * else `key` when one of them is a key session, else `planned`; `none` for a day with no session.
 */
export function weekDayKinds(sessions: readonly SeasonSession[], monday: Date): WeekDayKind[] {
  return WEEK_DAY_NAMES.map((_, i) => {
    const day = dayIdOf(addDays(monday, i));
    const ofDay = sessions.filter((s) => s.date.slice(0, 10) === day);
    if (ofDay.length === 0) {
      return 'none';
    }
    if (ofDay.every(isDone)) {
      return 'done';
    }
    return ofDay.some((s) => s.isKey) ? 'key' : 'planned';
  });
}

/** What the season page reads of a macro-plan week, as `/api/v1/training-plans` sends it. */
export type PlanWeekReading = {
  weekStart: string | Date;
  weekIndex: number;
  phase: PlanPhase;
  targetLoad: number;
  isDeload: boolean;
};

export type TimelineWeek = {
  index: number;
  load: number;
  /** The week's planned load against the plan's heaviest week, 0 to 1. */
  share: number;
  deload: boolean;
  when: 'past' | 'current' | 'ahead';
};

export type TimelinePhase = {
  phase: PlanPhase;
  /** First and last week of the phase, counted from 1. */
  first: number;
  last: number;
  weeks: number;
  current: boolean;
};

export type PlanTimeline = {
  weeks: TimelineWeek[];
  phases: TimelinePhase[];
  /** The week the athlete is in, counted from 1; null before the plan starts or after it ends. */
  currentWeek: number | null;
  currentPhase: PlanPhase | null;
};

function weekStartId(weekStart: string | Date): string {
  return (typeof weekStart === 'string' ? weekStart : weekStart.toISOString()).slice(0, 10);
}

/**
 * A macro-plan as the season page draws it: one bar a week, sized against the heaviest week,
 * and the phases as runs of consecutive weeks. The current week is the last one begun by `today`,
 * within seven days of its start.
 */
export function planTimeline(plan: readonly PlanWeekReading[], today: string): PlanTimeline {
  const ordered = [...plan].sort((a, b) => a.weekIndex - b.weekIndex);
  const peak = Math.max(1, ...ordered.map((w) => w.targetLoad));
  const begun = ordered.filter((w) => weekStartId(w.weekStart) <= today);
  const last = begun.at(-1);
  const running =
    last && dayIdOf(addDays(dayOf(weekStartId(last.weekStart)), 6)) >= today ? last : null;
  const currentPosition = running ? ordered.indexOf(running) : -1;

  const weeks = ordered.map((week, position): TimelineWeek => {
    let when: TimelineWeek['when'] = 'ahead';
    if (position === currentPosition) {
      when = 'current';
    } else if (weekStartId(week.weekStart) <= today) {
      when = 'past';
    }
    return {
      index: position + 1,
      load: week.targetLoad,
      share: week.targetLoad / peak,
      deload: week.isDeload,
      when,
    };
  });

  const phases: TimelinePhase[] = [];
  ordered.forEach((week, position) => {
    const open = phases.at(-1);
    if (open && open.phase === week.phase) {
      open.last = position + 1;
      open.weeks += 1;
      open.current ||= position === currentPosition;
      return;
    }
    phases.push({
      phase: week.phase,
      first: position + 1,
      last: position + 1,
      weeks: 1,
      current: position === currentPosition,
    });
  });

  return {
    weeks,
    phases,
    currentWeek: running ? currentPosition + 1 : null,
    currentPhase: running?.phase ?? null,
  };
}

export type SportShare = { type: ActivityType; seconds: number; share: number };

/** Time spent in each sport, the largest first, each as a share of the whole. */
export function sportShares(
  activities: readonly { type: ActivityType; duration: number | null }[],
): SportShare[] {
  const seconds = new Map<ActivityType, number>();
  for (const activity of activities) {
    if (activity.duration) {
      seconds.set(activity.type, (seconds.get(activity.type) ?? 0) + activity.duration);
    }
  }
  const total = [...seconds.values()].reduce((sum, value) => sum + value, 0);
  return [...seconds.entries()]
    .map(([type, value]) => ({ type, seconds: value, share: value / total }))
    .sort((a, b) => b.seconds - a.seconds);
}
