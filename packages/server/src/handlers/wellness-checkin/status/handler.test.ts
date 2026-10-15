import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/app/lib/next/await-request', () => ({ awaitRequest: vi.fn() }));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-a'),
}));
vi.mock('@sharpit/server/lib/journal/wellness-checkin', () => ({
  getWellnessCheckInStatus: vi.fn(),
}));

const auth = () => import('@sharpit/server/lib/auth/current-athlete');
const service = () => import('@sharpit/server/lib/journal/wellness-checkin');

describe('GET /api/v1/wellness-checkin/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns only localDate + completed for the session athlete', async () => {
    const { GET } = await import('./handler');
    vi.mocked((await service()).getWellnessCheckInStatus).mockResolvedValue({
      localDate: '2026-10-15',
      completed: false,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ localDate: '2026-10-15', completed: false });
    expect(Object.keys(body).sort()).toEqual(['completed', 'localDate']);
    expect(JSON.stringify(body)).not.toMatch(/mood|energy|soreness|stress|notes|entry/i);
    expect((await service()).getWellnessCheckInStatus).toHaveBeenCalledWith('athlete-a');
  });

  it('never resolves status for another athlete (session id only)', async () => {
    const { GET } = await import('./handler');
    vi.mocked((await auth()).getCurrentAthleteId).mockResolvedValueOnce('athlete-a');
    vi.mocked((await service()).getWellnessCheckInStatus).mockResolvedValue({
      localDate: '2026-10-15',
      completed: true,
    });

    await GET();

    expect((await service()).getWellnessCheckInStatus).toHaveBeenCalledTimes(1);
    expect((await service()).getWellnessCheckInStatus).toHaveBeenCalledWith('athlete-a');
    expect((await service()).getWellnessCheckInStatus).not.toHaveBeenCalledWith('athlete-b');
  });

  it('logs booleans only — no health payload', async () => {
    const { GET } = await import('./handler');
    vi.mocked((await service()).getWellnessCheckInStatus).mockResolvedValue({
      localDate: '2026-10-15',
      completed: true,
    });

    await GET();

    const infoCalls = vi.mocked(console.info).mock.calls;
    expect(JSON.stringify(infoCalls)).not.toMatch(/mood|Fatigué|energyLevel/i);
    expect(infoCalls.some((call) => JSON.stringify(call).includes('"completed":true'))).toBe(true);
  });

  it('answers 500 without leaking the error body', async () => {
    const { GET } = await import('./handler');
    vi.mocked((await service()).getWellnessCheckInStatus).mockRejectedValue(
      new Error('secret health dump'),
    );

    const response = await GET();
    const body = await response.json();

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});
