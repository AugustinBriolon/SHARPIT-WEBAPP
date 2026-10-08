import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { saveAppleCalendarBusy } from '@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot';

const intervalSchema = z
  .object({
    start: z.string().min(1),
    end: z.string().min(1),
  })
  .refine(
    (v) => {
      const start = Date.parse(v.start);
      const end = Date.parse(v.end);
      return Number.isFinite(start) && Number.isFinite(end) && start < end;
    },
    { message: 'invalid_interval' },
  );

const bodySchema = z.object({
  provider: z.literal('apple-calendar'),
  intervals: z.array(intervalSchema).max(2_000),
});

/** Stores EventKit busy intervals from the iPhone for coach free-slot logic. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    await saveAppleCalendarBusy(athleteId, parsed.data.intervals);
    return NextResponse.json({
      apiVersion: 1,
      ok: true,
      count: parsed.data.intervals.length,
    });
  } catch (error) {
    console.error('[api/v1/calendar/busy]', error);
    return NextResponse.json({ error: 'Busy upload failed' }, { status: 500 });
  }
}
