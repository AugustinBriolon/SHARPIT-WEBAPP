import { describe, expect, it } from 'vitest';
import type { ProviderAccounts } from '@sharpit/server/lib/sync/athlete-provider-sync';
import { projectV1SyncStatus } from './sync-status';

function accounts(over: Record<string, unknown> = {}): ProviderAccounts {
  return {
    strava: null,
    garmin: null,
    renpho: null,
    withings: null,
    google: null,
    ...over,
  } as unknown as ProviderAccounts;
}

describe('projectV1SyncStatus', () => {
  it('lists connected providers with their last pull, and the latest overall', () => {
    const status = projectV1SyncStatus(
      accounts({
        garmin: { lastSyncAt: new Date('2026-09-21T06:30:00.000Z') },
        strava: { lastSyncAt: new Date('2026-09-21T09:00:00.000Z') },
      }),
      new Set(['garmin', 'strava']),
    );
    expect(status.providers).toEqual([
      { key: 'garmin', label: 'Garmin', lastSyncAt: '2026-09-21T06:30:00.000Z' },
      { key: 'strava', label: 'Strava', lastSyncAt: '2026-09-21T09:00:00.000Z' },
    ]);
    expect(status.lastSyncAt).toBe('2026-09-21T09:00:00.000Z');
  });

  it('leaves out providers that are not connected', () => {
    const status = projectV1SyncStatus(
      accounts({ garmin: { lastSyncAt: new Date('2026-09-21T06:30:00.000Z') } }),
      new Set<string>(),
    );
    expect(status.providers).toEqual([]);
    expect(status.lastSyncAt).toBeNull();
  });

  it('maps reconnect requests to provider keys, once each', () => {
    const status = projectV1SyncStatus(accounts(), new Set(), [
      'Garmin',
      'Garmin activities',
      'backfill',
    ]);
    expect(status.needsReconnect).toEqual(['garmin']);
  });
});
