import type { ProviderAccounts } from '@sharpit/server/lib/sync/athlete-provider-sync';

export type V1SyncProviderKey = 'garmin' | 'strava' | 'withings' | 'renpho' | 'google';

export type V1SyncStatus = {
  apiVersion: 1;
  /** The most recent pull across connected providers, ISO 8601. */
  lastSyncAt: string | null;
  providers: Array<{
    key: V1SyncProviderKey;
    label: string;
    lastSyncAt: string | null;
  }>;
  /** Providers whose last pull asked the athlete to reconnect. */
  needsReconnect: V1SyncProviderKey[];
};

const PROVIDERS: ReadonlyArray<{
  key: V1SyncProviderKey;
  label: string;
  account: keyof ProviderAccounts;
}> = [
  { key: 'garmin', label: 'Garmin', account: 'garmin' },
  { key: 'strava', label: 'Strava', account: 'strava' },
  { key: 'withings', label: 'Withings', account: 'withings' },
  { key: 'renpho', label: 'Renpho', account: 'renpho' },
  { key: 'google', label: 'Google Agenda', account: 'google' },
];

const RECONNECT_LABELS: Record<string, V1SyncProviderKey> = {
  Garmin: 'garmin',
  'Garmin activities': 'garmin',
  Strava: 'strava',
  Withings: 'withings',
  Renpho: 'renpho',
  Google: 'google',
};

function lastSyncOf(account: unknown): Date | null {
  if (!account || typeof account !== 'object' || !('lastSyncAt' in account)) {
    return null;
  }
  const value = (account as { lastSyncAt: unknown }).lastSyncAt;
  return value instanceof Date ? value : null;
}

/** When each connected provider was last pulled — a projection of the accounts, no I/O. */
export function projectV1SyncStatus(
  accounts: ProviderAccounts,
  connected: ReadonlySet<string>,
  needsReconnect: readonly string[] = [],
): V1SyncStatus {
  const providers = PROVIDERS.filter(({ key }) => connected.has(key)).map(
    ({ key, label, account }) => {
      const last = lastSyncOf(accounts[account]);
      return { key, label, lastSyncAt: last ? last.toISOString() : null };
    },
  );
  const latest = providers
    .map((p) => p.lastSyncAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  const reconnect = [
    ...new Set(
      needsReconnect
        .map((label) => RECONNECT_LABELS[label])
        .filter((key): key is V1SyncProviderKey => key !== undefined),
    ),
  ];
  return { apiVersion: 1, lastSyncAt: latest ?? null, providers, needsReconnect: reconnect };
}
