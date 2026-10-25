import { describe, expect, it } from 'vitest';
import {
  connectedProviderSet,
  type ProviderAccounts,
} from '@sharpit/server/lib/sync/athlete-provider-sync';

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

describe('connectedProviderSet', () => {
  it('counts a linked Garmin account although Garmin pushes instead of being pulled', () => {
    const connected = connectedProviderSet(
      accounts({ garmin: { garminUserId: 'g1', lastSyncAt: null } }),
    );
    expect(connected.has('garmin')).toBe(true);
  });

  it('leaves Garmin out when no account is linked', () => {
    expect(connectedProviderSet(accounts()).has('garmin')).toBe(false);
  });
});
