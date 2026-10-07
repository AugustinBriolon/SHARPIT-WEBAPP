import { afterEach, describe, expect, it } from 'vitest';
import { encryptSecret } from '@sharpit/server/lib/secret-box';
import { shouldCronSyncProvider } from '@sharpit/server/lib/cron/provider-sync-gates';

const ORIGINAL_KEY = process.env.SECRET_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.SECRET_ENCRYPTION_KEY;
  } else {
    process.env.SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

function enc(plain: string): string {
  process.env.SECRET_ENCRYPTION_KEY = 'cron-gate-test-key';
  return encryptSecret(plain);
}

function diGarminAccount() {
  return {
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
  };
}

describe('shouldCronSyncProvider', () => {
  it('skips when the account row is missing', () => {
    expect(shouldCronSyncProvider('garmin', null)).toBe(false);
    expect(shouldCronSyncProvider('renpho', null)).toBe(false);
    expect(shouldCronSyncProvider('strava', null)).toBe(false);
  });

  it('skips revoked empty credentials so cron does not re-throw reconnect spam', () => {
    expect(shouldCronSyncProvider('garmin', { oauth1TokenEnc: '', oauth2TokenEnc: '' })).toBe(
      false,
    );
    expect(shouldCronSyncProvider('renpho', { email: 'a@b.c', passwordEnc: '' })).toBe(false);
  });

  it('skips malformed placeholder tokens that would explode AES-GCM decrypt', () => {
    expect(
      shouldCronSyncProvider('garmin', { oauth1TokenEnc: 'demo', oauth2TokenEnc: 'demo' }),
    ).toBe(false);
    expect(shouldCronSyncProvider('renpho', { email: 'a@b.c', passwordEnc: 'demo' })).toBe(false);
  });

  it('skips ciphertext-looking blobs that are not live Garmin token JSON', () => {
    const junk = enc('not-tokens');
    expect(shouldCronSyncProvider('garmin', { oauth1TokenEnc: junk, oauth2TokenEnc: junk })).toBe(
      false,
    );
  });

  it('syncs Garmin when DI credentials match the Settings hub connected meaning', () => {
    expect(shouldCronSyncProvider('garmin', diGarminAccount())).toBe(true);
  });

  it('skips Renpho while the catalog marks it coming_soon (withdrawn before launch)', () => {
    expect(shouldCronSyncProvider('renpho', { email: 'a@b.c', passwordEnc: enc('pw') })).toBe(
      false,
    );
  });

  it('skips Google without a target calendar even when OAuth tokens look live', () => {
    expect(
      shouldCronSyncProvider('google', {
        accessTokenEnc: enc('access'),
        refreshTokenEnc: enc('refresh'),
      }),
    ).toBe(false);
    expect(
      shouldCronSyncProvider('google', {
        accessTokenEnc: enc('access'),
        refreshTokenEnc: enc('refresh'),
        targetCalendarId: 'cal-1',
      }),
    ).toBe(true);
  });

  it('allows Strava cron when the catalog marks it available and tokens are present', () => {
    expect(
      shouldCronSyncProvider('strava', {
        accessTokenEnc: enc('access'),
        refreshTokenEnc: enc('refresh'),
      }),
    ).toBe(true);
  });
});
