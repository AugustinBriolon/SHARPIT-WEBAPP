import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  getMorningWellnessCheckin,
  hasMorningWellnessCheckin,
  submitMorningWellnessCheckin,
  todayTrainingDayIdForAthlete,
} from '@sharpit/server/lib/journal/wellness-checkin';
import { wellnessCheckinSchema } from '@sharpit/server/lib/validators/wellness-checkin';

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

export async function GET(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const { searchParams } = new URL(request.url);
    const trainingDayId =
      searchParams.get('trainingDayId') ?? (await todayTrainingDayIdForAthlete(athleteId));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trainingDayId)) {
      return NextResponse.json(
        { error: 'trainingDayId doit être au format YYYY-MM-DD' },
        { status: 400 },
      );
    }

    const [completed, entry] = await Promise.all([
      hasMorningWellnessCheckin(athleteId, trainingDayId),
      getMorningWellnessCheckin(athleteId, trainingDayId),
    ]);
    return NextResponse.json({
      trainingDayId,
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
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const trainingDayId =
      typeof body?.trainingDayId === 'string'
        ? body.trainingDayId
        : await todayTrainingDayIdForAthlete(athleteId);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trainingDayId)) {
      return NextResponse.json(
        { error: 'trainingDayId doit être au format YYYY-MM-DD' },
        { status: 400 },
      );
    }

    const result = await submitMorningWellnessCheckin(athleteId, trainingDayId, parsed.data);
    // Additive `verdict`: codes only. Older TestFlight builds ignore unknown fields.
    // If verdict is null, client refetches GET /api/v1/today?trainingDayId=<localDate>.
    return NextResponse.json(
      {
        trainingDayId,
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
