import { format } from 'date-fns';
import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import { ProviderAuthError } from '@sharpit/server/lib/integrations/shared/connection-status';

/** Garmin Connect Personal API (official, 2026-10-21): same paths as Connect, own host and auth. */
export const GARMIN_PERSONAL_API_BASE = 'https://personal.connectapi.garmin.com';
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token';

type QueryParams = Record<string, string | number | undefined>;

/** A Garmin HTTP failure. Carries the path and status only, never a credential. */
export class GarminApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Garmin ${path} a répondu ${status}`);
    this.name = 'GarminApiError';
  }
}

const EXPIRED_KEY_MESSAGE =
  'Clé API Garmin refusée ou expirée. Crée une nouvelle clé sur Garmin Connect.';

/**
 * Exchanges a Personal API key for a bearer token (valid 24 h, no refresh token).
 * A 400/401/403 means the key is wrong, revoked or expired.
 */
export async function exchangeGarminApiKey(apiKey: string): Promise<string> {
  const response = await fetch(`${GARMIN_PERSONAL_API_BASE}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { Authorization: `ApiKey ${apiKey}` },
    cache: 'no-store',
  });
  if ([400, 401, 403].includes(response.status)) {
    throw new ProviderAuthError(EXPIRED_KEY_MESSAGE);
  }
  if (!response.ok) {
    throw new GarminApiError(response.status, TOKEN_PATH);
  }
  const token = (await response.text()).trim();
  if (!token) {
    throw new GarminApiError(response.status, TOKEN_PATH);
  }
  return token;
}

function dateParam(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Read-only Garmin client over a bearer token. Takes Connect paths (`/activity-service/...`). */
export class GarminPersonalClient {
  constructor(private readonly bearerToken: string) {}

  async get(path: string, params?: QueryParams): Promise<unknown> {
    const url = new URL(`${GARMIN_PERSONAL_API_BASE}${path}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.bearerToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (response.status === 401) {
      throw new ProviderAuthError(EXPIRED_KEY_MESSAGE);
    }
    if (!response.ok) {
      throw new GarminApiError(response.status, url.pathname);
    }
    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  async getActivities(start: number, limit: number): Promise<IActivity[]> {
    const page = await this.get('/activitylist-service/activities/search/activities', {
      start,
      limit,
    });
    return Array.isArray(page) ? (page as IActivity[]) : [];
  }

  getUserProfile(): Promise<unknown> {
    return this.get('/userprofile-service/userprofile/settings');
  }

  getSleepData(date: Date): Promise<unknown> {
    return this.get('/sleep-service/sleep/dailySleep', { date: dateParam(date) });
  }

  getHeartRate(date: Date): Promise<unknown> {
    return this.get('/wellness-service/wellness/dailyHeartRate', { date: dateParam(date) });
  }
}

/** Opens a client from a plaintext key. Callers decrypt the stored key right before this. */
export async function garminClientFromApiKey(apiKey: string): Promise<GarminPersonalClient> {
  return new GarminPersonalClient(await exchangeGarminApiKey(apiKey));
}
