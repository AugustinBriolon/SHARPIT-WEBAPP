import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  ACTIVITY_STATUS_DAYS_MAX_RANGE,
  daysBetween,
  getActivityStatusDaysDb,
} from '@sharpit/server/lib/health/activity-status-days';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { prisma } from '@sharpit/db/client';

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z
  .object({ from: isoDay, to: isoDay })
  .refine(({ from, to }) => from <= to, 'from after to')
  .refine(
    ({ from, to }) => daysBetween(from, to).length <= ACTIVITY_STATUS_DAYS_MAX_RANGE,
    'range too long',
  );

/** Each day's mode over a range: what a past day shows and what yearly counts read. */
export async function GET(request: NextRequest) {
  await awaitRequest();

  const params = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({ from: params.get('from'), to: params.get('to') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Plage de dates invalide' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    const days = await getActivityStatusDaysDb(prisma, athleteId, parsed.data.from, parsed.data.to);
    return NextResponse.json({ days });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de charger le statut d’activité' },
      { status: 500 },
    );
  }
}
