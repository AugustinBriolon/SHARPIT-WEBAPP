import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const receiveGarminPush = vi.fn();
const processGarminPushRow = vi.fn();
const afterCallbacks: Array<() => Promise<void>> = [];

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (cb: () => Promise<void>) => afterCallbacks.push(cb) };
});
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-push', () => ({
  receiveGarminPush,
  processGarminPushRow,
}));

const ORIGINAL_SECRET = process.env.GARMIN_PUSH_SECRET;

function push(key: string | null, body: unknown = { dailies: [{ userId: 'u1' }] }) {
  const query = key === null ? '' : `?key=${key}`;
  return new NextRequest(`https://api.sharpit.app/api/garmin/push${query}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.GARMIN_PUSH_SECRET = 'push-secret';
  receiveGarminPush.mockReset().mockResolvedValue(['row-1']);
  processGarminPushRow.mockReset().mockResolvedValue(undefined);
  afterCallbacks.length = 0;
});

afterEach(() => {
  process.env.GARMIN_PUSH_SECRET = ORIGINAL_SECRET;
});

describe('POST /api/garmin/push', () => {
  it('refuses a push without the secret, and stores nothing', async () => {
    const { POST } = await import('./handler');
    expect((await POST(push(null))).status).toBe(401);
    expect((await POST(push('wrong'))).status).toBe(401);
    expect(receiveGarminPush).not.toHaveBeenCalled();
  });

  it('logs a refused key by its length, never its value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { POST } = await import('./handler');
    await POST(push('wrong'));
    expect(warn).toHaveBeenCalledWith('[garmin-push] refused', {
      secretConfigured: true,
      keyLength: 5,
      queryKeys: ['key'],
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('wrong');
    warn.mockRestore();
  });

  it('takes the secret from the path, where the Garmin portal lets it stay', async () => {
    const { POST } = await import('./handler');
    const request = new NextRequest('https://api.sharpit.app/api/garmin/push/push-secret', {
      method: 'POST',
      body: JSON.stringify({ dailies: [{ userId: 'u1' }] }),
    });
    const accepted = await POST(request, { params: Promise.resolve({ key: 'push-secret' }) });
    expect(accepted.status).toBe(200);
    const refused = await POST(request, { params: Promise.resolve({ key: 'wrong' }) });
    expect(refused.status).toBe(401);
  });

  it('refuses everything while no secret is configured', async () => {
    delete process.env.GARMIN_PUSH_SECRET;
    const { POST } = await import('./handler');
    expect((await POST(push('push-secret'))).status).toBe(401);
  });

  it('stores the push and answers 200 before processing it', async () => {
    const { POST } = await import('./handler');
    const response = await POST(push('push-secret'));

    expect(response.status).toBe(200);
    expect(receiveGarminPush).toHaveBeenCalledWith({ dailies: [{ userId: 'u1' }] });
    expect(processGarminPushRow).not.toHaveBeenCalled();

    await afterCallbacks[0]();
    expect(processGarminPushRow).toHaveBeenCalledWith('row-1');
  });

  it('still answers 200 when processing fails: the cron replays the row', async () => {
    processGarminPushRow.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('./handler');

    expect((await POST(push('push-secret'))).status).toBe(200);
    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
  });
});
