import type { ActivityDetailPayload } from '@sharpit/app/lib/web/payloads';
import { ActivityType } from '@prisma/client';
import { canGenerateNarrativeForActivity } from '@sharpit/server/lib/access/narrative-access';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { getGoalAchievementsForActivity } from '@sharpit/server/lib/goals/goal-achievements';
import { resolveBrickSiblingActivityLinks } from '@sharpit/app/lib/planned-session/brick/brick-sessions';
import {
  getActivityById,
  getBrickSessions,
  getMultisportLegsForActivity,
} from '@sharpit/server/lib/queries';
import { getPerformanceRecordsForActivity } from '@sharpit/server/lib/training/records/records';
import { loadRaceAnalysis } from '@sharpit/server/lib/activity/multisport/load-race-analysis';

/**
 * Everything the web's activity page reads, in one `api.` call (ADR-048 phase 3f); the page
 * builds its view (specs, hero, coach panel) from it without touching the database.
 */
export async function loadActivityDetail(
  athleteId: string,
  id: string,
): Promise<ActivityDetailPayload | null> {
  const [activity, goalValidations, performanceRecords] = await Promise.all([
    getActivityById(athleteId, id),
    getGoalAchievementsForActivity(id),
    getPerformanceRecordsForActivity(athleteId, id),
  ]);
  if (!activity) {
    return null;
  }
  const brickGroupId = activity.plannedSession?.brickGroupId ?? null;
  const [multisportLegs, narrativeAccess, brickLegs, raceAnalysis] = await Promise.all([
    activity.type === ActivityType.TRIATHLON
      ? getMultisportLegsForActivity(athleteId, activity)
      : Promise.resolve(null),
    canGenerateNarrativeForActivity(athleteId),
    brickGroupId ? getBrickSessions(athleteId, brickGroupId) : Promise.resolve([]),
    loadRaceAnalysis(athleteId, activity),
  ]);
  return {
    activity,
    goal: activity.goal,
    multisportLegs,
    raceAnalysis,
    goalValidations,
    performanceRecords,
    narrativeAccess,
    brickSiblings: resolveBrickSiblingActivityLinks(brickLegs, activity.id),
    coachEnabled: isCoachConfigured(),
  };
}

export type { ActivityDetailPayload };
