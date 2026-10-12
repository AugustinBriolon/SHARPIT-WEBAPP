import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@sharpit/db/client';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  deleteCoachMemoryEntry,
  updateTravelMemoryEntry,
} from '@sharpit/server/lib/coach-memory/core/service';
import { travelContextToMemoryEntry } from '@sharpit/server/lib/coach-memory/summary/present';

const travelDisciplineSchema = z.enum(['RUN', 'BIKE', 'SWIM', 'STRENGTH', 'MOBILITY']);

const updateSchema = z
  .object({
    type: z.enum(['TRAVEL', 'CONSTRAINT', 'INJURY', 'PREFERENCE', 'NOTE']),
    label: z.string().optional().nullable(),
    locationLabel: z.string().optional().nullable(),
    locationLat: z.number().optional().nullable(),
    locationLng: z.number().optional().nullable(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    note: z.string().optional().nullable(),
    trainingConstraint: z.enum(['FULL', 'REDUCED', 'MOBILITY_ONLY', 'NONE']).optional().nullable(),
    allowedDisciplines: z.array(travelDisciplineSchema).optional().nullable(),
    noStructuredTraining: z.boolean().optional(),
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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const travel = await prisma.athleteTravelContext.findFirst({ where: { id, athleteId } });
    if (!travel) {
      return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
    }
    return NextResponse.json({ entry: travelContextToMemoryEntry(travel) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de charger l’entrée de mémoire' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const existing = await prisma.athleteTravelContext.findFirst({ where: { id, athleteId } });
    if (!existing) {
      return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
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

    const entry = await updateTravelMemoryEntry(prisma, athleteId, id, parsed.data);
    if (!entry) {
      return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
    }
    return NextResponse.json({ entry });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : 'Impossible de modifier l’entrée de mémoire';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const existing = await prisma.athleteTravelContext.findFirst({ where: { id, athleteId } });
    if (!existing) {
      return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
    }

    await deleteCoachMemoryEntry(prisma, athleteId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de supprimer l’entrée de mémoire' },
      { status: 500 },
    );
  }
}
