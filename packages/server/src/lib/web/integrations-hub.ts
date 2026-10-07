import type {
  IntegrationAccountView,
  IntegrationProviderView,
  IntegrationsHubPayload,
} from '@sharpit/app/lib/web/payloads';
import { getGarminAccount } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { isGoogleConfigured } from '@sharpit/server/lib/integrations/google/google';
import {
  getGoogleAccount,
  isGoogleConnected,
} from '@sharpit/server/lib/integrations/google/google-sync';
import { getRenphoAccount } from '@sharpit/server/lib/integrations/renpho/renpho-sync';
import {
  isGarminAccountConnected,
  isOAuthAccountConnected,
  isRenphoAccountConnected,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import { prisma } from '@sharpit/db/client';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { isStravaConfigured } from '@sharpit/server/lib/integrations/strava/strava';
import { getStravaAccount } from '@sharpit/server/lib/integrations/strava/strava-sync';
import { isWithingsConfigured } from '@sharpit/server/lib/integrations/withings/withings';
import { getWithingsAccount } from '@sharpit/server/lib/integrations/withings/withings-sync';

export type { IntegrationAccountView, IntegrationsHubPayload };

const DISPLAY_FIELDS = [
  'displayName',
  'lastSyncAt',
  'email',
  'firstName',
  'lastName',
  'avatarUrl',
  'fullName',
  'targetCalendarId',
  'targetCalendarName',
] as const;

export function toAccountView(account: object | null | undefined): IntegrationAccountView | null {
  if (!account) {
    return null;
  }
  const source = account as Record<string, unknown>;
  return Object.fromEntries(
    DISPLAY_FIELDS.filter((field) => field in source).map((field) => [field, source[field]]),
  ) as IntegrationAccountView;
}

function providerView<T>(
  account: T | null,
  isConnected: (account: T) => boolean,
): IntegrationProviderView {
  return {
    account: toAccountView(account as object | null),
    needsReconnect: account !== null && !isConnected(account),
  };
}

/** The integrations hub's accounts and source prefs, read on `api.` (ADR-048 phase 3f). */
export async function loadIntegrationsHub(athleteId: string): Promise<IntegrationsHubPayload> {
  const [strava, garmin, renpho, withings, google, prefs, profile] = await Promise.all([
    getStravaAccount(athleteId),
    getGarminAccount(athleteId),
    getRenphoAccount(athleteId),
    getWithingsAccount(athleteId),
    getGoogleAccount(athleteId).catch(() => null),
    loadResolvedSourcePrefs(athleteId),
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { appleHealthLinkedAt: true },
    }),
  ]);
  return {
    strava: { ...providerView(strava, isOAuthAccountConnected), configured: isStravaConfigured() },
    garmin: providerView(garmin, isGarminAccountConnected),
    renpho: providerView(renpho, isRenphoAccountConnected),
    withings: {
      ...providerView(withings, isOAuthAccountConnected),
      configured: isWithingsConfigured(),
    },
    google: { ...providerView(google, isGoogleConnected), configured: isGoogleConfigured() },
    appleHealth: { linkedAt: profile?.appleHealthLinkedAt?.toISOString() ?? null },
    prefs,
  };
}
