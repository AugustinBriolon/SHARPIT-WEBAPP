import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import type { DataProvider } from '@sharpit/server/athlete-state/events';
import {
  createEventId,
  createTraceId,
  type AthleteStateEvent,
} from '@sharpit/server/athlete-state/events';
import type { TodayState } from '@sharpit/app/athlete-state/today-state';
import { scheduleBackgroundTasks } from '@sharpit/server/lib/athlete-state/background';
import {
  computeFreshnessSnapshot,
  providersNeedingSync,
  shouldSyncOnOpen,
  trainingDayIdNow,
} from '@sharpit/server/lib/athlete-state/freshness-service';
import { regenerateAthleteSnapshotAfterInference } from '@sharpit/server/lib/athlete-state/snapshot-service';
import {
  syncProviders,
  type ProviderSyncResult,
} from '@sharpit/server/lib/athlete-state/sync-providers';
import { getLatestAthleteSnapshot } from '@sharpit/server/infrastructure/athlete-state/snapshot-repository';
import { loadTodayState } from '@sharpit/server/lib/today/navigation/today-state-server';
import { prisma } from '@sharpit/db/client';
import { updateRecordsForTypesSafe } from '@sharpit/server/lib/training/records/records';

export type AthleteStateRefreshResult = {
  traceId: string;
  trainingDayId: string;
  freshness: Awaited<ReturnType<typeof computeFreshnessSnapshot>>;
  athleteSnapshot: AthleteSnapshot;
  /** @deprecated Use athleteSnapshot — kept for backward compatibility */
  todayState: TodayState;
  syncedProviders: DataProvider[];
  inferenceRan: boolean;
  /** True when regenerate produced a new snapshot fingerprint. */
  snapshotChanged: boolean;
};

/**
 * Decide whether open-path inference must recompute Twin engines.
 * Soft app opens reuse cached Twin outputs; sync / manual / cron force recompute.
 */
export function shouldForceInferenceOnRefresh(input: {
  source?: 'app_shell' | 'today_refresh' | 'cron';
  forceSync?: boolean;
  syncedProviderCount: number;
}): boolean {
  if (input.forceSync) {
    return true;
  }
  if (input.source === 'today_refresh' || input.source === 'cron') {
    return true;
  }
  if (input.syncedProviderCount > 0) {
    return true;
  }
  return false;
}

/**
 * Soft app_shell opens with an unchanged Twin fingerprint can skip rebuilding
 * Today presentation (client keeps React Query cache). Always rebuild after
 * sync, manual refresh, or a new morning proposal.
 */
export function shouldSkipTodayPresentationRebuild(input: {
  source?: 'app_shell' | 'today_refresh' | 'cron';
  forceSync?: boolean;
  syncedProviderCount: number;
  snapshotChanged: boolean;
  morningRecalibrationCreated: boolean;
}): boolean {
  if (input.forceSync) {
    return false;
  }
  if (input.source !== 'app_shell') {
    return false;
  }
  if (input.syncedProviderCount > 0) {
    return false;
  }
  if (input.snapshotChanged) {
    return false;
  }
  if (input.morningRecalibrationCreated) {
    return false;
  }
  return true;
}

async function autoLinkAndCollectSessionIds(
  athleteId: string,
  activityIds: string[],
): Promise<string[]> {
  if (activityIds.length === 0) {
    return [];
  }
  try {
    const { autoLinkActivities } =
      await import('@sharpit/server/lib/planned-session/linking/session-linking');
    const result = await autoLinkActivities(athleteId, activityIds);
    await announceSessionsDone(athleteId, result.sessionIds);
    return result.sessionIds;
  } catch (error) {
    console.error('[athlete-state/auto-link]', error);
    return [];
  }
}

/** « Séance comptée » for the sessions a sync just counted. Never throws. */
async function announceSessionsDone(athleteId: string, sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) {
    return;
  }
  const { notifySessionsDone } = await import('@sharpit/server/lib/push/athlete-notifications');
  await notifySessionsDone(athleteId, sessionIds).catch((error) =>
    console.error('[athlete-state/session-done-push]', athleteId, error),
  );
}

/**
 * ApplicationOpened — athlete-centric refresh.
 * Sync only what is needed; force Twin recompute only when evidence changed or asked.
 *
 * Freshness is computed twice only: once to decide sync, once for the response
 * (mid-sync / mid-compute snapshots were never returned to the client).
 */
async function syncProvidersOnOpen(
  athleteId: string,
  freshness: Awaited<ReturnType<typeof computeFreshnessSnapshot>>,
  options?: { forceSync?: boolean; skipSync?: boolean },
): Promise<{ syncedProviders: DataProvider[]; activityIds: string[] }> {
  if (options?.skipSync || !(options?.forceSync || shouldSyncOnOpen(freshness))) {
    return { syncedProviders: [], activityIds: [] };
  }

  const toSync = providersNeedingSync(freshness, { force: options?.forceSync }) as DataProvider[];
  const results = await syncProviders(athleteId, toSync);
  return {
    syncedProviders: results.map((r) => r.provider),
    activityIds: results.flatMap((r) => r.activityIds),
  };
}

