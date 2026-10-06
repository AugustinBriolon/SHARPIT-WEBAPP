import { addDays } from 'date-fns';
import { dayIdOf, weekLabel } from './carnet-time';

/** What the season page needs of a planned session, as `/api/v1/planned-sessions` sends it. */
export type SeasonSession = {
  date: string;
  completed: boolean;
  isKey?: boolean;
  activity?: { id: string } | null;
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

/** Planned sessions done over the closed weeks, the number the beta is judged on. */
export function closedAdherence(weeks: readonly SeasonWeek[]): number | null {
  const closed = weeks.filter((w) => !w.open);
  const planned = closed.reduce((sum, w) => sum + w.planned, 0);
  if (planned === 0) {
    return null;
  }
  return closed.reduce((sum, w) => sum + w.done, 0) / planned;
}
