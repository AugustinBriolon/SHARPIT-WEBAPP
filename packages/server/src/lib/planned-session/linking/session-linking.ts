import { addDays, startOfDay } from 'date-fns';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { isProAthlete } from '@sharpit/server/lib/access/is-pro-athlete';
import { analyzePlannedSession } from '@sharpit/server/lib/coach/plan/coach-analysis';
import { scorePlannedActivityMatch } from '@sharpit/app/lib/planned-session/linking/session-link-match-score';
import {
  linkPlannedSessionActivity,
  setPlannedSessionAnalysis,
} from '@sharpit/server/lib/queries/planned-sessions';
import { prisma } from '@sharpit/db/client';
import { withAnalysisRun } from '@sharpit/server/lib/analysis/analysis-run-store';
import {
  aiReadableActivityWhere,
  visibleActivityWhere,
} from '@sharpit/app/lib/query/activity-include';
import { Prisma } from '@prisma/client';
import { checkRateLimit, rateLimiters } from '@sharpit/server/lib/rate-limit';

export { scorePlannedActivityMatch } from '@sharpit/app/lib/planned-session/linking/session-link-match-score';

async function autoLinkOneActivity(
  athleteId: string,
  activityId: string,
  reservedSessionIds: Set<string>,
): Promise<{ sessionId: string } | null> {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, athleteId },
    select: { id: true, type: true, date: true, duration: true },
  });
  if (!activity) {
    return null;
  }

  const alreadyLinked = await prisma.plannedSession.findFirst({
    where: { activityId: activity.id },
    select: { id: true },
  });
  if (alreadyLinked) {
    return null;
  }

  const day = startOfDay(activity.date);
  const candidates = await prisma.plannedSession.findMany({
    where: {
      athleteId,
      activityId: null,
      type: activity.type,
      date: { gte: day, lt: addDays(day, 1) },
      ...(reservedSessionIds.size > 0 ? { id: { notIn: [...reservedSessionIds] } } : {}),
    },
    select: { id: true, date: true, durationMin: true },
  });

  const ranked = candidates
    .map((s) => ({ s, score: scorePlannedActivityMatch(s, activity) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const [best] = ranked;

  if (!best) {
    return null;
  }

  await linkPlannedSessionActivity(athleteId, best.s.id, activity.id);
  reservedSessionIds.add(best.s.id);

  return { sessionId: best.s.id };
}

/**
 * Lie automatiquement les activités nouvelles aux séances planifiées du même jour.
 * Compliance LLM analysis is separate ({@link analyzeLinkedPlannedSessions}) so
 * sync / open-path can await only the cheap DB match.
 */
export async function autoLinkActivities(
  athleteId: string,
  activityIds: string[],
): Promise<{ linked: number; sessionIds: string[] }> {
  const reserved = new Set<string>();
  const sessionIds: string[] = [];

  for (const activityId of activityIds) {
    const result = await autoLinkOneActivity(athleteId, activityId, reserved);
    if (!result) {
      continue;
    }
    sessionIds.push(result.sessionId);
  }

  return { linked: sessionIds.length, sessionIds };
}

/**
 * Links the day's activities that still have no planned session.
 * Safe to call on every read: an activity that is already linked is not a candidate.
 * Returns the sessions linked by this call, for the caller to analyze off the critical path.
 */
export async function autoLinkActivitiesOfDay(athleteId: string, day: Date): Promise<string[]> {
  const start = startOfDay(day);
  const unlinked = await prisma.activity.findMany({
    where: {
      athleteId,
      ...visibleActivityWhere,
      date: { gte: start, lt: addDays(start, 1) },
      plannedSession: { is: null },
    },
    select: { id: true },
  });
  if (unlinked.length === 0) {
    return [];
  }

  const { sessionIds } = await autoLinkActivities(
    athleteId,
    unlinked.map((activity) => activity.id),
  );
  return sessionIds;
}

/** Post-link compliance analysis — run off the HTTP critical path. */
export async function analyzeLinkedPlannedSessions(
  athleteId: string,
  sessionIds: string[],
): Promise<number> {
  if (!isCoachConfigured() || sessionIds.length === 0) {
    return 0;
  }
  // Compliance analysis is coaching: Pro-only (ADR-097).
  if (!(await isProAthlete(athleteId))) {
    return 0;
  }

  let analyzed = 0;
  for (const sessionId of sessionIds) {
    // Same budget as `/analyze`: unlink → relink (or → today's auto-link) must not loop model calls.
    const limit = await checkRateLimit(rateLimiters.sessionAnalyze, athleteId, {
      failClosed: true,
    });
    if (!limit.ok) {
      break;
    }
    try {
      const ran = await withAnalysisRun(
        { athleteId, kind: 'SESSION_COMPLIANCE', targetId: sessionId },
        async () => {
          const analysis = await analyzePlannedSession(athleteId, sessionId);
          if (analysis) {
            await setPlannedSessionAnalysis(athleteId, sessionId, analysis);
          }
        },
      );
      if (ran) {
        analyzed += 1;
      }
    } catch (error) {
      console.error('[session-linking] analyze', sessionId, error);
    }
  }
  return analyzed;
}

/** How far back a linked session without its reading is still picked up. */
const AWAITING_WINDOW_DAYS = 7;
/** A reading that failed or came back empty is not asked again before this. */
const RETRY_AFTER_MS = 6 * 60 * 60_000;

/**
 * Linked sessions of the last week that still have no compliance reading. The reading is
 * asked once when a session is linked; when that run fails, is rate-limited or returns
 * nothing, nothing asked again and the athlete read « Calcul en cours » for good. Strava-only
 * records are left out (they may not reach a model, ADR-126), and so is a session whose run
 * is in flight or ended less than six hours ago, so a broken one costs four calls a day at most.
 */
export async function plannedSessionsAwaitingAnalysis(
  athleteId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const sessions = await prisma.plannedSession.findMany({
    where: {
      athleteId,
      analysis: { equals: Prisma.DbNull },
      activity: {
        is: {
          ...visibleActivityWhere,
          ...aiReadableActivityWhere,
          date: { gte: addDays(now, -AWAITING_WINDOW_DAYS) },
        },
      },
    },
    select: { id: true },
  });
  if (sessions.length === 0) {
    return [];
  }
  const ids = sessions.map((session) => session.id);
  const recentRuns = await prisma.analysisRun.findMany({
    where: {
      athleteId,
      kind: 'SESSION_COMPLIANCE',
      targetId: { in: ids },
      OR: [
        { status: 'RUNNING' },
        { finishedAt: { gte: new Date(now.getTime() - RETRY_AFTER_MS) } },
      ],
    },
    select: { targetId: true },
  });
  const held = new Set(recentRuns.map((run) => run.targetId));
  return ids.filter((id) => !held.has(id));
}

/** Asks again for every reading still owed — run off the HTTP critical path. */
export async function analyzeAwaitingPlannedSessions(athleteId: string): Promise<number> {
  if (!isCoachConfigured()) {
    return 0;
  }
  return analyzeLinkedPlannedSessions(athleteId, await plannedSessionsAwaitingAnalysis(athleteId));
}
