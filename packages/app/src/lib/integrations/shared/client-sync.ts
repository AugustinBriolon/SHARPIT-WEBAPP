import { apiFetch } from '@sharpit/app/lib/api/api-fetch';
import type { RecordChange } from '@sharpit/app/lib/training/records/record-types';

export type StravaSyncResult = {
  imported: number;
  skipped: number;
  fetched: number;
  recordChanges?: RecordChange[];
};

export type StravaBackfillResult = {
  processed: number;
  withData: number;
  remaining: number;
  stopped?: string;
  recordChanges?: RecordChange[];
};

export type GarminSyncResult = {
  updated: number;
  days: number;
  activities: {
    imported: number;
    merged: number;
    updated: number;
    skipped: number;
  };
  recordChanges?: RecordChange[];
};

export type RenphoSyncResult = {
  imported: number;
  updated: number;
  days: number;
};

export type WithingsSyncResult = {
  imported: number;
  updated: number;
  days: number;
};

export type GoogleSyncResult = {
  pushed: number;
  updated: number;
  unlinked: number;
};

export type IntegrationId =
  | 'strava'
  | 'garmin'
  | 'withings'
  | 'renpho'
  | 'google'
  /** In-app food log — always available, no OAuth account (ADR-061). */
  | 'sharpit'
  /** Linked from the iPhone app (no account to connect here); see ADR-043 and ADR-054. */
  | 'apple-health'
  /** EventKit calendar — linked from the iPhone app only. */
  | 'apple-calendar';

async function parseJson<T>(response: Response, fallbackError: string): Promise<T> {
  const text = await response.text().catch(() => '');
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response (e.g. HTML 404/500 page from Next.js)
    }
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      (response.status ? `${fallbackError} (${response.status})` : fallbackError);
    throw new Error(message);
  }
  return data as T;
}

export async function runStravaSync(): Promise<StravaSyncResult> {
  const response = await apiFetch('/api/strava/sync', { method: 'POST' });
  return parseJson(response, 'Synchronisation Strava échouée');
}

export async function runStravaBackfill(): Promise<StravaBackfillResult> {
  const response = await apiFetch('/api/strava/backfill', { method: 'POST' });
  return parseJson(response, 'Récupération Strava échouée');
}

export async function runGarminSync(options?: { full?: boolean }): Promise<GarminSyncResult> {
  const response = await apiFetch('/api/garmin/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options?.full ? { full: true } : {}),
  });
  return parseJson(response, 'Synchronisation Garmin échouée');
}

export async function runRenphoSync(options?: { full?: boolean }): Promise<RenphoSyncResult> {
  const response = await apiFetch('/api/renpho/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options?.full ? { full: true } : {}),
  });
  return parseJson(response, 'Synchronisation Renpho échouée');
}

export async function runWithingsSync(options?: { full?: boolean }): Promise<WithingsSyncResult> {
  const response = await apiFetch('/api/withings/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options?.full ? { full: true } : {}),
  });
  return parseJson(response, 'Synchronisation Withings échouée');
}

export async function runGoogleSync(): Promise<GoogleSyncResult> {
  const response = await apiFetch('/api/google/sync', { method: 'POST' });
  return parseJson(response, 'Synchronisation Google échouée');
}

export function stravaBackfillSummary(data: StravaBackfillResult): string {
  const base = `${data.processed} séance(s) traitée(s), ${data.withData} avec données détaillées.`;
  if (data.remaining <= 0) {
    return `${base} Historique complet ✓`;
  }
  if (data.stopped === 'rate_limited') {
    return `${base} Limite Strava atteinte, ${data.remaining} restante(s) — réessaie dans ~15 min.`;
  }
  return `${base} ${data.remaining} restante(s), relance pour continuer.`;
}
