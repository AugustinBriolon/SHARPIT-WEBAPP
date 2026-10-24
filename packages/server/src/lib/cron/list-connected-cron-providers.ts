import {
  shouldCronSyncProvider,
  type CronSyncProvider,
} from '@sharpit/server/lib/cron/provider-sync-gates';

type MaybeAccount = Record<string, unknown> | null | undefined;

export type CronProviderAccounts = {
  strava: MaybeAccount;
  garmin: MaybeAccount;
  withings: MaybeAccount;
  renpho: MaybeAccount;
  google: MaybeAccount;
};

const CRON_PROVIDER_ACCOUNT_KEYS: Array<{
  provider: CronSyncProvider;
  accountKey: keyof CronProviderAccounts;
}> = [
  { provider: 'strava', accountKey: 'strava' },
  { provider: 'garmin', accountKey: 'garmin' },
  { provider: 'withings', accountKey: 'withings' },
  { provider: 'renpho', accountKey: 'renpho' },
  { provider: 'google', accountKey: 'google' },
];

/**
 * Providers the Settings hub would show as connected for this athlete — the
 * only ones `/api/cron/sync` may decrypt or call.
 */
export function listConnectedCronProviders(accounts: CronProviderAccounts): CronSyncProvider[] {
  return CRON_PROVIDER_ACCOUNT_KEYS.filter(({ provider, accountKey }) =>
    shouldCronSyncProvider(provider, accounts[accountKey]),
  ).map(({ provider }) => provider);
}
