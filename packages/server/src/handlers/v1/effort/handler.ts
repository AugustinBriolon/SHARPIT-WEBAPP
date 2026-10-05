import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { buildEffortViewModel } from '@sharpit/server/lib/presentation/effort/effort';
import { projectV1Effort } from '@sharpit/server/lib/presentation/v1/effort';

/**
 * Canonical Effort payload for native clients (ADR-040). The web drill-down keeps reading
 * `/api/presentation/effort`; both come from the same view model.
 */
export async function GET(request: NextRequest) {
  const trainingDayId = new URL(request.url).searchParams.get('trainingDayId');

  if (!trainingDayId || !/^\d{4}-\d{2}-\d{2}$/.test(trainingDayId)) {
    return NextResponse.json(
      { error: 'trainingDayId est requis et doit être au format YYYY-MM-DD' },
      { status: 400 },
    );
  }

  try {
    const athleteId = await getCurrentAthleteId();
    const viewModel = await buildEffortViewModel(athleteId, trainingDayId);
    return NextResponse.json(projectV1Effort(viewModel, trainingDayId));
  } catch (error) {
    console.error('[api/v1/effort]', error);
    return NextResponse.json({ error: 'Impossible de produire la vue Effort' }, { status: 500 });
  }
}
