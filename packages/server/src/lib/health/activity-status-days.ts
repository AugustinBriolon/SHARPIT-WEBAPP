import type { PrismaClient } from '@prisma/client';
import {
  ACTIVITY_STATUS_DEFAULT,
  type ActivityStatusId,
  isActivityStatus,
  todayIsoDate,
} from '@sharpit/app/lib/health/activity-status';

/** The mode one day was spent in, `yyyy-MM-dd` in the athlete's calendar. */
export type ActivityStatusDay = { day: string; status: ActivityStatusId };

export type ActivityStatusPeriod = {
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  untilDate: Date | null;
};

export type ActivityStatusOverride = { day: Date; status: string };

/** A year and a bit: enough for « jours malade cette année » without an unbounded scan. */
export const ACTIVITY_STATUS_DAYS_MAX_RANGE = 400;

const DAY_MS = 24 * 60 * 60_000;

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dayAfter(day: string): string {
  return dateOnly(new Date(Date.parse(`${day}T00:00:00.000Z`) + DAY_MS));
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = dayAfter(day)) {
    days.push(day);
  }
  return days;
}

/**
 * The mode a period gives a day: the one still open when the day ends. A mode taken at 10:00
 * counts for that day; a mode left at 10:00 does not. A deadline caps the period, since a
 * passed one only flips back to « Actif » on the next read.
 */
function periodCovers(period: ActivityStatusPeriod, day: string): boolean {
  if (todayIsoDate(period.startedAt) > day) {
    return false;
  }
  if (period.endedAt && todayIsoDate(period.endedAt) <= day) {
    return false;
  }
  return !(period.untilDate && dateOnly(period.untilDate) < day);
}

function knownStatus(status: string): ActivityStatusId {
  return isActivityStatus(status) ? status : ACTIVITY_STATUS_DEFAULT;
}

/** Each day's mode: the day set after the fact, else the history period, else « Actif ». */
export function resolveActivityStatusDays(
  days: readonly string[],
  periods: readonly ActivityStatusPeriod[],
  overrides: readonly ActivityStatusOverride[],
): ActivityStatusDay[] {
  const setByHand = new Map(overrides.map((row) => [dateOnly(row.day), row.status]));
  const newestFirst = [...periods].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return days.map((day) => {
    const status =
      setByHand.get(day) ?? newestFirst.find((period) => periodCovers(period, day))?.status;
    return { day, status: knownStatus(status ?? ACTIVITY_STATUS_DEFAULT) };
  });
}

export async function getActivityStatusDaysDb(
  prisma: PrismaClient,
  athleteId: string,
  from: string,
  to: string,
): Promise<ActivityStatusDay[]> {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  const [periods, overrides] = await Promise.all([
    prisma.athleteActivityStatusHistory.findMany({
      where: {
        athleteId,
        // A day before the period's start in UTC can still be its first day in Paris.
        startedAt: { lt: new Date(toDate.getTime() + 2 * DAY_MS) },
        OR: [{ endedAt: null }, { endedAt: { gte: fromDate } }],
      },
      select: { status: true, startedAt: true, endedAt: true, untilDate: true },
    }),
    prisma.athleteActivityStatusDay.findMany({
      where: { athleteId, day: { gte: fromDate, lte: toDate } },
      select: { day: true, status: true },
    }),
  ]);
  return resolveActivityStatusDays(daysBetween(from, to), periods, overrides);
}

/** Sets a past day's mode. It never touches the current mode, which only today changes. */
export async function setActivityStatusDayDb(
  prisma: PrismaClient,
  athleteId: string,
  day: string,
  status: ActivityStatusId,
): Promise<ActivityStatusDay> {
  const date = new Date(`${day}T00:00:00.000Z`);
  await prisma.athleteActivityStatusDay.upsert({
    where: { athleteId_day: { athleteId, day: date } },
    create: { athleteId, day: date, status },
    update: { status },
  });
  return { day, status };
}
