import type { DataProvider } from '@sharpit/server/athlete-state/events';
import { isSet } from '@sharpit/shared/value';
import {
  isGarminAccountConnected,
  isOAuthAccountConnected,
  isRenphoAccountConnected,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import { syncGarminActivities } from '@sharpit/server/lib/integrations/garmin/garmin-activity-sync';
import {
  GARMIN_HEALTH_OPEN_PATH_FALLBACK_DAYS,
  getGarminAccount,
  syncGarminHealth,
} from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import {
  googleCalendarGateFromPrefs,
  shouldSyncGoogleCalendarWrites,
} from '@sharpit/server/lib/cron/provider-sync-gates';
import {
  getGoogleAccount,
  syncFromGoogle,
} from '@sharpit/server/lib/integrations/google/google-sync';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import {
  getRenphoAccount,
  syncRenphoHealth,
} from '@sharpit/server/lib/integrations/renpho/renpho-sync';
import {
  getStravaAccount,
  syncStravaActivities,
} from '@sharpit/server/lib/integrations/strava/strava-sync';
import {
  getWithingsAccount,
  syncWithingsHealth,
} from '@sharpit/server/lib/integrations/withings/withings-sync';

export type ProviderSyncResult = {
  provider: DataProvider;
  imported: number;
  updated: number;
  observationCount: number;
  activityIds: string[];
};

async function countRecentObservations(_provider: DataProvider): Promise<number> {
  return 0;
}

/**
 * Sync requested providers in parallel (failures isolated per provider).
 * Matches cron / manual Garmin parallelism for open-path latency.
 */
export async function syncProviders(
  athleteId: string,
  providers: readonly DataProvider[],
): Promise<ProviderSyncResult[]> {
  if (providers.length === 0) {
    return [];
  }

  const settled = await Promise.all(
    providers.map(async (provider) => {
      try {
        return await syncSingleProvider(athleteId, provider);
      } catch (error) {
        console.error(`[athlete-state/sync] ${provider} failed:`, error);
        return null;
      }
    }),
  );

  return settled.filter((r): r is ProviderSyncResult => isSet(r));
}

async function syncGarminProvider(athleteId: string): Promise<ProviderSyncResult | null> {
  const account = await getGarminAccount(athleteId);
  if (!account) {
    return null;
  }
  const [health, activities] = await Promise.all([
    syncGarminHealth(athleteId, { days: GARMIN_HEALTH_OPEN_PATH_FALLBACK_DAYS }),
    syncGarminActivities(athleteId),
  ]);
  return {
    provider: 'garmin',
    imported: activities.imported,
    updated: activities.updated + activities.merged,
    observationCount: health.updated,
    activityIds: activities.importedActivityIds,
  };
}

async function syncStravaProvider(athleteId: string): Promise<ProviderSyncResult | null> {
  const account = await getStravaAccount(athleteId);
  if (!account) {
    return null;
  }
  const strava = await syncStravaActivities(athleteId);
  return {
    provider: 'strava',
    imported: strava.imported,
    updated: strava.merged,
    observationCount: await countRecentObservations('strava'),
    activityIds: strava.importedActivityIds,
  };
}

async function syncRenphoProvider(athleteId: string): Promise<ProviderSyncResult | null> {
  const account = await getRenphoAccount(athleteId);
  if (!account) {
    return null;
  }
  const renpho = await syncRenphoHealth(athleteId);
  return {
    provider: 'renpho',
    imported: renpho.imported,
    updated: renpho.updated,
    observationCount: renpho.imported + renpho.updated,
    activityIds: [],
  };
}

async function syncWithingsProvider(athleteId: string): Promise<ProviderSyncResult | null> {
  const account = await getWithingsAccount(athleteId);
  if (!account) {
    return null;
  }
  const withings = await syncWithingsHealth(athleteId);
  return {
    provider: 'withings',
    imported: withings.imported,
    updated: withings.updated,
    observationCount: withings.imported + withings.updated,
    activityIds: [],
  };
}

async function syncGoogleProvider(athleteId: string): Promise<ProviderSyncResult | null> {
  const [account, prefs] = await Promise.all([
    getGoogleAccount(athleteId),
    loadResolvedSourcePrefs(athleteId),
  ]);
  const calendarGate = googleCalendarGateFromPrefs(prefs);
  if (
    !shouldSyncGoogleCalendarWrites({
      connected: isOAuthAccountConnected(account) && Boolean(account?.targetCalendarId),
      targetCalendarId: account?.targetCalendarId,
      ...calendarGate,
    })
  ) {
    return null;
  }
  const google = await syncFromGoogle(athleteId);
  return {
    provider: 'google',
    imported: google.pushed,
    updated: google.updated,
    observationCount: 0,
    activityIds: [],
  };
}

const PROVIDER_SYNC_HANDLERS: Partial<
  Record<DataProvider, (athleteId: string) => Promise<ProviderSyncResult | null>>
> = {
  garmin: syncGarminProvider,
  strava: syncStravaProvider,
  renpho: syncRenphoProvider,
  withings: syncWithingsProvider,
  google: syncGoogleProvider,
};

async function syncSingleProvider(
  athleteId: string,
  provider: DataProvider,
): Promise<ProviderSyncResult | null> {
  const handler = PROVIDER_SYNC_HANDLERS[provider];
  if (!handler) {
    return null;
  }
  return handler(athleteId);
}

export async function listConnectedProviders(athleteId: string): Promise<DataProvider[]> {
  const [strava, garmin, renpho, withings, google] = await Promise.all([
    getStravaAccount(athleteId),
    getGarminAccount(athleteId),
    getRenphoAccount(athleteId),
    getWithingsAccount(athleteId),
    getGoogleAccount(athleteId),
  ]);

  const connected: DataProvider[] = [];
  if (isGarminAccountConnected(garmin)) {
    connected.push('garmin');
  }
  if (isOAuthAccountConnected(strava)) {
    connected.push('strava');
  }
  if (isRenphoAccountConnected(renpho)) {
    connected.push('renpho');
  }
  if (isOAuthAccountConnected(withings)) {
    connected.push('withings');
  }
  if (isOAuthAccountConnected(google) && google?.targetCalendarId) {
    connected.push('google');
  }
  return connected;
}
