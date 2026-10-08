import type { Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import type { BusyInterval } from '@sharpit/server/lib/integrations/google/google';

export const APPLE_CALENDAR_BUSY_PROVIDER = 'apple-calendar' as const;

function parseBusyInterval(item: unknown): BusyInterval | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const startRaw = (item as BusyInterval).start;
  const endRaw = (item as BusyInterval).end;
  if (typeof startRaw !== 'string' || typeof endRaw !== 'string') {
    return null;
  }
  const startMs = Date.parse(startRaw);
  const endMs = Date.parse(endRaw);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    return null;
  }
  return { start: startRaw, end: endRaw };
}

const intervalSchema = {
  parse(raw: unknown): BusyInterval[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: BusyInterval[] = [];
    for (const item of raw) {
      const interval = parseBusyInterval(item);
      if (interval) {
        out.push(interval);
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
