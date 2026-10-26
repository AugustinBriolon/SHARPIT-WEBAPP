import type { SessionRoutines } from '@sharpit/app/lib/planned-session/routines/session-routines';
import { ActivityType, SessionIntensity } from '@prisma/client';
import { addDays } from 'date-fns';
import { comparePlannedSessionsBySchedule } from '@sharpit/app/lib/planned-session/planned-session-dates';
import { dayIdOf, weekLabel } from './carnet-time';

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
