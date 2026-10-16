import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  getMorningWellnessCheckin,
  hasMorningWellnessCheckin,
  submitMorningWellnessCheckin,
} from '@sharpit/server/lib/journal/wellness-checkin';
import { wellnessCheckinSchema } from '@sharpit/server/lib/validators/wellness-checkin';
import { resolveAllowedTrainingDayId } from '@sharpit/server/lib/validators/training-day-window';

function logFailure(action: string, error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  console.error(
    `[wellness-checkin] ${action} failed`,
    error instanceof Error ? error.name : 'unknown',
    code,
  );
}

function trainingDayErrorResponse(code: string) {
  return NextResponse.json({ error: 'Jour d’entraînement invalide', code }, { status: 400 });
}

export async function GET(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const { searchParams } = new URL(request.url);
    const day = await resolveAllowedTrainingDayId(athleteId, searchParams.get('trainingDayId'));
    if (!day.ok) {
      return trainingDayErrorResponse(day.code);
    }

    const [completed, entry] = await Promise.all([
      hasMorningWellnessCheckin(athleteId, day.trainingDayId),
      getMorningWellnessCheckin(athleteId, day.trainingDayId),
    ]);
    return NextResponse.json({
      trainingDayId: day.trainingDayId,
      completed,
      entry,
    });
  } catch (error) {
    logFailure('read', error);
    return NextResponse.json({ error: 'Impossible de charger le ressenti' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = wellnessCheckinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', code: 'WELLNESS_CHECKIN_INVALID' },
        { status: 400 },
      );
    }

    // Athlete always from session — ignore any client-supplied athleteId.
    const candidate = typeof body?.trainingDayId === 'string' ? body.trainingDayId : null;
    const day = await resolveAllowedTrainingDayId(athleteId, candidate);
    if (!day.ok) {
      return trainingDayErrorResponse(day.code);
    }

    const result = await submitMorningWellnessCheckin(athleteId, day.trainingDayId, parsed.data);
    // Additive `verdict`: codes only. Older TestFlight builds ignore unknown fields.
    // If verdict is null, client refetches GET /api/v1/today?trainingDayId=<localDate>.
    return NextResponse.json(
      {
        trainingDayId: day.trainingDayId,
        completed: true,
        alreadyCompleted: result.alreadyCompleted,
        verdict: result.verdict,
      },
      { status: result.alreadyCompleted ? 200 : 201 },
    );
  } catch (error) {
    logFailure('write', error);
    return NextResponse.json({ error: "Impossible d'enregistrer le ressenti" }, { status: 500 });
  }
}
