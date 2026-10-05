import { NextRequest, NextResponse } from 'next/server';
import {
  removePhysicalConditionObservations,
  syncPhysicalConditionObservation,
} from '@sharpit/server/lib/observation/manual-observation-sync';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { syncConditionFromNote } from '@sharpit/server/lib/physical-health/sync-condition';
import {
  deletePhysicalNote,
  getPhysicalNoteById,
  recordPhysicalStatusChange,
  updatePhysicalNote,
} from '@sharpit/server/lib/queries';
import { updatePhysicalNoteSchema } from '@sharpit/server/lib/validators/physical-note';
import type { z } from 'zod';

type RouteContext = { params: Promise<{ id: string }> };

function applyResolvedAtPatch(
  data: Parameters<typeof updatePhysicalNote>[2],
  parsed: z.infer<typeof updatePhysicalNoteSchema>,
  existing: NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>,
) {
  if (parsed.status === 'RESOLVED' && parsed.resolvedAt === undefined && !existing.resolvedAt) {
    (data as { resolvedAt?: Date }).resolvedAt = new Date();
  }
  if (parsed.status && parsed.status !== 'RESOLVED') {
    (data as { resolvedAt?: Date | null }).resolvedAt = null;
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = updatePhysicalNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await getPhysicalNoteById(athleteId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Note introuvable' }, { status: 404 });
    }

    const data = { ...parsed.data } as Parameters<typeof updatePhysicalNote>[2];
    applyResolvedAtPatch(data, parsed.data, existing);

    const nextStatus = parsed.data.status;
    if (nextStatus && nextStatus !== existing.status) {
      await recordPhysicalStatusChange(id, nextStatus);
    }
    const note = await updatePhysicalNote(athleteId, id, data);
    if (!note) {
      return NextResponse.json({ error: 'Note introuvable' }, { status: 404 });
    }
    await Promise.all([
      syncPhysicalConditionObservation(note),
      syncConditionFromNote(note, existing.status),
    ]);
    return NextResponse.json(note);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de mettre à jour la note' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    await deletePhysicalNote(athleteId, id);
    await removePhysicalConditionObservations(athleteId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de supprimer la note' }, { status: 500 });
  }
}
