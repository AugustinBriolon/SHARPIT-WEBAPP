import { NextRequest, NextResponse } from 'next/server';
import {
  PROJECTION_VERDICT_LABELS,
  projectionVerdict,
} from '@sharpit/app/lib/goals/goal-race-projection';
import {
  missingLegs,
  raceTargetBounds,
  resolveStructuredRace,
} from '@sharpit/app/lib/goals/race-formats';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { previewRaceProjection } from '@sharpit/server/lib/goals/race-projection';
import { projectionPreviewSchema } from '@sharpit/server/lib/validators/goal';

/**
 * The goal form's projection and verdict for a race not saved yet (ADR-082). Never writes:
 * no goal, no snapshot. `targetBounds` follows the edited distances of a custom format.
 */
export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const parsed = projectionPreviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const race = resolveStructuredRace(parsed.data);
    if (!race || missingLegs(race).length > 0) {
      return NextResponse.json({ error: 'Format ou distances incomplets' }, { status: 422 });
    }
    const projection = await previewRaceProjection(athleteId, {
      ...race,
      targetSeconds: parsed.data.targetSeconds ?? null,
      targetDate: parsed.data.targetDate ?? null,
    });
    const verdict = projection ? projectionVerdict(projection, projection.targetSec) : null;
    return NextResponse.json({
      projection,
      verdict,
      verdictLabel: verdict ? PROJECTION_VERDICT_LABELS[verdict] : null,
      targetBounds: raceTargetBounds(race),
    });
  } catch (error) {
    console.error('[api/v1/goals/projection-preview]', {
      name: error instanceof Error ? error.name : 'Error',
    });
    return NextResponse.json({ error: 'Projection indisponible' }, { status: 500 });
  }
}
