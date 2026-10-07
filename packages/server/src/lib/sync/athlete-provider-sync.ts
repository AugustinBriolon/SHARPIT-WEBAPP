import { refreshAthleteState } from '@sharpit/server/lib/athlete-state/orchestrator';
import {
  getGarminAccount,
  syncGarminHealth,
} from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { syncGarminActivities } from '@sharpit/server/lib/integrations/garmin/garmin-activity-sync';
import {
  getGoogleAccount,
  syncFromGoogle,
} from '@sharpit/server/lib/integrations/google/google-sync';
import { updateRecordsAfterProviderSync } from '@sharpit/server/lib/training/records/records';
import {
  getRenphoAccount,
  syncRenphoHealth,
} from '@sharpit/server/lib/integrations/renpho/renpho-sync';
import {
  getWithingsAccount,
  syncWithingsHealth,
} from '@sharpit/server/lib/integrations/withings/withings-sync';
import {
  CRON_BACKFILL_BATCH,
  backfillActivityStreams,
} from '@sharpit/server/lib/streams/stream-backfill';
import {
  getStravaAccount,
  syncStravaActivities,
} from '@sharpit/server/lib/integrations/strava/strava-sync';
import { generateAndStoreWeeklyReview, isSunday } from '@sharpit/server/lib/coach/weekly-review';
import { isProAthlete } from '@sharpit/server/lib/access/is-pro-athlete';
import { notifyWeeklyReviewReady } from '@sharpit/server/lib/push/athlete-notifications';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { listConnectedCronProviders } from '@sharpit/server/lib/cron/list-connected-cron-providers';
import type { CronAthleteSyncResult } from '@sharpit/server/lib/cron/sync-summary';
import {
  isDecryptAuthenticitySoftFailure,
  isDecryptMalformedSoftFailure,
  isProviderAuthFailure,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import {
  athleteHasAiProcessingConsent,
  athleteHasHealthDataConsent,
} from '@sharpit/server/lib/privacy/consent-store';

/**
 * Pulling one athlete's connected providers and rebuilding their state — shared by the
 * scheduled sync (`/api/cron/sync`) and the on-demand one the native app starts
 * (`/api/v1/sync`), so both refresh the same data the same way.
 */

export type AthleteSyncResult = CronAthleteSyncResult & {
  importedTypes: string[];
  backfilledActivityIds: string[];
};

function syncErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function recordSyncError(input: {
  result: AthleteSyncResult;
  provider: string;
  athleteId: string;
  error: unknown;
  fallback: string;
}) {
  const msg = syncErrorMessage(input.error, input.fallback);
  console.error(`[sync] ${input.provider}:`, input.athleteId, msg);
  input.result.errors.push(`${input.provider}: ${msg}`);
}

function recordNeedsReconnect(input: {
  result: AthleteSyncResult;
  provider: string;
  athleteId: string;
  error: unknown;
}) {
  const msg = syncErrorMessage(input.error, 'needs reconnect');
  console.warn(`[sync] ${input.provider} needs reconnect:`, input.athleteId, msg);
  if (!input.result.needsReconnect.includes(input.provider)) {
    input.result.needsReconnect.push(input.provider);
  }
}

function recordDecryptSkip(input: {
  result: AthleteSyncResult;
  provider: string;
  athleteId: string;
}) {
  console.error(
    `[sync] ${input.provider}: decrypt authenticity failure (credentials preserved)`,
    input.athleteId,
  );
  input.result.decryptAuthenticity = true;
}

async function runProviderSync(input: {
  result: AthleteSyncResult;
  provider: string;
  athleteId: string;
  fallback: string;
  task: () => Promise<unknown>;
}) {
  try {
    await input.task();
    input.result.providerSyncCount += 1;
  } catch (error) {
    if (isDecryptAuthenticitySoftFailure(error)) {
      recordDecryptSkip(input);
      return;
    }
    if (isProviderAuthFailure(error) || isDecryptMalformedSoftFailure(error)) {
      recordNeedsReconnect({ ...input, error });
      return;
    }
    recordSyncError({ ...input, error });
  }
}

type ProviderSyncSpec = {
  provider: string;
  fallback: string;
  task: () => Promise<unknown>;
};

export type ProviderAccounts = {
  strava: Awaited<ReturnType<typeof getStravaAccount>>;
  garmin: Awaited<ReturnType<typeof getGarminAccount>>;
  renpho: Awaited<ReturnType<typeof getRenphoAccount>>;
  withings: Awaited<ReturnType<typeof getWithingsAccount>>;
  google: Awaited<ReturnType<typeof getGoogleAccount>>;
};

function connectedProviderSet(accounts: ProviderAccounts): Set<string> {
  return new Set(
    listConnectedCronProviders({
      strava: accounts.strava,
      garmin: accounts.garmin,
      withings: accounts.withings,
      renpho: accounts.renpho,
      google: accounts.google,
    }),
  );
}

function buildProviderSyncSpecs(
  athleteId: string,
  accounts: ProviderAccounts,
  result: AthleteSyncResult,
  options: { hasHealthConsent: boolean },
): ProviderSyncSpec[] {
  const connected = connectedProviderSet(accounts);
  const specs: ProviderSyncSpec[] = [];
  if (connected.has('strava')) {
    specs.push({
      provider: 'Strava',
      fallback: 'Sync Strava échouée',
      task: async () => {
        const strava = await syncStravaActivities(athleteId);
        result.importedTypes.push(...strava.importedTypes);
      },
    });
  }
  if (connected.has('garmin') && options.hasHealthConsent) {
    specs.push({
      provider: 'Garmin',
      fallback: 'Sync Garmin échouée',
      task: () => syncGarminHealth(athleteId),
    });
    specs.push({
      provider: 'Garmin activities',
      fallback: 'Sync activités Garmin échouée',
      task: async () => {
        const activities = await syncGarminActivities(athleteId);
        result.importedTypes.push(...activities.importedTypes);
      },
    });
  }
  appendOptionalProviderSpecs(athleteId, connected, specs, options);
  return specs;
}

function appendOptionalProviderSpecs(
  athleteId: string,
  connected: Set<string>,
  specs: ProviderSyncSpec[],
  options: { hasHealthConsent: boolean },
): void {
  if (connected.has('withings') && options.hasHealthConsent) {
    specs.push({
      provider: 'Withings',
      fallback: 'Sync Withings échouée',
      task: () => syncWithingsHealth(athleteId),
    });
  }
  if (connected.has('renpho') && options.hasHealthConsent) {
    specs.push({
      provider: 'Renpho',
      fallback: 'Sync Renpho échouée',
      task: () => syncRenphoHealth(athleteId),
    });
  }
  if (connected.has('google')) {
    specs.push({
      provider: 'Google',
      fallback: 'Sync Google échouée',
      task: () => syncFromGoogle(athleteId),
    });
  }
}

export async function syncConnectedProviders(
  athleteId: string,
  accounts: ProviderAccounts,
  result: AthleteSyncResult,
  options: { hasHealthConsent: boolean },
) {
  const specs = buildProviderSyncSpecs(athleteId, accounts, result, options);
  await Promise.all(
    specs.map((spec) =>
      runProviderSync({
        result,
        athleteId,
        provider: spec.provider,
        fallback: spec.fallback,
        task: spec.task,
      }),
    ),
  );
}

export async function backfillStreamsIfNeeded(
  athleteId: string,
  accounts: ProviderAccounts,
  result: AthleteSyncResult,
) {
  const connected = connectedProviderSet(accounts);
  if (!connected.has('strava') && !connected.has('garmin')) {
    return;
  }
  try {
    const backfill = await backfillActivityStreams(athleteId, CRON_BACKFILL_BATCH);
    result.backfilledActivityIds = backfill.activityIdsWithData;
    await updateRecordsAfterProviderSync(athleteId, {
      importedTypes: result.importedTypes as never[],
      backfilledActivityIds: backfill.activityIdsWithData,
    });
  } catch (error) {
    recordSyncError({
      result,
      provider: 'backfill',
      athleteId,
      error,
      fallback: 'Backfill streams échoué',
    });
  }
}

export async function refreshAthleteBriefing(athleteId: string, result: AthleteSyncResult) {
  try {
    await refreshAthleteState(athleteId, { skipSync: true, source: 'cron' });
    result.briefing = true;
  } catch (error) {
    recordSyncError({
      result,
      provider: 'athleteState',
      athleteId,
      error,
      fallback: 'Mise à jour état athlète échouée',
    });
  }
}

/**
 * Sunday's last sync, once the week is done: the three Sunday runs used to write it three
 * times, the first before the day's session.
 */
export function isWeeklyReviewSlot(now: Date = new Date()): boolean {
  return isSunday(now) && now.getUTCHours() >= WEEKLY_REVIEW_UTC_HOUR;
}

const WEEKLY_REVIEW_UTC_HOUR = 18;

export async function generateWeeklyReviewIfSunday(athleteId: string, result: AthleteSyncResult) {
  // The review is SharpIt Pro: written for an athlete who cannot read it, it was cost only.
  if (!isCoachConfigured() || !isWeeklyReviewSlot() || !(await isProAthlete(athleteId))) {
    return;
  }
  try {
    const review = await generateAndStoreWeeklyReview(athleteId, new Date(), { current: true });
    result.weeklyReview = true;
    await notifyWeeklyReviewReady(athleteId, review.weekStart.toISOString().slice(0, 10));
  } catch (error) {
    recordSyncError({
      result,
      provider: 'weeklyReview',
      athleteId,
      error,
      fallback: 'Génération de la rétro hebdo échouée',
    });
  }
}

export function emptyAthleteResult(athleteId: string): AthleteSyncResult {
  return {
    athleteId,
    providerSyncCount: 0,
    briefing: false,
    briefingSkippedNoChange: false,
    weeklyReview: false,
    errors: [],
    needsReconnect: [],
    decryptAuthenticity: false,
    skippedByCircuitBreaker: false,
    importedTypes: [],
    backfilledActivityIds: [],
  };
}

/** The athlete's provider accounts and consents, read once for a sync. */
export async function loadAthleteSyncContext(athleteId: string) {
  const [strava, garmin, renpho, withings, google, hasHealthConsent, hasAiConsent] =
    await Promise.all([
      getStravaAccount(athleteId),
      getGarminAccount(athleteId),
      getRenphoAccount(athleteId),
      getWithingsAccount(athleteId),
      getGoogleAccount(athleteId),
      athleteHasHealthDataConsent(athleteId),
      athleteHasAiProcessingConsent(athleteId),
    ]);
  const accounts: ProviderAccounts = { strava, garmin, renpho, withings, google };
  return { accounts, hasHealthConsent, hasAiConsent };
}

export { connectedProviderSet };
