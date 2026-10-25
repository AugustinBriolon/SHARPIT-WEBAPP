import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GarminWorkoutPushError } from '@sharpit/server/lib/integrations/garmin/garmin-training-api';
import { ProviderAuthError } from '@sharpit/server/lib/integrations/shared/connection-status';

const { requirePro, pushPlannedSessionToGarmin } = vi.hoisted(() => ({
  requirePro: vi.fn(),
  pushPlannedSessionToGarmin: vi.fn(),
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(async () => 'athlete-1'),
}));
vi.mock('@sharpit/server/lib/access/require-pro', () => ({ requirePro }));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-workout-push', () => ({
  pushPlannedSessionToGarmin,
}));

const { POST } = await import('./handler');

function post(body: unknown) {
  return new NextRequest('https://api.sharpit.app/api/garmin/workouts/from-planned-session', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requirePro.mockResolvedValue(null);
});

describe('POST /api/garmin/workouts/from-planned-session', () => {
  it('answers pro_required to a Free athlete, before touching Garmin', async () => {
    requirePro.mockResolvedValue(NextResponse.json({ error: 'pro_required' }, { status: 403 }));
    const response = await POST(post({ plannedSessionId: 'ps-1' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'pro_required' });
    expect(pushPlannedSessionToGarmin).not.toHaveBeenCalled();
  });

  it('refuses a body without a session id', async () => {
    expect((await POST(post({}))).status).toBe(400);
  });

  it('returns the receipt and passes replace through', async () => {
    pushPlannedSessionToGarmin.mockResolvedValue({
      workoutId: '9001',
      scheduledDate: '2026-10-27',
    });
    const response = await POST(post({ plannedSessionId: 'ps-1', replace: true }));
    expect(response.status).toBe(200);
    expect(pushPlannedSessionToGarmin).toHaveBeenCalledWith('athlete-1', {
      plannedSessionId: 'ps-1',
      replace: true,
    });
  });

  it('answers a refusal with its status and code', async () => {
    pushPlannedSessionToGarmin.mockRejectedValue(
      new GarminWorkoutPushError('already_pushed', 'Séance déjà envoyée sur ta montre.', 409),
    );
    const response = await POST(post({ plannedSessionId: 'ps-1' }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Séance déjà envoyée sur ta montre.',
      code: 'already_pushed',
    });
  });

  it('answers a lost Garmin session with 403 reconnect, never 401', async () => {
    pushPlannedSessionToGarmin.mockRejectedValue(new ProviderAuthError('Session Garmin expirée.'));
    const response = await POST(post({ plannedSessionId: 'ps-1' }));
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('reconnect');
  });

  it('answers 502 when Garmin fails otherwise', async () => {
    pushPlannedSessionToGarmin.mockRejectedValue(new Error('Garmin training POST a répondu 500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await POST(post({ plannedSessionId: 'ps-1' }));
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe('garmin_unavailable');
  });
});
