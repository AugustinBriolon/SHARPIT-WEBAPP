/**
 * The athlete's clock: the zone their linked calendar declares, else Paris, and an instant read on
 * it. Training days are local, so anything placed on a day (a session's start, a coffee) is read
 * here rather than in UTC.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@sharpit/db/client';

export const DEFAULT_ATHLETE_TIME_ZONE = 'Europe/Paris';

export async function athleteTimeZone(
  athleteId: string,
  client: Pick<PrismaClient, 'googleAccount'> = prisma,
): Promise<string> {
  const google = await client.googleAccount.findUnique({
    where: { athleteId },
    select: { timeZone: true },
  });
  return google?.timeZone ?? DEFAULT_ATHLETE_TIME_ZONE;
}

/** An instant on the athlete's clock: its day (`YYYY-MM-DD`) and its minute after midnight. */
export function localDayAndMinute(
  instant: Date,
  timeZone: string,
): { dayId: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '00';
  return {
    dayId: `${part('year')}-${part('month')}-${part('day')}`,
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

/** The minute of `trainingDayId` the instant falls at, or null when it fell on another day. */
export function minuteOnDay(instant: Date, trainingDayId: string, timeZone: string): number | null {
  const local = localDayAndMinute(instant, timeZone);
  return local.dayId === trainingDayId ? local.minute : null;
}

/** A planned « HH:mm » start as minutes after midnight; null when it does not read as a time. */
export function minuteOfClock(clock: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(clock ?? '');
  if (!match) {
    return null;
  }
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute < 24 * 60 ? minute : null;
}
