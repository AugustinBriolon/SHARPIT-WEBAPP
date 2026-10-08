import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@sharpit/server/lib/redis';

/**
 * Sliding-window limiters keyed by athlete (and sometimes a sub-resource) —
 * generous enough that real use never approaches them, tight enough to cap
 * worst-case AI/DB cost from a single account.
 *
 * Default posture is fail-OPEN (allow) when Upstash isn't configured or Redis
 * errors — used by the global `apiGeneral` flood backstop so a Redis blip
 * doesn't take the whole app down.
 *
 * Sensitive routes (coach / AI, provider sync, session analyze) pass
 * `{ failClosed: true }` and receive 503 when protection is unavailable —
 * except in local `development`, where limits are skipped entirely so coaches
 * and syncs stay usable without Upstash.
 *
 * Production must set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
 */

if (!redis && process.env.NODE_ENV !== 'development') {
  console.error(
    '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured — sensitive routes fail closed; apiGeneral fails open.',
  );
}

function limiter(requests: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string) {
  if (!redis) {
    return null;
  }
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `sharpit:${prefix}`,
    analytics: false,
  });
}

export const rateLimiters = {
  apiGeneral: limiter(300, '5 m', 'api'),
  coachChat: limiter(30, '10 m', 'coach-chat'),
  coachPlan: limiter(10, '1 h', 'coach-plan'),
  coachAdapt: limiter(10, '1 h', 'coach-adapt'),
  coachReview: limiter(5, '1 h', 'coach-review'),
  sessionAnalyze: limiter(20, '1 h', 'session-analyze'),
  activityNarrative: limiter(1, '10 m', 'activity-narrative'),
  providerSync: limiter(1, '2 m', 'provider-sync'),
  /** Open Food Facts lookups go out from our servers: one athlete must not spend everyone's quota. */
  foodSearch: limiter(20, '1 m', 'food-search'),
  /** A MyFitnessPal export rewrites years of days: a few tries an hour is plenty. */
  nutritionImport: limiter(5, '1 h', 'nutrition-import'),
  /** Free-text meal → foods (LLM): a handful of tries per hour is real use. */
  foodDescribe: limiter(20, '1 h', 'food-describe'),

  /** Journal taps are debounced on every client: a minute's worth is far above real use. */
  dayJournal: limiter(60, '1 m', 'day-journal'),
  /** Apple Health is sent by the phone in batches — a first import spans a year. */
  appleHealth: limiter(30, '10 m', 'apple-health'),
  /** « Donner un avis »: a few notes an hour is a talkative tester, more is a stuck button. */
  feedback: limiter(10, '1 h', 'feedback'),
};

export type RateLimitCause = 'limited' | 'unavailable';

export type RateLimitResult =
  { ok: true } | { ok: false; retryAfterSeconds: number; cause: RateLimitCause };

const UNAVAILABLE_RETRY_AFTER_SECONDS = 60;

export type CheckRateLimitOptions = {
  /** When true, missing/broken Upstash rejects the request instead of allowing it. */
  failClosed?: boolean;
};

/** Local `next dev` never enforces quotas — Upstash optional. */
export function isRateLimitBypassed(): boolean {
  return process.env.NODE_ENV === 'development';
}

function unavailableRateLimitResult(): Extract<RateLimitResult, { ok: false }> {
  return {
    ok: false,
    cause: 'unavailable',
    retryAfterSeconds: UNAVAILABLE_RETRY_AFTER_SECONDS,
  };
}

function resolveMissingLimiter(failClosed: boolean): RateLimitResult {
  return failClosed ? unavailableRateLimitResult() : { ok: true };
}

function resolveLimitResult(result: { success: boolean; reset: number }): RateLimitResult {
  if (result.success) {
    return { ok: true };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return { ok: false, cause: 'limited', retryAfterSeconds };
}

function resolveLimitError(failClosed: boolean, error: unknown): RateLimitResult {
  console.error(
    failClosed
      ? '[rate-limit] check failed, rejecting sensitive request:'
      : '[rate-limit] check failed, allowing request:',
    error,
  );
  return failClosed ? unavailableRateLimitResult() : { ok: true };
}

function formatRetryHint(retryAfterSeconds: number): string {
  if (retryAfterSeconds >= 60) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    return minutes === 1 ? 'dans 1 minute' : `dans ${minutes} minutes`;
  }
  return `dans ${retryAfterSeconds} secondes`;
}

/** `limiter` is null when Upstash isn't configured. */
export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string,
  options?: CheckRateLimitOptions,
): Promise<RateLimitResult> {
  if (isRateLimitBypassed()) {
    return { ok: true };
  }

  const failClosed = options?.failClosed === true;

  if (!limiter) {
    return resolveMissingLimiter(failClosed);
  }

  try {
    const result = await limiter.limit(key);
    return resolveLimitResult(result);
  } catch (error) {
    return resolveLimitError(failClosed, error);
  }
}

export function rateLimitResponseBody(
  retryAfterSeconds: number,
  cause: RateLimitCause = 'limited',
) {
  if (cause === 'unavailable') {
    return {
      error:
        'Le coach est temporairement indisponible. Réessaie dans une minute — si ça continue, le service de protection n’est pas joignable.',
      retryAfterSeconds,
    };
  }
  return {
    error: `Tu as envoyé trop de messages d’affilée. Réessaie ${formatRetryHint(retryAfterSeconds)}.`,
    retryAfterSeconds,
  };
}

export function rateLimitHttpStatus(cause: RateLimitCause): 429 | 503 {
  return cause === 'unavailable' ? 503 : 429;
}

/** Convenience for route handlers after `checkRateLimit`. */
export function rateLimitJsonResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return {
    body: rateLimitResponseBody(result.retryAfterSeconds, result.cause),
    status: rateLimitHttpStatus(result.cause),
  };
}
