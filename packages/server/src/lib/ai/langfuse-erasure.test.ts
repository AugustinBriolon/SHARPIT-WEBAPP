import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/server/lib/ai/langfuse', () => ({ isLangfuseConfigured: () => true }));

describe('deleteLangfuseTracesForAthlete', () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'pk-lf-fixture');
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'sk-lf-fixture');
    vi.stubEnv('LANGFUSE_BASE_URL', 'https://langfuse.example/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  type Page = { ids: string[]; cursor?: string };

  /** Answers each observations read with the next page, and accepts every delete. */
  function stubLangfuse(pages: Page[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
        if (init?.method === 'DELETE') {
          return new Response('{}', { status: 200 });
        }
        const page = pages.shift() ?? { ids: [] };
        return Response.json({
          data: page.ids.flatMap((traceId) => [{ traceId }, { traceId }]),
          meta: page.cursor ? { cursor: page.cursor } : {},
        });
      }),
    );
  }

  const deleted = () =>
    calls.filter((c) => c.method === 'DELETE').map((c) => JSON.parse(c.body ?? '{}').traceIds);

  it('reads the athlete’s traces from the v2 observations API, not the removed v1 list', async () => {
    stubLangfuse([{ ids: ['t1', 't2'] }, { ids: ['t3'] }, { ids: [] }]);
    const { deleteLangfuseTracesForAthlete } = await import('./langfuse-erasure');

    await expect(deleteLangfuseTracesForAthlete('athlete-1')).resolves.toBe(3);

    const read = new URL(calls[0]?.url ?? '');
    expect(read.pathname).toBe('/api/public/v2/observations');
    expect(read.searchParams.get('userId')).toBe('athlete-1');
    expect(read.searchParams.get('fromStartTime')).toBe('2025-01-01T00:00:00Z');
    expect(calls.every((c) => !c.url.includes('/api/public/traces?'))).toBe(true);
    expect(deleted()).toEqual([['t1', 't2'], ['t3']]);
  });

  it('follows the cursor past an empty page', async () => {
    stubLangfuse([{ ids: [], cursor: 'c1' }, { ids: ['t1'] }, { ids: [] }]);
    const { deleteLangfuseTracesForAthlete } = await import('./langfuse-erasure');

    await expect(deleteLangfuseTracesForAthlete('athlete-1')).resolves.toBe(1);
    expect(new URL(calls[1]?.url ?? '').searchParams.get('cursor')).toBe('c1');
  });

  it('stops when only traces already requested are still listed', async () => {
    stubLangfuse([{ ids: ['t1'] }, { ids: ['t1'] }]);
    const { deleteLangfuseTracesForAthlete } = await import('./langfuse-erasure');

    await expect(deleteLangfuseTracesForAthlete('athlete-1')).resolves.toBe(1);
    expect(deleted()).toEqual([['t1']]);
  });

  it('deletes in batches of 100', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `t${index}`);
    stubLangfuse([{ ids }, { ids: [] }]);
    const { deleteLangfuseTracesForAthlete } = await import('./langfuse-erasure');

    await deleteLangfuseTracesForAthlete('athlete-1');
    expect(deleted().map((batch) => batch.length)).toEqual([100, 50]);
  });

  it('fails loudly when Langfuse refuses, so the caller can report it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 410 })),
    );
    const { deleteLangfuseTracesForAthlete } = await import('./langfuse-erasure');

    await expect(deleteLangfuseTracesForAthlete('athlete-1')).rejects.toThrow(/410/);
  });
});
