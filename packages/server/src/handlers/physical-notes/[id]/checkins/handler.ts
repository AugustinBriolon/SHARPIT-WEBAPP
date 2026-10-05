import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { syncPhysicalConditionObservation } from '@sharpit/server/lib/observation/manual-observation-sync';
import { syncConditionFromNote } from '@sharpit/server/lib/physical-health/sync-condition';
import { addPhysicalCheckin, getPhysicalNoteById } from '@sharpit/server/lib/queries';
import { createCheckinSchema } from '@sharpit/server/lib/validators/physical-note';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = createCheckinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const athleteId = await getCurrentAthleteId();
    const existing = await getPhysicalNoteById(athleteId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Note introuvable' }, { status: 404 });
    }

    const note = await addPhysicalCheckin(athleteId, id, parsed.data);
    if (note) {
      await Promise.all([syncPhysicalConditionObservation(note), syncConditionFromNote(note)]);
    }
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Impossible d'ajouter le point de suivi" }, { status: 500 });
  }
}
