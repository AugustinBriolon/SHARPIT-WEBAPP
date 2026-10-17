import { after } from 'next/server';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { generateAndStoreDailyBriefing } from '@sharpit/server/lib/briefing/daily-briefing';
import {
  regenerateAthleteSnapshotAfterBriefing,
  regenerateAthleteSnapshotAfterInference,
} from '@sharpit/server/lib/athlete-state/snapshot-service';
import { trainingDayIdNow } from '@sharpit/server/lib/athlete-state/freshness-service';
import { prisma } from '@sharpit/db/client';

/**
 * Background path — never blocks the fast inference response.
 * Failures are logged; tasks are idempotent.
 *
 * Auto-link (DB match) stays awaited on the sync / import path.
 * Compliance LLM analysis runs here via plannedSessionIdsToAnalyze.
 */
export function scheduleBackgroundTasks(params: {
  athleteId: string;
  activityIds: string[];
  regenerateBriefing: boolean;
  trainingDayId?: string;
  /** Planned sessions linked this turn — analyze off the critical path. */
  plannedSessionIdsToAnalyze?: string[];
}): void {
  const run = () =>
    runBackgroundTasks(params).catch((error) => {
      console.error('[athlete-state/background]', error);
    });

  // `after()` keeps the work alive past the response; a bare promise is frozen
  // with the serverless function, which silently dropped narratives and
  // compliance analyses in production (ADR-036).
  try {
    after(run);
  } catch {
    // Outside a request scope (scripts, tests) — run it inline.
    void run();
  }
}

/** A sync keeps a briefing written in the last quarter hour rather than paying the model again. */
const BACKGROUND_BRIEFING_MIN_INTERVAL_MINUTES = 15;

type BackgroundTaskParams = {
  athleteId: string;
  activityIds: string[];
  regenerateBriefing: boolean;
  trainingDayId?: string;
  plannedSessionIdsToAnalyze?: string[];
};

async function enrichTodayContext(athleteId: string): Promise<void> {
  try {
    const { enrichTodayActivitiesContext } =
      await import('@sharpit/server/lib/activity/detail/enrich-observed-context');
    await enrichTodayActivitiesContext(prisma, athleteId);
  } catch (error) {
    console.error('[athlete-state/background/enrich-today]', error);
  }
}

async function analyzeLinkedSessions(
  athleteId: string,
  plannedSessionIdsToAnalyze: string[],
): Promise<void> {
  try {
    const { analyzeLinkedPlannedSessions } =
      await import('@sharpit/server/lib/planned-session/linking/session-linking');
    await analyzeLinkedPlannedSessions(athleteId, plannedSessionIdsToAnalyze);
  } catch (error) {
    console.error('[athlete-state/background/compliance-analyze]', error);
  }
}

async function recomputeNeuromuscularIfNeeded(
  athleteId: string,
  activityIds: string[],
  dayId: string,
): Promise<void> {
  try {
    const { ensureStreamsForNeuromuscularEfficiency, shouldRecomputeNeuromuscularAdaptation } =
      await import('@sharpit/server/lib/streams/ensure-streams-for-neuromuscular');

    const streamResult = await ensureStreamsForNeuromuscularEfficiency(athleteId, {
      activityIds,
      trainingDayId: dayId,
    });
    const needsNmeRecompute =
      streamResult.withData > 0 ||
      streamResult.fetched > 0 ||
      (await shouldRecomputeNeuromuscularAdaptation(athleteId, dayId));

    if (!needsNmeRecompute) {
      return;
    }

    const { loadTodayState } =
      await import('@sharpit/server/lib/today/navigation/today-state-server');
    const todayState = await loadTodayState({
      athleteId,
      trainingDayId: dayId,
      forceRefresh: true,
    });
    await regenerateAthleteSnapshotAfterInference(athleteId, dayId, todayState);
  } catch (error) {
    console.error('[athlete-state/background/nme-streams]', error);
  }
}

async function runBackgroundTasks(params: BackgroundTaskParams): Promise<void> {
  const { athleteId, activityIds, regenerateBriefing, trainingDayId, plannedSessionIdsToAnalyze } =
    params;
  const dayId = trainingDayId ?? trainingDayIdNow();

  await enrichTodayContext(athleteId);

  if (plannedSessionIdsToAnalyze && plannedSessionIdsToAnalyze.length > 0) {
    await analyzeLinkedSessions(athleteId, plannedSessionIdsToAnalyze);
  }

  await recomputeNeuromuscularIfNeeded(athleteId, activityIds, dayId);

  if (activityIds.length > 0 && isCoachConfigured()) {
    const { athleteHasAiProcessingConsent } =
      await import('@sharpit/server/lib/privacy/consent-store');
    if (await athleteHasAiProcessingConsent(athleteId)) {
      const { runActivityNarrativeForIds } =
        await import('@sharpit/server/lib/activity/narrative/activity-narrative');
      await runActivityNarrativeForIds(athleteId, activityIds);
    }
  }

  if (regenerateBriefing) {
    const refDate = new Date(`${dayId}T12:00:00.000Z`);
    // Deterministic fallback when AI consent missing — Twin engines stay OK.
    await generateAndStoreDailyBriefing(athleteId, refDate, {
      minIntervalMinutes: BACKGROUND_BRIEFING_MIN_INTERVAL_MINUTES,
    });
    await regenerateAthleteSnapshotAfterBriefing(athleteId, dayId);
  }
}
