import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProviderAuthFailure } from '@sharpit/server/lib/integrations/shared/connection-status';
import {
  buildGarminAuthorizeUrl,
  exchangeGarminCode,
  garminCodeChallenge,
  garminCodeVerifier,
  garminTokenExpiresAt,
} from './garmin-oauth';

beforeEach(() => {
  process.env.GARMIN_CLIENT_ID = 'client-id';
  process.env.GARMIN_CLIENT_SECRET = 'client-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Garmin PKCE', () => {
  it('derives the same verifier from the same state, within the spec length', () => {
    const verifier = garminCodeVerifier('signed-state');
    expect(verifier).toBe(garminCodeVerifier('signed-state'));
    expect(verifier).not.toBe(garminCodeVerifier('another-state'));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
  });

  it('sends the S256 challenge of that verifier, never the verifier itself', () => {
    const url = new URL(buildGarminAuthorizeUrl('signed-state', 'https://api.sharpit.app/cb'));
    const verifier = garminCodeVerifier('signed-state');
    expect(url.origin + url.pathname).toBe('https://connect.garmin.com/oauth2Confirm');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(url.searchParams.get('code_challenge')).toBe(garminCodeChallenge(verifier));
    expect(url.toString()).not.toContain(verifier);
    expect(url.searchParams.get('state')).toBe('signed-state');
  });
});

describe('exchangeGarminCode', () => {
  it('posts the code, the verifier and the client secret from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 86400,
          token_type: 'bearer',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await exchangeGarminCode('the-code', 'signed-state', 'https://api.sharpit.app/cb');

    const [[url, init]] = fetchMock.mock.calls;
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(url).toBe('https://diauth.garmin.com/di-oauth2-service/oauth/token');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('the-code');
    expect(body.get('code_verifier')).toBe(garminCodeVerifier('signed-state'));
    expect(body.get('client_secret')).toBe('client-secret');
  });

  it('reads a refused code or refresh token as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const error = await exchangeGarminCode('x', 's', 'u').catch((caught: unknown) => caught);
    expect(isProviderAuthFailure(error)).toBe(true);
  });
});

describe('garminTokenExpiresAt', () => {
  it('keeps the ten minutes Garmin advises before the 24 h expiry', () => {
    const at = garminTokenExpiresAt(
      { access_token: 'a', refresh_token: 'r', expires_in: 86400, token_type: 'bearer' },
      0,
    );
    expect(at.getTime()).toBe((86400 - 600) * 1000);
  });
});
