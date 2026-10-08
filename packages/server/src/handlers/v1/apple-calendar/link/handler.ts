import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { linkAppleCalendar } from '@sharpit/server/lib/integrations/apple-calendar/apple-calendar-link';

const bodySchema = z.object({ linked: z.boolean() });

/** The iPhone app's Apple Calendar switch, so the server can count it as a calendar source. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }
  try {
    await linkAppleCalendar(await getCurrentAthleteId(), parsed.data.linked);
    return NextResponse.json({ apiVersion: 1, linked: parsed.data.linked });
  } catch (error) {
    console.error('[api/v1/apple-calendar/link]', error);
    return NextResponse.json({ error: 'Liaison Calendrier Apple impossible' }, { status: 500 });
  }
}
