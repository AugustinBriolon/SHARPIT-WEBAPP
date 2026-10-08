import type { Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import type { BusyInterval } from '@sharpit/server/lib/integrations/google/google';

export const APPLE_CALENDAR_BUSY_PROVIDER = 'apple-calendar' as const;

const intervalSchema = {
  parse(raw: unknown): BusyInterval[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: BusyInterval[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as BusyInterval).start === 'string' &&
        typeof (item as BusyInterval).end === 'string'
      ) {
        out.push({ start: (item as BusyInterval).start, end: (item as BusyInterval).end });
      }
    }
    return out;
  },
};

/** Persists the latest busy blob from the iOS EventKit upload. */
export async function saveAppleCalendarBusy(
  athleteId: string,
  intervals: BusyInterval[],
): Promise<void> {
  await prisma.calendarBusySnapshot.upsert({
    where: {
      athleteId_provider: { athleteId, provider: APPLE_CALENDAR_BUSY_PROVIDER },
    },
    create: {
      athleteId,
      provider: APPLE_CALENDAR_BUSY_PROVIDER,
      intervals: intervals as unknown as Prisma.InputJsonValue,
    },
    update: { intervals: intervals as unknown as Prisma.InputJsonValue },
  });
}

/** Reads uploaded Apple Calendar busy intervals, or an empty list if none stored. */
export async function loadAppleCalendarBusy(athleteId: string): Promise<BusyInterval[]> {
  const row = await prisma.calendarBusySnapshot.findUnique({
    where: {
      athleteId_provider: { athleteId, provider: APPLE_CALENDAR_BUSY_PROVIDER },
    },
    select: { intervals: true },
  });
  if (!row) {
    return [];
  }
  return intervalSchema.parse(row.intervals);
}
