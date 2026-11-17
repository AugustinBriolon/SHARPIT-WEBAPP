import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { saveAppleCalendarBusy } from '@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot';

const intervalSchema = z.object({ start: z.string(), end: z.string() });

const bodySchema = z.object({
  provider: z.literal('apple-calendar'),
  intervals: z.array(intervalSchema).max(2_000),
});

/**
 * One event with no length or an unreadable date used to refuse the whole upload (400), and
 * the app told the athlete on every sync. Such an event blocks no slot: it is left out.
 */
function usableIntervals<T extends { start: string; end: string }>(intervals: T[]): T[] {
  return intervals.filter(({ start, end }) => {
    const from = Date.parse(start);
    const to = Date.parse(end);
    return Number.isFinite(from) && Number.isFinite(to) && from < to;
  });
}

/** Stores EventKit busy intervals from the iPhone for coach free-slot logic. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  let athleteId: string;
  try {
    athleteId = await getCurrentAthleteId();
  } catch {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const intervals = usableIntervals(parsed.data.intervals);
    await saveAppleCalendarBusy(athleteId, intervals);
    return NextResponse.json({ apiVersion: 1, ok: true, count: intervals.length });
  } catch (error) {
    console.error('[api/v1/calendar/busy]', error);
    return NextResponse.json({ error: 'Busy upload failed' }, { status: 500 });
  }
}
