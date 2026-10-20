import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runGoogleSync } from './client-sync';

function signIn(token: string | null) {
  vi.stubGlobal('Clerk', { loaded: true, session: token ? { getToken: async () => token } : null });
}

describe('client-sync', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_ORIGIN', 'https://api.sharpit.app');
    signIn('mock-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('routes runGoogleSync to API origin with Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pushed: 2, updated: 1, unlinked: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runGoogleSync();
    expect(result).toEqual({ pushed: 2, updated: 1, unlinked: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sharpit.app/api/google/sync');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer mock-token');
  });

  it('safely handles non-JSON / HTML 404 responses without throwing DOMException SyntaxError', async () => {
    const html404 = '<!DOCTYPE html><html><body>404 Not Found</body></html>';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html404, {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(runGoogleSync()).rejects.toThrow('Synchronisation Google échouée (404)');
  });

  it('surfaces json error message when API responds with error JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Session Google expirée' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(runGoogleSync()).rejects.toThrow('Session Google expirée');
  });
});
