import { afterEach, describe, expect, it } from 'vitest';
import { encryptSecret } from '@sharpit/server/lib/secret-box';
import { listConnectedCronProviders } from '@sharpit/server/lib/cron/list-connected-cron-providers';

const ORIGINAL_KEY = process.env.SECRET_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.SECRET_ENCRYPTION_KEY;
  } else {
    process.env.SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

function enc(plain: string): string {
  process.env.SECRET_ENCRYPTION_KEY = 'cron-helpers-test-key';
  return encryptSecret(plain);
}

function emptyAccounts() {
  return {
    strava: null,
    garmin: null,
    withings: null,
    renpho: null,
    google: null,
  };
}

describe('listConnectedCronProviders', () => {
  it('returns no providers when every account row is missing', () => {
    expect(listConnectedCronProviders(emptyAccounts())).toEqual([]);
  });

  it('skips revoked empty enc and malformed demo blobs silently', () => {
    expect(
      listConnectedCronProviders({
        ...emptyAccounts(),
        garmin: { apiKeyEnc: '' },
        renpho: { email: 'a@b.c', passwordEnc: 'demo' },
      }),
    ).toEqual([]);
  });

  it('includes only Garmin when its key is live (hub connected)', () => {
    const providers = listConnectedCronProviders({
      ...emptyAccounts(),
      garmin: { apiKeyEnc: enc('garmin-personal-api-key') },
    });
    expect(providers).toEqual(['garmin']);
  });
});
