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
        garmin: { oauth1TokenEnc: '', oauth2TokenEnc: '' },
        renpho: { email: 'a@b.c', passwordEnc: 'demo' },
      }),
    ).toEqual([]);
  });

  it('includes only Garmin when DI tokens are live (hub connected)', () => {
    const providers = listConnectedCronProviders({
      ...emptyAccounts(),
      garmin: {
        oauth1TokenEnc: enc(
          JSON.stringify({
            oauth_token: '__DI__:GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2',
            oauth_token_secret: 'rt',
          }),
        ),
        oauth2TokenEnc: enc(
          JSON.stringify({
            access_token: 'at',
            refresh_token: 'rt',
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ),
      },
    });
    expect(providers).toEqual(['garmin']);
  });
});
