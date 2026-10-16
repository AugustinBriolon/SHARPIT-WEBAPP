import type { Ratelimit } from '@upstash/ratelimit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  checkRateLimits,
  isRateLimitBypassed,
  rateLimitHttpStatus,
  rateLimitResponseBody,
} from './rate-limit';

function fakeLimiter(limit: Ratelimit['limit']): Ratelimit {
  return { limit } as unknown as Ratelimit;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isRateLimitBypassed', () => {
  it('is true in local development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(isRateLimitBypassed()).toBe(true);
  });

  it('is false in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(isRateLimitBypassed()).toBe(false);
  });
});

describe('checkRateLimit', () => {
  it('allows the request when under the limit', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const limiter = fakeLimiter(vi.fn().mockResolvedValue({ success: true, reset: 0 }));

    await expect(checkRateLimit(limiter, 'athlete-1')).resolves.toEqual({ ok: true });
  });

  it('blocks the request when over the limit, with a positive retryAfterSeconds', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const reset = Date.now() + 45_000;
    const limiter = fakeLimiter(vi.fn().mockResolvedValue({ success: false, reset }));

    const result = await checkRateLimit(limiter, 'athlete-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe('limited');
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(45);
    }
  });

  it('fails open when no limiter is configured (default)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(checkRateLimit(null, 'athlete-1')).resolves.toEqual({ ok: true });
  });

  it('fails open when the limiter throws (e.g. Redis outage, default)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const limiter = fakeLimiter(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(checkRateLimit(limiter, 'athlete-1')).resolves.toEqual({ ok: true });
  });

  it('fails closed when Upstash is missing and failClosed is set (production)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(checkRateLimit(null, 'athlete-1', { failClosed: true })).resolves.toEqual({
      ok: false,
      cause: 'unavailable',
      retryAfterSeconds: 60,
    });
  });

  it('fails closed when the limiter throws and failClosed is set (production)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const limiter = fakeLimiter(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(checkRateLimit(limiter, 'athlete-1', { failClosed: true })).resolves.toEqual({
      ok: false,
      cause: 'unavailable',
      retryAfterSeconds: 60,
    });
  });

  it('bypasses all limits in local development, even failClosed', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const limiter = fakeLimiter(vi.fn().mockResolvedValue({ success: false, reset: Date.now() }));

    await expect(checkRateLimit(null, 'athlete-1', { failClosed: true })).resolves.toEqual({
      ok: true,
    });
    await expect(checkRateLimit(limiter, 'athlete-1', { failClosed: true })).resolves.toEqual({
      ok: true,
    });
    expect(limiter.limit).not.toHaveBeenCalled();
  });
});

describe('checkRateLimits', () => {
  it('allows when every limiter allows', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const a = fakeLimiter(vi.fn().mockResolvedValue({ success: true, reset: 0 }));
    const b = fakeLimiter(vi.fn().mockResolvedValue({ success: true, reset: 0 }));

    await expect(checkRateLimits([a, b], 'athlete-1')).resolves.toEqual({ ok: true });
  });

  it('returns the first refusal among parallel checks', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const reset = Date.now() + 20_000;
    const burst = fakeLimiter(vi.fn().mockResolvedValue({ success: false, reset }));
    const sustained = fakeLimiter(vi.fn().mockResolvedValue({ success: true, reset: 0 }));

    const result = await checkRateLimits([burst, sustained], 'athlete-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe('limited');
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});

describe('rateLimitResponseBody', () => {
  it('reports seconds under a minute in plain athlete copy', () => {
    expect(rateLimitResponseBody(30)).toEqual({
      error: 'Tu as envoyé trop de messages d’affilée. Réessaie dans 30 secondes.',
      retryAfterSeconds: 30,
    });
  });

  it('reports minutes at or above 60 seconds', () => {
    expect(rateLimitResponseBody(120)).toEqual({
      error: 'Tu as envoyé trop de messages d’affilée. Réessaie dans 2 minutes.',
      retryAfterSeconds: 120,
    });
  });

  it('explains temporary unavailability without jargon', () => {
    expect(rateLimitResponseBody(60, 'unavailable')).toEqual({
      error:
        'Le coach est temporairement indisponible. Réessaie dans une minute — si ça continue, le service de protection n’est pas joignable.',
      retryAfterSeconds: 60,
    });
  });
});

describe('rateLimitHttpStatus', () => {
  it('returns 429 for limited and 503 for unavailable', () => {
    expect(rateLimitHttpStatus('limited')).toBe(429);
    expect(rateLimitHttpStatus('unavailable')).toBe(503);
  });
});