export async function refreshAthleteState(
  athleteId: string,
  options?: {
    trainingDayId?: string;
    source?: 'app_shell' | 'today_refresh' | 'cron';
    forceSync?: boolean;
    skipSync?: boolean;
  },
): Promise<AthleteStateRefreshResult> {
  const traceId = createTraceId();
  const trainingDayId = options?.trainingDayId ?? trainingDayIdNow();

  let freshness = await computeFreshnessSnapshot({ trainingDayId, athleteId });
  const { syncedProviders, activityIds } = await syncProvidersOnOpen(athleteId, freshness, options);

  const forceRefresh = shouldForceInferenceOnRefresh({
    source: options?.source,
    forceSync: options?.forceSync,
    syncedProviderCount: syncedProviders.length,
  });

  const priorSnapshot = await getLatestAthleteSnapshot({
    athleteId,
    trainingDayId,
  });
  const priorSnapshotId = priorSnapshot?.snapshotId ?? null;

  const todayState = await runFastInference(athleteId, trainingDayId, { forceRefresh });
  const athleteSnapshot = await regenerateAthleteSnapshotAfterInference(
    athleteId,
    trainingDayId,
    todayState,
  );
  const snapshotChanged = priorSnapshotId !== athleteSnapshot.snapshotId;

  freshness = await computeFreshnessSnapshot({ trainingDayId, athleteId });

  const needsBriefing = freshness.domains.some(
    (d) => d.domain === 'recommendations' && d.freshness !== 'fresh',
  );

  const plannedSessionIdsToAnalyze = await autoLinkAndCollectSessionIds(athleteId, activityIds);
  scheduleBackgroundTasks({
    athleteId,
    activityIds,
    regenerateBriefing: needsBriefing,
    trainingDayId,
    plannedSessionIdsToAnalyze,
  });

  return {
    traceId,
    trainingDayId,
    freshness,
    athleteSnapshot,
    todayState,
    syncedProviders,
    inferenceRan: true,
    snapshotChanged,
  };
}

export async function onProviderSyncCompleted(
  athleteId: string,
  results: ProviderSyncResult[],
  trainingDayId?: string,
  options?: { skipRecordUpdate?: boolean },
): Promise<AthleteSnapshot> {
  const dayId = trainingDayId ?? trainingDayIdNow();
  const activityIds = results.flatMap((r) => r.activityIds);

  if (!options?.skipRecordUpdate && activityIds.length > 0) {
    const activities = await prisma.activity.findMany({
      where: { id: { in: activityIds }, athleteId },
      select: { type: true },
    });
    const types = [...new Set(activities.map((a) => a.type))];
    await updateRecordsForTypesSafe(athleteId, types);
  }

  // Await DB link only — compliance LLM runs in scheduleBackgroundTasks.
  const plannedSessionIdsToAnalyze = await autoLinkAndCollectSessionIds(athleteId, activityIds);

  const todayState = await runFastInference(athleteId, dayId);
  const athleteSnapshot = await regenerateAthleteSnapshotAfterInference(
    athleteId,
    dayId,
    todayState,
  );
  scheduleBackgroundTasks({
    athleteId,
    activityIds,
    regenerateBriefing: true,
    trainingDayId: dayId,
    plannedSessionIdsToAnalyze,
  });
  return athleteSnapshot;
}

export async function onWellnessSubmitted(
  athleteId: string,
  trainingDayId: string,
): Promise<AthleteSnapshot> {
  const todayState = await runFastInference(athleteId, trainingDayId);
  return regenerateAthleteSnapshotAfterInference(athleteId, trainingDayId, todayState);
}

async function runFastInference(
  athleteId: string,
  trainingDayId: string,
  options?: { forceRefresh?: boolean },
): Promise<TodayState> {
  return loadTodayState({
    athleteId,
    trainingDayId,
    // Event-driven paths (activity/wellness/explicit inference) default to recompute.
    forceRefresh: options?.forceRefresh ?? true,
  });
}

export async function handleAthleteStateEvent(event: AthleteStateEvent): Promise<void> {
  console.info('[athlete-state/event]', event.kind, event.traceId);
  const { athleteId } = event;

  switch (event.kind) {
    case 'ApplicationOpened':
      await refreshAthleteState(athleteId, {
        trainingDayId: event.trainingDayId,
        source: event.source,
      });
      break;
    case 'ManualWellnessSubmitted':
      await onWellnessSubmitted(athleteId, event.trainingDayId);
      break;
    case 'ActivityImported':
      {
        const plannedSessionIdsToAnalyze = await autoLinkAndCollectSessionIds(athleteId, [
          ...event.activityIds,
        ]);
        const todayState = await runFastInference(athleteId, event.trainingDayId);
        await regenerateAthleteSnapshotAfterInference(athleteId, event.trainingDayId, todayState);
        scheduleBackgroundTasks({
          athleteId,
          activityIds: [...event.activityIds],
          regenerateBriefing: event.activityIds.length > 0,
          trainingDayId: event.trainingDayId,
          plannedSessionIdsToAnalyze,
        });
      }
      break;
    case 'InferenceRequested':
      if (event.mode === 'fast') {
        const todayState = await runFastInference(athleteId, event.trainingDayId);
        await regenerateAthleteSnapshotAfterInference(athleteId, event.trainingDayId, todayState);
      }
      break;
    default:
      break;
  }
}

export function logAthleteStateEvent(
  kind: AthleteStateEvent['kind'],
  trainingDayId: string,
  extra?: Record<string, unknown>,
): void {
  console.info('[athlete-state]', kind, {
    eventId: createEventId(kind),
    traceId: createTraceId(),
    trainingDayId,
    ...extra,
  });
}
