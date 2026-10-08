import { ActivityType } from '@prisma/client';
import { ProviderAuthError } from '@sharpit/server/lib/integrations/shared/connection-status';
import { normalizeOAuthPublicOrigin } from '@sharpit/app/lib/integrations/oauth-public-origin';

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';
const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

export const STRAVA_SCOPE = 'read,activity:read_all';

/** URL de callback OAuth, déduite du host courant si STRAVA_REDIRECT_URI est absent. */
export function getStravaRedirectUri(origin?: string) {
  if (process.env.STRAVA_REDIRECT_URI) {
    try {
      const url = new URL(process.env.STRAVA_REDIRECT_URI);
      return `${normalizeOAuthPublicOrigin(url.origin)}${url.pathname}`;
    } catch {
      return process.env.STRAVA_REDIRECT_URI;
    }
  }
  if (origin) {
    return `${normalizeOAuthPublicOrigin(origin)}/api/strava/callback`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/strava/callback`;
  }
  return 'http://localhost:3000/api/strava/callback';
}

export function getStravaConfig(origin?: string) {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = getStravaRedirectUri(origin);

  if (!clientId || !clientSecret) {
    throw new Error('STRAVA_CLIENT_ID et STRAVA_CLIENT_SECRET doivent être définis dans .env');
  }

  return { clientId, clientSecret, redirectUri };
}

export function isStravaConfigured() {
  return Boolean(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
}

export function buildAuthorizeUrl(state: string, origin?: string) {
  const { clientId, redirectUri } = getStravaConfig(origin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
    state,
  });
  return `${STRAVA_OAUTH_BASE}/authorize?${params.toString()}`;
}

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: {
    id: number;
    firstname?: string;
    lastname?: string;
    profile?: string;
  };
}

export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = getStravaConfig();
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw new Error(`Échange du code Strava échoué (${response.status})`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
  const { clientId, clientSecret } = getStravaConfig();
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const message = `Refresh du token Strava échoué (${response.status})`;
    if (response.status === 400 || response.status === 401) {
      throw new ProviderAuthError(message);
    }
    throw new Error(message);
  }

  return response.json();
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  /** Local wall-clock start; digits are local even when Strava appends `Z`. */
  start_date_local?: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  average_speed?: number;
  suffer_score?: number;
}

export async function fetchActivities(
  accessToken: string,
  options: { after?: number; perPage?: number; page?: number } = {},
): Promise<StravaActivity[]> {
  const params = new URLSearchParams({
    per_page: String(options.perPage ?? 100),
    page: String(options.page ?? 1),
  });
  if (options.after) {
    params.set('after', String(options.after));
  }

  const response = await fetch(`${STRAVA_API_BASE}/athlete/activities?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Récupération des activités Strava échouée (${response.status})`);
  }

  return response.json();
}

export interface StravaActivityDetail extends StravaActivity {
  description?: string;
  private_note?: string;
}

/**
 * Récupère le détail d'une activité Strava (inclut la `description` saisie par
 * l'athlète, absente de la liste). Renvoie null si indisponible.
 */
export async function fetchActivityDetail(
  accessToken: string,
  stravaActivityId: string,
): Promise<StravaActivityDetail | null> {
  const response = await fetch(`${STRAVA_API_BASE}/activities/${stravaActivityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export const STRAVA_STREAM_KEYS = [
  'time',
  'latlng',
  'distance',
  'altitude',
  'heartrate',
  'watts',
  'cadence',
  'velocity_smooth',
  'temp',
] as const;

export type StravaStreamKey = (typeof STRAVA_STREAM_KEYS)[number];

type StravaStreamEntry<T> = {
  type: StravaStreamKey;
  data: T[];
  series_type: string;
  original_size: number;
  resolution: string;
};

export type StravaStreamSet = Partial<{
  time: StravaStreamEntry<number>;
  latlng: StravaStreamEntry<[number, number]>;
  distance: StravaStreamEntry<number>;
  altitude: StravaStreamEntry<number>;
  heartrate: StravaStreamEntry<number>;
  watts: StravaStreamEntry<number>;
  cadence: StravaStreamEntry<number>;
  velocity_smooth: StravaStreamEntry<number>;
  temp: StravaStreamEntry<number>;
}>;

/**
 * Récupère les streams (séries temporelles) d'une activité Strava.
 * Renvoie `null` si Strava répond 404 (aucune donnée détaillée disponible,
 * ex : séance sans capteur). Lève une erreur sur les autres échecs (transitoires).
 */
export async function fetchActivityStreams(
  accessToken: string,
  stravaActivityId: string,
): Promise<StravaStreamSet | null> {
  const params = new URLSearchParams({
    keys: STRAVA_STREAM_KEYS.join(','),
    key_by_type: 'true',
  });

  const response = await fetch(
    `${STRAVA_API_BASE}/activities/${stravaActivityId}/streams?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Récupération des streams Strava échouée (${response.status})`);
  }

  return response.json();
}

const STRAVA_TYPE_RULES: Array<{ pattern: RegExp; type: ActivityType }> = [
  { pattern: /run/, type: ActivityType.RUN },
  { pattern: /ride|bike|cycling|velomobile/, type: ActivityType.BIKE },
  { pattern: /swim/, type: ActivityType.SWIM },
  { pattern: /weighttraining|workout|crossfit/, type: ActivityType.STRENGTH },
];

export function mapStravaType(stravaType: string): ActivityType | null {
  const type = stravaType.toLowerCase();
  for (const rule of STRAVA_TYPE_RULES) {
    if (rule.pattern.test(type)) {
      return rule.type;
    }
  }
  return null;
}

/** Revokes SHARPIT's access for this Strava athlete — every token of the grant dies with it. */
export async function deauthorizeStrava(accessToken: string): Promise<void> {
  const response = await fetch(`${STRAVA_OAUTH_BASE}/deauthorize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Strava deauthorize failed (HTTP ${response.status})`);
  }
}
