import { NextRequest, NextResponse } from 'next/server';
import { parseISO } from 'date-fns';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { getHealthEntries } from '@sharpit/server/lib/queries';

/** Ten years of daily entries is past any reading; more is clamped. */
export const MAX_HEALTH_DAYS = 3650;

export async function GET(request: NextRequest) {
  // Read search params before try so Cache Components prerender interrupts propagate.
  const { searchParams } = new URL(request.url);
  const daysParam = Number(searchParams.get('days'));
  const days =
    Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, MAX_HEALTH_DAYS) : 365;
  const dateParam = searchParams.get('date');
  const refDate = dateParam ? parseISO(dateParam) : new Date();

  try {
    const athleteId = await getCurrentAthleteId();
    const entries = await getHealthEntries(athleteId, days, refDate);
    return NextResponse.json(entries);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de charger les données santé' }, { status: 500 });
  }
}
