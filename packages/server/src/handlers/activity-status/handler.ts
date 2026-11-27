import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  getActivityStatusStoreDb,
  setActivityStatusDb,
} from '@sharpit/server/lib/health/activity-status-service';
import { setActivityStatusDayDb } from '@sharpit/server/lib/health/activity-status-days';
import { todayIsoDate } from '@sharpit/app/lib/health/activity-status';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';
import { prisma } from '@sharpit/db/client';

const putSchema = z.object({
  status: z.enum(['active', 'paused', 'injured', 'sick']),
  retention: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('until_modified') }),
      z.object({
        kind: z.literal('until_date'),
        untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    ])
    .optional(),
  travelId: z.string().nullable().optional(),
  /** A past day to set after the fact; absent or today sets the current mode. */
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function GET() {
  // Outside try: Cache Components prerender interrupt must not be swallowed.
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const store = await getActivityStatusStoreDb(prisma, athleteId);
    return NextResponse.json({ store });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de charger le statut d’activité' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload statut invalide' }, { status: 400 });
    }
    const { day, ...write } = parsed.data;
    const today = todayIsoDate();
    if (day && day > today) {
      return NextResponse.json({ error: 'Payload statut invalide' }, { status: 400 });
    }
    if (day && day < today) {
      const [setDay, store] = await Promise.all([
        setActivityStatusDayDb(prisma, athleteId, day, write.status),
        getActivityStatusStoreDb(prisma, athleteId),
      ]);
      return NextResponse.json({ store, day: setDay });
    }
    const store = await setActivityStatusDb(prisma, athleteId, write);
    return NextResponse.json({ store });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible d’enregistrer le statut d’activité' },
      { status: 500 },
    );
  }
}
