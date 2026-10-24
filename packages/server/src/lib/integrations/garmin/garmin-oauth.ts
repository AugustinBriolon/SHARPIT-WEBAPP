import { createHash, createHmac } from 'node:crypto';
import { normalizeOAuthPublicOrigin } from '@sharpit/app/lib/integrations/oauth-public-origin';
import { ProviderAuthError } from '@sharpit/server/lib/integrations/shared/connection-status';

/** Garmin Connect Developer Program, OAuth2 PKCE (docs/garmin/OAuth2PKCE 2.0.pdf). */
const GARMIN_AUTHORIZE = 'https://connect.garmin.com/oauth2Confirm';
const GARMIN_TOKEN = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
export const GARMIN_PARTNER_API = 'https://apis.garmin.com/partner-gateway/rest';

/** Garmin advises refreshing at least ten minutes before the access token's 24 h end. */
export const GARMIN_TOKEN_SAFETY_MS = 600_000;

export function getGarminRedirectUri(origin?: string): string {
  if (process.env.GARMIN_REDIRECT_URI) {
    return process.env.GARMIN_REDIRECT_URI;
  }
  if (origin) {
    return `${normalizeOAuthPublicOrigin(origin)}/api/garmin/callback`;
  }
  return 'http://localhost:3001/api/garmin/callback';
}

export function isGarminConfigured(): boolean {
  return Boolean(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET);
}

function garminCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GARMIN_CLIENT_ID et GARMIN_CLIENT_SECRET doivent être définis');
  }
  return { clientId, clientSecret };
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

/**
 * The PKCE code verifier, derived from the signed connect state with the client secret: the
 * callback gets the same state back, so the verifier never travels nor needs storing.
 * 32 bytes → 43 base64url characters, the spec's minimum.
 */
export function garminCodeVerifier(state: string): string {
  return base64Url(createHmac('sha256', garminCredentials().clientSecret).update(state).digest());
}

export function garminCodeChallenge(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function buildGarminAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: garminCredentials().clientId,
    code_challenge: garminCodeChallenge(garminCodeVerifier(state)),
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
    state,
  });
  return `${GARMIN_AUTHORIZE}?${params.toString()}`;
}

export interface GarminTokenResponse {
  access_token: string;
  refresh_token: string;
  /** Seconds; 86 400 (24 h). */
  expires_in: number;
  /** Seconds; about three months. */
  refresh_token_expires_in?: number;
  token_type: string;
  scope?: string;
}

async function postToken(params: Record<string, string>): Promise<GarminTokenResponse> {
  const { clientId, clientSecret } = garminCredentials();
  const response = await fetch(GARMIN_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
    cache: 'no-store',
  });
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    throw new ProviderAuthError('Session Garmin expirée. Reconnecte Garmin dans les paramètres.');
  }
  if (!response.ok) {
    throw new Error(`Garmin token a répondu ${response.status}`);
  }
  return (await response.json()) as GarminTokenResponse;
}

export function exchangeGarminCode(
  code: string,
  state: string,
  redirectUri: string,
): Promise<GarminTokenResponse> {
  return postToken({
    grant_type: 'authorization_code',
    code,
    code_verifier: garminCodeVerifier(state),
    redirect_uri: redirectUri,
  });
}

/** Garmin returns a new refresh token on every refresh; the caller must store it. */
export function refreshGarminToken(refreshToken: string): Promise<GarminTokenResponse> {
  return postToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

/** Access token expiry, kept `GARMIN_TOKEN_SAFETY_MS` early. */
export function garminTokenExpiresAt(token: GarminTokenResponse, now = Date.now()): Date {
  return new Date(now + token.expires_in * 1000 - GARMIN_TOKEN_SAFETY_MS);
}

async function partnerRequest(
  path: string,
  accessToken: string,
  method: 'GET' | 'DELETE' = 'GET',
): Promise<unknown> {
  const response = await fetch(`${GARMIN_PARTNER_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) {
    throw new ProviderAuthError('Session Garmin expirée. Reconnecte Garmin dans les paramètres.');
  }
  if (!response.ok) {
    throw new Error(`Garmin ${path} a répondu ${response.status}`);
  }
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

/** The API user id every push names (stable across reconnections). */
export async function fetchGarminUserId(accessToken: string): Promise<string> {
  const body = (await partnerRequest('/user/id', accessToken)) as { userId?: unknown } | null;
  if (typeof body?.userId !== 'string' || !body.userId) {
    throw new Error('Garmin user id absent');
  }
  return body.userId;
}

export async function fetchGarminPermissions(accessToken: string): Promise<string[]> {
  const body = (await partnerRequest('/user/permissions', accessToken)) as {
    permissions?: unknown;
  } | null;
  return Array.isArray(body?.permissions)
    ? body.permissions.filter((p): p is string => typeof p === 'string')
    : [];
}

/** Required when the athlete disconnects or deletes their account from SharpIt. */
export async function deleteGarminRegistration(accessToken: string): Promise<void> {
  await partnerRequest('/user/registration', accessToken, 'DELETE');
}
