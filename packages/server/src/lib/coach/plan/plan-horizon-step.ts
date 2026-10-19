/**
 * The plan horizon (ADR-095): an athlete in the middle of a training plan never
 * runs out of planned sessions. A few days before the last one, SharpIt writes the next week
 * and asks the athlete to look at it; the day before it starts, it adds it as written.
 *
 * Pure: the cron reads the facts, this decides the one step to take today.
 */

/** What SharpIt remembers of the automatic week it wrote, between two cron runs. */
export type PlanHorizonState = {
  jobId: string;
  /** First day of the week written, yyyy-MM-dd. */
  startDate: string;
  remindedAt: string | null;
  appliedAt: string | null;
};

export type PlanHorizonStep =
  | { kind: 'none' }
  | { kind: 'generate'; startDate: string }
  | { kind: 'remind' }
  | { kind: 'apply' };

/** Days before the next week starts when SharpIt writes it: the athlete has three days to look. */
export const GENERATE_DAYS_AHEAD = 3;
/** The day after the « ta semaine est prête », a second word if nothing was kept. */
export const REMIND_DAYS_AHEAD = 2;
/** The day before it starts, the week goes in as written. */
export const APPLY_DAYS_AHEAD = 1;

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The day the next week would start: the day after the last planned session, never before tomorrow. */
export function nextWeekStart(today: string, lastPlannedDay: string | null): string {
  const tomorrow = addDays(today, 1);
  if (!lastPlannedDay) {
    return tomorrow;
  }
  const after = addDays(lastPlannedDay, 1);
  return after > tomorrow ? after : tomorrow;
}

export function planHorizonStep(input: {
  today: string;
  /** The last planned session from today on, yyyy-MM-dd; null when nothing is planned ahead. */
  lastPlannedDay: string | null;
  state: PlanHorizonState | null;
  /** The automatic week's job, as Redis still holds it; null once it expired. */
  jobStatus: 'running' | 'ready' | 'failed' | null;
  /** Sessions already sit on or after the automatic week's first day (the athlete kept some). */
  weekAlreadyPlanned: boolean;
}): PlanHorizonStep {
  const { today, lastPlannedDay, state, jobStatus, weekAlreadyPlanned } = input;
  const pending = state && state.startDate > today ? state : null;

  if (pending) {
    if (pending.appliedAt || weekAlreadyPlanned || jobStatus === 'running') {
      return { kind: 'none' };
    }
    const daysAhead = daysBetween(today, pending.startDate);
    if (jobStatus === 'ready') {
      if (daysAhead <= APPLY_DAYS_AHEAD) {
        return { kind: 'apply' };
      }
      if (daysAhead <= REMIND_DAYS_AHEAD && !pending.remindedAt) {
        return { kind: 'remind' };
      }
      return { kind: 'none' };
    }
    // Failed or expired: written again, once a day at most since the cron runs daily.
    return { kind: 'generate', startDate: pending.startDate };
  }

  const startDate = nextWeekStart(today, lastPlannedDay);
  return daysBetween(today, startDate) <= GENERATE_DAYS_AHEAD
    ? { kind: 'generate', startDate }
    : { kind: 'none' };
}
