import { NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  ensureMorningRecalibration,
  getMorningRecalibrationPresentation,
} from '@sharpit/server/lib/morning-recalibration/service';
import { resolveAllowedTrainingDayId } from '@sharpit/server/lib/validators/training-day-window';

function trainingDayErrorResponse(code: string) {
  return NextResponse.json({ error: 'Jour d’entraînement invalide', code }, { status: 400 });
}

/** Evaluate / return today's morning session recalibration proposal (idempotent write). */
export async function POST(request: Request) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = (await request.json().catch(() => ({}))) as {
      trainingDayId?: string;
      athleteId?: string;
    };
    // Athlete always from session — ignore any client-supplied athleteId.
    void body.athleteId;
    const day = await resolveAllowedTrainingDayId(athleteId, body.trainingDayId);
    if (!day.ok) {
      return trainingDayErrorResponse(day.code);
    }
    const { presentation: proposal } = await ensureMorningRecalibration(
      athleteId,
      day.trainingDayId,
    );
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('[morning-recalibration]', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Impossible d’évaluer l’ajustement' }, { status: 500 });
  }
}

/** Read-only — never creates a decision. Use POST to ensure/evaluate. */
export async function GET(request: Request) {
  // Read search params before try so Cache Components prerender interrupts propagate.
  const { searchParams } = new URL(request.url);
  const candidate = searchParams.get('trainingDayId');

  try {
    const athleteId = await getCurrentAthleteId();
    const day = await resolveAllowedTrainingDayId(athleteId, candidate);
    if (!day.ok) {
      return trainingDayErrorResponse(day.code);
    }
    const proposal = await getMorningRecalibrationPresentation(athleteId, day.trainingDayId);
    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('[morning-recalibration]', error instanceof Error ? error.name : 'unknown');
    return NextResponse.json({ error: 'Impossible d’évaluer l’ajustement' }, { status: 500 });
  }
}
