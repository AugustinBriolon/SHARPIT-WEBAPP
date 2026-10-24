import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accounts = vi.hoisted(() => ({
  strava: null as null | { refreshTokenEnc: string },
  google: null as null | { refreshTokenEnc: string },
  withings: null as null | { withingsUserId: string },
}));

vi.mock('@sharpit/server/lib/secret-box', () => ({
  isEncryptedSecret: (value: unknown) => typeof value === 'string' && value.startsWith('enc:'),
  decryptSecret: (value: string) => value.slice('enc:'.length),
}));
vi.mock('@sharpit/server/lib/integrations/strava/strava-sync', () => ({
  getStravaAccount: async () => accounts.strava,
  getValidAccessToken: async () => 'strava-access',
}));
vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => ({
  getGoogleAccount: async () => accounts.google,
}));
vi.mock('@sharpit/server/lib/integrations/withings/withings-sync', () => ({
  getWithingsAccount: async () => accounts.withings,
}));

type Call = { url: string; body: string; auth: string | null };

describe('revokeProviderAccess', () => {
  const calls: Call[] = [];

  function stubFetch(respond: (url: string) => Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({ url, body: String(init?.body ?? ''), auth: headers.get('authorization') });
        return respond(url);
      }),
    );
  }

  beforeEach(() => {
    calls.length = 0;
    accounts.strava = null;
    accounts.google = null;
    accounts.withings = null;
    vi.stubEnv('WITHINGS_CLIENT_ID', 'withings-client');
    vi.stubEnv('WITHINGS_CLIENT_SECRET', 'withings-secret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('deauthorizes SHARPIT at Strava with a live access token', async () => {
    accounts.strava = { refreshTokenEnc: 'enc:strava-refresh' };
    stubFetch(() => new Response('{}', { status: 200 }));
    const { revokeProviderAccess } = await import('./provider-revocation');

    await expect(revokeProviderAccess('athlete-1', 'strava')).resolves.toBe('revoked');
    expect(calls).toEqual([
      { url: 'https://www.strava.com/oauth/deauthorize', body: '', auth: 'Bearer strava-access' },
    ]);
  });

  it('revokes the Google grant through its refresh token', async () => {
    accounts.google = { refreshTokenEnc: 'enc:google-refresh' };
    stubFetch(() => new Response('', { status: 200 }));
    const { revokeProviderAccess } = await import('./provider-revocation');

    await expect(revokeProviderAccess('athlete-1', 'google')).resolves.toBe('revoked');
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/revoke');
    expect(calls[0]?.body).toBe('token=google-refresh');
  });

  it('revokes at Withings with a signed nonce', async () => {
    accounts.withings = { withingsUserId: '12345' };
    stubFetch((url) =>
      url.endsWith('/v2/signature')
        ? Response.json({ status: 0, body: { nonce: 'nonce-1' } })
        : Response.json({ status: 0, body: {} }),
    );
    const { revokeProviderAccess } = await import('./provider-revocation');

    await expect(revokeProviderAccess('athlete-1', 'withings')).resolves.toBe('revoked');
    const revoke = new URLSearchParams(calls[1]?.body);
    expect(calls[1]?.url).toBe('https://wbsapi.withings.net/v2/oauth2');
    expect(revoke.get('action')).toBe('revoke');
    expect(revoke.get('userid')).toBe('12345');
    expect(revoke.get('nonce')).toBe('nonce-1');
    expect(revoke.get('signature')).toBe(
      createHmac('sha256', 'withings-secret')
        .update('revoke,withings-client,nonce-1')
        .digest('hex'),
    );
  });

  it('reports nothing to revoke when the source is not connected', async () => {
    stubFetch(() => new Response('{}'));
    const { revokeProviderAccess } = await import('./provider-revocation');

    await expect(revokeProviderAccess('athlete-1', 'strava')).resolves.toBe('not_connected');
    expect(calls).toHaveLength(0);
  });

  it('marks unofficial sources as unsupported without calling anyone', async () => {
    stubFetch(() => new Response('{}'));
    const { revokeProviderAccess } = await import('./provider-revocation');

    await expect(revokeProviderAccess('athlete-1', 'garmin')).resolves.toBe('unsupported');
    await expect(revokeProviderAccess('athlete-1', 'renpho')).resolves.toBe('unsupported');
    expect(calls).toHaveLength(0);
  });

  it('never throws when a provider refuses — the caller deletes its copy anyway', async () => {
    accounts.strava = { refreshTokenEnc: 'enc:strava-refresh' };
    stubFetch(() => new Response('{}', { status: 500 }));
    const { revokeProviderAccess } = await import('./provider-revocation');

    await expect(revokeProviderAccess('athlete-1', 'strava')).resolves.toBe('failed');
  });

  it('revokes every revocable source at once', async () => {
    accounts.google = { refreshTokenEnc: 'enc:google-refresh' };
    stubFetch(() => new Response('', { status: 200 }));
    const { revokeAllProviderAccess } = await import('./provider-revocation');

    await expect(revokeAllProviderAccess('athlete-1')).resolves.toEqual({
      strava: 'not_connected',
      google: 'revoked',
      withings: 'not_connected',
    });
  });
});
