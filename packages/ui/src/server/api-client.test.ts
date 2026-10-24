import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: async () => ({ getToken: async () => 'tok' }) }));

describe('server api client', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.sharpit.app');
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('calls api. as the signed-in athlete, uncached, with the page origin when asked', async () => {
    fetchSpy.mockResolvedValue(new Response('{}'));
    const { serverApiFetch } = await import('./api-client');
    await serverApiFetch('/api/garmin/connect', { origin: 'https://sharpit.app' });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://api.sharpit.app/api/garmin/connect');
    expect(headers.get('authorization')).toBe('Bearer tok');
    expect(headers.get('origin')).toBe('https://sharpit.app');
    expect(init.cache).toBe('no-store');
  });

  it('revives date-times but leaves day ids alone', async () => {
    fetchSpy.mockResolvedValue(
      Response.json({ date: '2026-09-26T07:30:00.000Z', trainingDayId: '2026-09-26' }),
    );
    const { serverApiJson } = await import('./api-client');
    const payload = await serverApiJson<{ date: Date; trainingDayId: string }>('/api/x', true);

    expect(payload?.date).toBeInstanceOf(Date);
    expect(payload?.date.toISOString()).toBe('2026-09-26T07:30:00.000Z');
    expect(payload?.trainingDayId).toBe('2026-09-26');
  });

  it('keeps ISO strings as strings unless asked to revive', async () => {
    fetchSpy.mockResolvedValue(Response.json({ at: '2026-09-26T07:30:00.000Z' }));
    const { serverApiJson } = await import('./api-client');
    expect((await serverApiJson<{ at: string }>('/api/x'))?.at).toBe('2026-09-26T07:30:00.000Z');
  });

  it('answers null on 404 and throws on other failures', async () => {
    const { ApiRequestError, serverApiJson } = await import('./api-client');
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(serverApiJson('/api/x')).resolves.toBeNull();
    fetchSpy.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(serverApiJson('/api/x')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('refuses to guess the api origin in production', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { serverApiFetch } = await import('./api-client');
    await expect(serverApiFetch('/api/x')).rejects.toThrow(/NEXT_PUBLIC_API_ORIGIN/);
  });
});
