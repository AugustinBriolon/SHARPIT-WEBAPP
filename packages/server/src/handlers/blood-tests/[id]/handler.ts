import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';
import { deleteBloodTest } from '@sharpit/server/lib/queries/blood-tests';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    if (!(await deleteBloodTest(athleteId, id))) {
      return NextResponse.json({ error: 'Analyse introuvable' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logSafeError('blood-tests/delete', error);
    return NextResponse.json({ error: 'Impossible de supprimer l’analyse' }, { status: 500 });
  }
}
