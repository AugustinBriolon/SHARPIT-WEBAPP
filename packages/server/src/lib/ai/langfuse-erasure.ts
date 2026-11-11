import { isLangfuseConfigured } from '@sharpit/server/lib/ai/langfuse';

/** Coach traces carry the athlete's context (health data included) and `userId = athleteId`. */
const DELETE_BATCH_SIZE = 100;
/** Bounded so an account deletion never hangs on Langfuse; the purge cron can run again. */
const MAX_ROUNDS = 50;
const MAX_LIST_PAGES = 20;
const OBSERVATIONS_PER_PAGE = 1000;
/** The v2 read wants a time window; this one starts before SharpIt existed. */
const READ_WINDOW_START = '2025-01-01T00:00:00Z';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type ObservationPage = {
  data?: Array<{ traceId?: string | null }>;
  meta?: { cursor?: string | null };
};

function langfuseRequest(path: string, init?: RequestInit): Promise<Response> {
  const base = (process.env.LANGFUSE_BASE_URL?.trim() || 'https://cloud.langfuse.com').replace(
    /\/+$/,
    '',
  );
  const credentials = Buffer.from(
    `${process.env.LANGFUSE_PUBLIC_KEY?.trim()}:${process.env.LANGFUSE_SECRET_KEY?.trim()}`,
  ).toString('base64');
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

function observationsQuery(athleteId: string, cursor: string | null | undefined): string {
  const query = new URLSearchParams({
    userId: athleteId,
    fields: 'core',
    limit: String(OBSERVATIONS_PER_PAGE),
    fromStartTime: READ_WINDOW_START,
    toStartTime: new Date(Date.now() + ONE_DAY_MS).toISOString(),
  });
  if (cursor) {
    query.set('cursor', cursor);
  }
  return query.toString();
}

/**
 * Trace ids of one athlete, read from the v2 observations API: the v1 traces list is removed
 * on Langfuse Cloud on 2026-11-16. A page can come back empty yet carry a cursor, so paging
 * goes on until ids turn up or the cursor runs out.
 */
async function nextTraceIds(athleteId: string): Promise<string[]> {
  const traceIds = new Set<string>();
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const response = await langfuseRequest(
      `/api/public/v2/observations?${observationsQuery(athleteId, cursor)}`,
    );
    if (!response.ok) {
      throw new Error(`Langfuse observations list failed (${response.status})`);
    }
    const body = (await response.json()) as ObservationPage;
    for (const row of body.data ?? []) {
      if (row.traceId) {
        traceIds.add(row.traceId);
      }
    }
    cursor = body.meta?.cursor;
    if (traceIds.size > 0 || !cursor) {
      break;
    }
  }
  return [...traceIds];
}

async function deleteTraceBatch(traceIds: string[]): Promise<void> {
  const response = await langfuseRequest('/api/public/traces', {
    method: 'DELETE',
    body: JSON.stringify({ traceIds }),
  });
  if (!response.ok) {
    throw new Error(`Langfuse traces delete failed (${response.status})`);
  }
}

/**
 * Deletes every Langfuse trace of an athlete (Langfuse public API). Each round deletes what it
 * read, so the next one sees the following traces. Langfuse deletes in the background: a trace
 * already requested but still listed ends the loop instead of being asked for again.
 * Returns how many were deleted; a no-op when Langfuse is not configured.
 */
export async function deleteLangfuseTracesForAthlete(athleteId: string): Promise<number> {
  if (!isLangfuseConfigured()) {
    return 0;
  }
  const requested = new Set<string>();
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const fresh = (await nextTraceIds(athleteId)).filter((id) => !requested.has(id));
    if (fresh.length === 0) {
      break;
    }
    for (let from = 0; from < fresh.length; from += DELETE_BATCH_SIZE) {
      await deleteTraceBatch(fresh.slice(from, from + DELETE_BATCH_SIZE));
    }
    fresh.forEach((id) => requested.add(id));
  }
  return requested.size;
}
