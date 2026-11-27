import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/db/client', () => ({ prisma: {} }));
vi.mock('@sharpit/app/lib/next/await-request', () => ({ awaitRequest: vi.fn() }));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
vi.mock('@sharpit/server/lib/health/activity-status-service', () => ({
  getActivityStatusStoreDb: vi.fn().mockResolvedValue({ status: 'active' }),
  setActivityStatusDb: vi.fn().mockResolvedValue({ status: 'sick' }),
}));
vi.mock('@sharpit/server/lib/health/activity-status-days', () => ({
  setActivityStatusDayDb: vi.fn(async (_p: unknown, _a: string, day: string, status: string) => ({
    day,
    status,
  })),
}));
vi.mock('@sharpit/app/lib/health/activity-status', () => ({ todayIsoDate: () => '2026-11-27' }));

async function put(body: unknown) {
  const { PUT } = await import('./handler');
  return PUT(
    new NextRequest('https://sharpit.app/api/activity-status', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );
}

describe('PUT /api/activity-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets a past day without touching the current mode', async () => {
    const days = await import('@sharpit/server/lib/health/activity-status-days');
    const service = await import('@sharpit/server/lib/health/activity-status-service');

    const response = await put({ status: 'sick', day: '2026-11-20' });

    expect(await response.json()).toEqual({
      store: { status: 'active' },
      day: { day: '2026-11-20', status: 'sick' },
    });
    expect(days.setActivityStatusDayDb).toHaveBeenCalledWith({}, 'athlete-1', '2026-11-20', 'sick');
    expect(service.setActivityStatusDb).not.toHaveBeenCalled();
  });

  it('sets the current mode for today, with or without the day', async () => {
    const service = await import('@sharpit/server/lib/health/activity-status-service');

    await put({ status: 'sick', day: '2026-11-27' });
    await put({ status: 'sick' });

    expect(service.setActivityStatusDb).toHaveBeenCalledTimes(2);
    expect(service.setActivityStatusDb).toHaveBeenCalledWith({}, 'athlete-1', { status: 'sick' });
  });

  it('refuses a day still to come', async () => {
    expect((await put({ status: 'sick', day: '2026-11-28' })).status).toBe(400);
  });
});
