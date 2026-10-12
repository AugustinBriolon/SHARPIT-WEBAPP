import { NextRequest, NextResponse, after } from 'next/server';
import { buildActivityUpdateData } from '@sharpit/server/lib/activity/activity-service';
import { onWellnessSubmitted } from '@sharpit/server/lib/athlete-state/orchestrator';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  removeManualActivityObservations,
  syncManualActivityObservations,
} from '@sharpit/server/lib/observation/manual-observation-sync';
import {
  deleteActivity,
  getActivityById,
  getGoalById,
  updateActivity,
} from '@sharpit/server/lib/queries';
import { clearRaceResult, recordRaceResult } from '@sharpit/server/lib/goals/goal-achievements';
import { loadRaceAnalysis } from '@sharpit/server/lib/activity/multisport/load-race-analysis';
import { updateRecordsForTypesSafe } from '@sharpit/server/lib/training/records/records';
import { computeTrainingDayId } from '@sharpit/core/training/training-day';
import { updateActivitySchema } from '@sharpit/app/lib/validators/activity';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * A relinked race result follows the activity: the old goal loses it, the new one records it.
 * The link itself is saved already — a failure here costs the result, not the request.
 */
async function syncRaceResult(
  before: { id: string; goalId: string | null },
  updated: { id: string; duration: number | null },
  goal: Awaited<ReturnType<typeof getGoalById>>,
): Promise<void> {
  try {
    if (before.goalId && before.goalId !== goal?.id) {
      await clearRaceResult(before.goalId, before.id);
    }
    if (goal) {
      await recordRaceResult(goal, updated, 'manual');
    }
  } catch (error) {
    console.error('[activities/PATCH] race result', error);
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const activity = await getActivityById(athleteId, id);

    if (!activity) {
      return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 });
    }

    return NextResponse.json({
      ...activity,
      raceAnalysis: await loadRaceAnalysis(athleteId, activity),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de charger la séance' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const body = await request.json();
    const parsed = updateActivitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await getActivityById(athleteId, id);
    // An absorbed leg is read-only: edits and links belong to its multisport parent.
    if (!existing || existing.mergedIntoId) {
      return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 });
    }
    const goal = parsed.data.goalId ? await getGoalById(athleteId, parsed.data.goalId) : null;
    if (parsed.data.goalId && !goal) {
      return NextResponse.json({ error: 'Objectif introuvable' }, { status: 404 });
    }

    const newType = parsed.data.type ?? existing.type;
    const updateInput =
      parsed.data.type !== undefined ? { ...parsed.data, type: newType } : parsed.data;
    const activity = await updateActivity(
      athleteId,
      id,
      buildActivityUpdateData(updateInput) as Parameters<typeof updateActivity>[2],
    );
    if (!activity) {
      return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 });
    }

    if (parsed.data.goalId !== undefined) {
      await syncRaceResult(existing, activity, goal);
    }

    const touchesSubjective = parsed.data.feeling !== undefined || parsed.data.rpe !== undefined;

    // Instant UX: return the updated row immediately; twin sync must not block PATCH.
    after(async () => {
      try {
        await syncManualActivityObservations(activity);
        await updateRecordsForTypesSafe(athleteId, [existing.type, newType]);
        if (touchesSubjective) {
          const trainingDayId = computeTrainingDayId(new Date(activity.date));
          await onWellnessSubmitted(athleteId, trainingDayId);
        }
      } catch (error) {
        console.error('[activities/PATCH] background sync', error);
      }
    });

    return NextResponse.json(activity);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de mettre à jour la séance' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const existing = await getActivityById(athleteId, id);
    const deleted = await deleteActivity(athleteId, id);
    for (const deletedId of [id, ...(deleted?.mergedLegIds ?? [])]) {
      await removeManualActivityObservations(athleteId, deletedId);
    }
    if (existing) {
      await updateRecordsForTypesSafe(athleteId, [existing.type]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de supprimer la séance' }, { status: 500 });
  }
}
