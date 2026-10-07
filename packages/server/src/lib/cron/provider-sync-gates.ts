import { getCatalogProviderByIntegration } from '@sharpit/app/lib/integrations/provider-catalog';
import {
  isGarminAccountConnected,
  isOAuthAccountConnected,
  isRenphoAccountConnected,
} from '@sharpit/server/lib/integrations/shared/connection-status';

type MaybeAccount = Record<string, unknown> | null | undefined;

export type CronSyncProvider = 'strava' | 'garmin' | 'withings' | 'renpho' | 'google';

function isGoogleCronConnected(account: MaybeAccount): boolean {
  return isOAuthAccountConnected(account) && Boolean(account?.targetCalendarId);
}

const CRON_CONNECTION_CHECKS: Record<CronSyncProvider, (account: MaybeAccount) => boolean> = {
  strava: isOAuthAccountConnected,
  withings: isOAuthAccountConnected,
  garmin: isGarminAccountConnected,
  renpho: isRenphoAccountConnected,
  google: isGoogleCronConnected,
};

/**
 * Cron must gate on the same "connected" meaning as the Settings integrations
 * hub — live credentials, not mere account-row presence.
 *
 * Revoked integrations keep the row (empty `*Enc` columns) so the hub can
 * prompt reconnect. Malformed placeholders (e.g. demo `"demo"`) and
 * ciphertext-looking junk that is not real provider token JSON also keep a
 * row. Syncing either path throws every run. Skip both here — no decrypt, no
 * provider API call, no `[cron/sync]` warn/error.
 */
export function shouldCronSyncProvider(provider: CronSyncProvider, account: MaybeAccount): boolean {
  const catalog = getCatalogProviderByIntegration(provider);
  if (catalog?.status === 'coming_soon') {
    return false;
  }
  return CRON_CONNECTION_CHECKS[provider](account);
}
