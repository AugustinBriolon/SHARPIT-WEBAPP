/**
 * Where a planned session stands once it is done: on the day and at the time it was done, not
 * where it had been planned. A session planned for Monday and done on Sunday used to stay on
 * Monday — in the plan, and in the calendar the plan is copied to.
 */
import { localDayAndMinute } from '@sharpit/server/lib/athlete-time-zone';

export interface DoneSchedule {
  /** The day it was done, as a `@db.Date` value. */
  date: Date;
  /** « HH:mm » on the athlete's clock; null when the activity carries a day and no time. */
  startTime: string | null;
}

const MS_PER_DAY = 86_400_000;

/** An activity logged with a day only is stored at UTC midnight or noon: it has no clock. */
function hasNoClock(instant: Date): boolean {
  const ms = instant.getTime() % MS_PER_DAY;
  return ms === 0 || ms === MS_PER_DAY / 2;
}

export function doneScheduleOf(activityDate: Date, timeZone: string): DoneSchedule {
  if (hasNoClock(activityDate)) {
    return {
      date: new Date(`${activityDate.toISOString().slice(0, 10)}T00:00:00Z`),
      startTime: null,
    };
  }
  const { dayId, minute } = localDayAndMinute(activityDate, timeZone);
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return { date: new Date(`${dayId}T00:00:00Z`), startTime: `${hh}:${mm}` };
}

/**
 * What linking the activity changes on the session's schedule: its day when it was done on
 * another one, its time when the activity has one. A day changed without a time clears the
 * planned slot, which no longer says anything true.
 */
export function schedulePatchForDoneSession(
  session: { date: Date; startTime: string | null },
  done: DoneSchedule,
): { date?: Date; startTime?: string | null } {
  const dayChanged =
    session.date.toISOString().slice(0, 10) !== done.date.toISOString().slice(0, 10);
  const patch: { date?: Date; startTime?: string | null } = {};
  if (dayChanged) {
    patch.date = done.date;
  }
  if (done.startTime !== null) {
    if (done.startTime !== session.startTime) {
      patch.startTime = done.startTime;
    }
  } else if (dayChanged && session.startTime !== null) {
    patch.startTime = null;
  }
  return patch;
}
