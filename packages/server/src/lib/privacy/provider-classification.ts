import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import {
  getCatalogProviderByIntegration,
  type DataClassId,
} from '@sharpit/app/lib/integrations/provider-catalog';

/** Art. 9 health-related data classes (eng brief §2). */
export const HEALTH_DATA_CLASSES: readonly DataClassId[] = [
  'wearable_health',
  'body',
  'nutrition',
] as const;

/**
 * Unofficial / as-is integrations (P7). Official OAuth partners (Strava, Withings,
 * Google) do not require unofficial_providers_ack — only health consent when they
 * feed health classes (Withings body).
 */
export const UNOFFICIAL_PROVIDERS: ReadonlySet<IntegrationId> = new Set(['garmin', 'renpho']);

export function providerFeedsHealthData(integrationId: IntegrationId): boolean {
  const provider = getCatalogProviderByIntegration(integrationId);
  if (!provider) {
    return true;
  }
  return provider.classes.some((c) => (HEALTH_DATA_CLASSES as readonly string[]).includes(c));
}

export function providerIsUnofficial(integrationId: IntegrationId): boolean {
  return UNOFFICIAL_PROVIDERS.has(integrationId);
}

export function providerConnectRequirements(integrationId: IntegrationId): {
  needsHealthConsent: boolean;
  needsUnofficialAck: boolean;
} {
  return {
    needsHealthConsent: providerFeedsHealthData(integrationId),
    needsUnofficialAck: providerIsUnofficial(integrationId),
  };
}

/** Cron/sync: providers that must not run without health_data_consent_at. */
export function isHealthSyncProvider(integrationId: string): boolean {
  return providerFeedsHealthData(integrationId as IntegrationId);
}
