import { NextRequest, NextResponse } from 'next/server';
import {
  enrichGoalsWithProgress,
  withRaceStanding,
} from '@sharpit/server/lib/goals/goal-achievements';
import { withRaceProjection } from '@sharpit/server/lib/goals/race-projection';
import { goalPriorityFields } from '@sharpit/app/lib/goals/goal-priority';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { createGoal, getGoals } from '@sharpit/server/lib/queries';
import { createGoalSchema, settleStructuredRace } from '@sharpit/server/lib/validators/goal';

export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    const goals = await getGoals(athleteId);
    const enriched = await enrichGoalsWithProgress(athleteId, goals);
    const projected = await withRaceProjection(athleteId, enriched);
    return NextResponse.json(projected.map((g) => ({ ...g, ...goalPriorityFields(g, goals) })));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de charger les objectifs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = createGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const race = settleStructuredRace(parsed.data, null);
    if (!race.ok) {
      return NextResponse.json(race.body, { status: 422 });
    }

    const goal = await createGoal(athleteId, {
      ...parsed.data,
      ...race.data,
    } as Parameters<typeof createGoal>[1]);
    const [[projected], goals] = await Promise.all([
      withRaceStanding(athleteId, [goal]).then((goals) => withRaceProjection(athleteId, goals)),
      getGoals(athleteId),
    ]);
    return NextResponse.json(
      { ...projected, ...goalPriorityFields(projected, goals) },
      { status: 201 },
    );
  } catch (error) {
    console.error('[goals/POST]', error);
    const message = error instanceof Error ? error.message : "Impossible de créer l'objectif";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
