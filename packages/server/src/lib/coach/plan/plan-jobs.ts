import { redis } from '@sharpit/server/lib/redis';

/**
 * A week generated in the background: the app starts it, may leave, and reads it back — the
 * drafts while the coach writes, then the week or the reason it failed. Kept a day in Redis;
 * nothing here is the athlete's data until they add the week to their plan.
 */
export type PlanJob<Plan = unknown> = {
  id: string;
  status: 'running' | 'ready' | 'failed';
  /** The sessions written so far, as the coach streams them. */
  drafts: unknown[];
  plan: Plan | null;
  error: string | null;
  goalId: string | null;
  startedAt: string;
  updatedAt: string;
};

const TTL_SECONDS = 60 * 60 * 24;

const jobKey = (athleteId: string, id: string) => `plan-job:${athleteId}:${id}`;
const latestKey = (athleteId: string) => `plan-job-latest:${athleteId}`;

export function isPlanJobStoreConfigured(): boolean {
  return redis !== null;
}

export async function createPlanJob(
  athleteId: string,
  goalId: string | null,
  { ttlSeconds = TTL_SECONDS }: { ttlSeconds?: number } = {},
): Promise<PlanJob> {
  if (!redis) {
    throw new Error('Plan jobs need Upstash Redis');
  }
  const now = new Date().toISOString();
  const job: PlanJob = {
    id: crypto.randomUUID(),
    status: 'running',
    drafts: [],
    plan: null,
    error: null,
    goalId,
    startedAt: now,
    updatedAt: now,
  };
  await redis.set(jobKey(athleteId, job.id), job, { ex: ttlSeconds });
  await redis.set(latestKey(athleteId), job.id, { ex: ttlSeconds });
  return job;
}

export async function updatePlanJob(
  athleteId: string,
  id: string,
  patch: Partial<Pick<PlanJob, 'status' | 'drafts' | 'plan' | 'error'>>,
): Promise<void> {
  if (!redis) {
    return;
  }
  const current = await redis.get<PlanJob>(jobKey(athleteId, id));
  if (!current) {
    return;
  }
  const next: PlanJob = { ...current, ...patch, updatedAt: new Date().toISOString() };
  // Keeps the life the job was given: an automatic week waits three days, not one.
  await redis.set(jobKey(athleteId, id), next, { keepTtl: true });
}

export async function getPlanJob(athleteId: string, id: string): Promise<PlanJob | null> {
  return redis ? redis.get<PlanJob>(jobKey(athleteId, id)) : null;
}

/** The athlete's most recent generation, to pick up after the app was closed. */
export async function getLatestPlanJob(athleteId: string): Promise<PlanJob | null> {
  if (!redis) {
    return null;
  }
  const id = await redis.get<string>(latestKey(athleteId));
  return id ? getPlanJob(athleteId, id) : null;
}
