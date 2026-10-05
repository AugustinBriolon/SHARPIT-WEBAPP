import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({ userId: null as string | null, authCalls: 0 }));

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware:
    (handler: (auth: unknown, req: NextRequest) => Promise<Response | void>) =>
    async (req: NextRequest) => {
      const auth = async () => {
        state.authCalls += 1;
        return { userId: state.userId };
      };
      return (await handler(auth, req)) ?? NextResponse.next();
    },
}));

vi.mock('server-only', () => ({}));

vi.mock('@sharpit/app/lib/demo/demo-identity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isDemoClerkUser: async (userId: string) => userId === 'user_demo',
}));

vi.mock('@sharpit/server/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimiters: { apiGeneral: {} },
  rateLimitResponseBody: vi.fn(),
}));

async function run(url: string, headers: Record<string, string> = {}) {
  const { apiProxy } = await import('./api-proxy');
  return apiProxy(new NextRequest(url, { headers }), {} as never);
}

describe('apiProxy', () => {
  beforeEach(() => {
    state.userId = null;
    state.authCalls = 0;
  });

  it('authenticates the native contract with Clerk and seals the answer', async () => {
    state.userId = 'user_1';
    const response = await run('https://api.sharpit.app/api/v1/today', {
      authorization: 'Bearer t',
    });
    expect(response.status).toBe(200);
    expect(state.authCalls).toBe(1);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('refuses a Bearer Clerk rejects', async () => {
    const response = await run('https://api.sharpit.app/api/v1/today', {
      authorization: 'Bearer t',
    });
    expect(response.status).toBe(401);
  });

  it('lets a cron through to its route, which checks CRON_SECRET, without asking Clerk', async () => {
    const response = await run('https://api.sharpit.app/api/cron/sync', {
      authorization: 'Bearer cron-secret',
    });
    expect(response.status).toBe(200);
    expect(state.authCalls).toBe(0);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('still refuses a cron call with no Bearer at all', async () => {
    const response = await run('https://api.sharpit.app/api/cron/sync');
    expect(response.status).toBe(401);
  });

  it('lets a provider callback reach its route without asking Clerk', async () => {
    const response = await run('https://api.sharpit.app/api/strava/callback?code=c&state=s');
    expect(response.status).toBe(200);
    expect(state.authCalls).toBe(0);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('keeps the demo athlete read-only', async () => {
    state.userId = 'user_demo';
    const read = await run('https://api.sharpit.app/api/presentation/today', {
      authorization: 'Bearer t',
    });
    const { apiProxy } = await import('./api-proxy');
    const write = await apiProxy(
      new NextRequest('https://api.sharpit.app/api/goals', {
        method: 'POST',
        headers: { authorization: 'Bearer t' },
      }),
      {} as never,
    );

    expect(read.status).toBe(200);
    expect(write.status).toBe(403);
    expect(await write.json()).toEqual({ error: 'Mode démo : lecture seule' });
  });

  describe('local dev bypass', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('lets a web call without a token through in development, without asking Clerk', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('DEV_BYPASS_CLERK', 'true');

      const response = await run('http://localhost:3001/api/web/viewer');

      expect(response.status).toBe(200);
      expect(state.authCalls).toBe(0);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect((await run('http://localhost:3001/welcome')).status).toBe(404);
    });

    it('never bypasses outside development', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('DEV_BYPASS_CLERK', 'true');

      expect((await run('https://api.sharpit.app/api/web/viewer')).status).toBe(401);
    });
  });

  it('serves no other path', async () => {
    const response = await run('https://api.sharpit.app/api/cron/sync/../../../welcome', {
      authorization: 'Bearer t',
    });
    expect(response.status).toBe(404);
  });
});
