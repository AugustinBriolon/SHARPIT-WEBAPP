/**
 * Callers: apps/api route re-export. API: GET /api/v1/effort. Schema: none.
 * User: "Implement the plan as specified… Don't stop until you have completed all the to-dos."
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { buildEffortViewModel } from '@sharpit/server/lib/presentation/effort/effort';
import { loadV1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';
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
    const [viewModel, dayScores] = await Promise.all([
      buildEffortViewModel(athleteId, trainingDayId),
      loadV1DayScores(athleteId, trainingDayId).catch((error) => {
        console.error('[api/v1/effort/day-scores]', error);
        return { targetBand: null as null };
      }),
    ]);
    return NextResponse.json(
      projectV1Effort(viewModel, trainingDayId, { targetBand: dayScores.targetBand }),
    );
  } catch (error) {
    console.error('[api/v1/effort]', error);
    return NextResponse.json({ error: 'Impossible de produire la vue Effort' }, { status: 500 });
  }
}
