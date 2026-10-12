import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@sharpit/db/client';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  createTravelMemoryEntry,
  listCoachMemoryEntries,
} from '@sharpit/server/lib/coach-memory/core/service';
import { applyTravelContextToUpcomingSessions } from '@sharpit/server/lib/travel-context/service';
import { refreshAndPersistPlannedSessionContext } from '@sharpit/server/lib/planned-session/resolve-context';

const travelDisciplineSchema = z.enum(['RUN', 'BIKE', 'SWIM', 'STRENGTH', 'MOBILITY']);

const travelPayloadSchema = z
  .object({
    type: z.enum(['TRAVEL', 'CONSTRAINT', 'INJURY', 'PREFERENCE', 'NOTE']).default('TRAVEL'),
    label: z.string().optional().nullable(),
    /** Required for TRAVEL only — other types have no place. */
    locationLabel: z.string().optional().nullable(),
    locationLat: z.number().optional().nullable(),
    locationLng: z.number().optional().nullable(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    note: z.string().optional().nullable(),
    trainingConstraint: z.enum(['FULL', 'REDUCED', 'MOBILITY_ONLY', 'NONE']).optional().nullable(),
    allowedDisciplines: z.array(travelDisciplineSchema).optional().nullable(),
    noStructuredTraining: z.boolean().optional(),
    applyToPlannedSessions: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'TRAVEL' && (!data.locationLabel || data.locationLabel.trim().length < 2)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationLabel'],
        message: 'Un lieu est requis pour un déplacement.',
      });
    }
  });

export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    const data = await listCoachMemoryEntries(prisma, athleteId);
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de charger la mémoire du coach' },
      { status: 500 },
    );
  }
}

async function refreshSessionContexts(input: {
  athleteId: string;
  startDate: Date;
  endDate: Date;
  locationLat: number | null | undefined;
  locationLng: number | null | undefined;
}) {
  const { athleteId, startDate, endDate, locationLat, locationLng } = input;
  const sessions = await prisma.plannedSession.findMany({
    where: {
      athleteId,
      date: { gte: startDate, lte: endDate },
      locationLat: locationLat ?? undefined,
      locationLng: locationLng ?? undefined,
    },
    select: { id: true },
  });
  for (const session of sessions) {
    try {
      await refreshAndPersistPlannedSessionContext(athleteId, session.id);
    } catch (error) {
      console.error('[coach-memory/refresh]', session.id, error);
    }
  }
}

async function applyTravelToPlannedSessions(
  athleteId: string,
  entry: Awaited<ReturnType<typeof createTravelMemoryEntry>>,
  data: z.infer<typeof travelPayloadSchema>,
) {
  if (data.type !== 'TRAVEL' || data.applyToPlannedSessions === false) {
    return 0;
  }
  const updatedSessions = await applyTravelContextToUpcomingSessions(prisma, athleteId, entry.id);
  await refreshSessionContexts({
    athleteId,
    startDate: data.startDate,
    endDate: data.endDate,
    locationLat: entry.locationLat,
    locationLng: entry.locationLng,
  });
  return updatedSessions;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = travelPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.endDate < parsed.data.startDate) {
      return NextResponse.json(
        { error: 'La date de fin doit être postérieure à la date de début' },
        { status: 400 },
      );
    }

    const athleteId = await getCurrentAthleteId();
    const entry = await createTravelMemoryEntry(prisma, athleteId, {
      ...parsed.data,
      source: 'USER',
    });

    const updatedSessions = await applyTravelToPlannedSessions(athleteId, entry, parsed.data);

    return NextResponse.json({ entry, updatedSessions }, { status: 201 });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : 'Impossible de créer l’entrée de mémoire';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
