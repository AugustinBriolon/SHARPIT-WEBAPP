import { NextRequest, NextResponse } from 'next/server';
import { pushBrickToGoogleInBackground } from '@sharpit/server/lib/integrations/google/google-sync';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { chainBrickLegStartTimes } from '@sharpit/server/lib/planned-session/brick/brick-schedule';
import {
  createBrickSessions,
  getPlannedSessionById,
  isOwnGoalOrNone,
} from '@sharpit/server/lib/queries';
import { createBrickSchema } from '@sharpit/server/lib/validators/planned-session';

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = createBrickSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { date, startTime, goalId, legs } = parsed.data;
    if (!(await isOwnGoalOrNone(athleteId, goalId))) {
      return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
    }
    // A brick is a chain, not a stack: each leg starts when the previous ends.
    const legStartTimes = chainBrickLegStartTimes(startTime, legs);
    const created = await createBrickSessions(
      athleteId,
      legs.map((leg, index) => ({
        type: leg.type,
        date,
        startTime: legStartTimes[index] ?? null,
        title: leg.title ?? null,
        description: leg.description ?? null,
        durationMin: leg.durationMin ?? null,
        load: leg.load ?? null,
        intensity: leg.intensity ?? null,
        goalId: goalId ?? null,
      })),
    );

    pushBrickToGoogleInBackground(created);

    const fresh = await Promise.all(created.map((s) => getPlannedSessionById(athleteId, s.id)));
    return NextResponse.json(fresh.filter(Boolean), { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de créer le brick' }, { status: 500 });
  }
}
