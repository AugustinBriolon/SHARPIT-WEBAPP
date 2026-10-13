import { NextRequest, NextResponse } from 'next/server';
import {
  deleteGoal,
  getGoalActivities,
  getGoalById,
  getGoals,
  updateGoal,
} from '@sharpit/server/lib/queries';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  recordManualGoalAchievement,
  withRaceStanding,
} from '@sharpit/server/lib/goals/goal-achievements';
import { withRaceProjection } from '@sharpit/server/lib/goals/race-projection';
import { goalPriorityFields } from '@sharpit/app/lib/goals/goal-priority';
import { settleStructuredRace, updateGoalSchema } from '@sharpit/server/lib/validators/goal';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const goal = await getGoalById(athleteId, id);
    if (!goal) {
      return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
    }
    const [[projected], activities, goals] = await Promise.all([
      withRaceStanding(athleteId, [goal]).then((goals) => withRaceProjection(athleteId, goals)),
      getGoalActivities(athleteId, id),
      getGoals(athleteId),
    ]);
    return NextResponse.json({
      ...projected,
      ...goalPriorityFields(projected, goals),
      activities,
    });
  } catch (error) {
    console.error('[goals/GET]', error);
    return NextResponse.json({ error: "Impossible de charger l'objectif" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = updateGoalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await getGoalById(athleteId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
    }

    const race = settleStructuredRace(parsed.data, existing);
    if (!race.ok) {
      return NextResponse.json(race.body, { status: 422 });
    }

    const goal = await updateGoal(athleteId, id, {
      ...parsed.data,
      ...race.data,
    } as Parameters<typeof updateGoal>[2]);
    if (!goal) {
      return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
    }

    if (parsed.data.achieved === true && !existing.achieved) {
      await recordManualGoalAchievement({ ...existing, ...goal });
    }

    const [[projected], goals] = await Promise.all([
      withRaceStanding(athleteId, [goal]).then((goals) => withRaceProjection(athleteId, goals)),
      getGoals(athleteId),
    ]);
    return NextResponse.json({ ...projected, ...goalPriorityFields(projected, goals) });
  } catch (error) {
    console.error('[goals/PATCH]', error);
    const message =
      error instanceof Error ? error.message : "Impossible de mettre à jour l'objectif";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    await deleteGoal(athleteId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Impossible de supprimer l'objectif" }, { status: 500 });
  }
}
