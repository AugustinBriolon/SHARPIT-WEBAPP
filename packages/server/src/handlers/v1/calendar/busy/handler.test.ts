import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './handler';
import * as authModule from '@sharpit/server/lib/auth/current-athlete';
import * as snapshotModule from '@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot';

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot', () => ({
  saveAppleCalendarBusy: vi.fn(),
}));

describe('/api/v1/calendar/busy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid payloads with 400', async () => {
    const req = new NextRequest('https://sharpit.app/api/v1/calendar/busy', {
      method: 'POST',
      body: JSON.stringify({ provider: 'google', intervals: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when there is no authenticated athlete', async () => {
    vi.mocked(authModule.getCurrentAthleteId).mockRejectedValue(
      new Error('getCurrentAthleteId called without an authenticated session'),
    );

    const req = new NextRequest('https://sharpit.app/api/v1/calendar/busy', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'apple-calendar',
        intervals: [{ start: '2026-10-10T07:00:00.000Z', end: '2026-10-10T08:00:00.000Z' }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(snapshotModule.saveAppleCalendarBusy).not.toHaveBeenCalled();
  });

  it('stores apple-calendar busy intervals for the current athlete', async () => {
    vi.mocked(authModule.getCurrentAthleteId).mockResolvedValue('ath-1');
    const intervals = [
      {
        start: '2026-10-10T07:00:00.000Z',
        end: '2026-10-10T08:30:00.000Z',
      },
    ];

    const req = new NextRequest('https://sharpit.app/api/v1/calendar/busy', {
      method: 'POST',
      body: JSON.stringify({ provider: 'apple-calendar', intervals }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(1);
    expect(snapshotModule.saveAppleCalendarBusy).toHaveBeenCalledWith('ath-1', intervals);
  });
});
