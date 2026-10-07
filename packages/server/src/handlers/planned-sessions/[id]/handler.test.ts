import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@sharpit/server/lib/queries', () => ({
  getPlannedSessionById: vi.fn(),
  updatePlannedSession: vi.fn(),
  deletePlannedSession: vi.fn(),
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('default'),
}));

vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => ({
  pushSessionToGoogle: vi.fn().mockResolvedValue(undefined),
  deleteSessionFromGoogle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sharpit/server/lib/planned-session/resolve-context', () => ({
  refreshAndPersistPlannedSessionContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sharpit/server/lib/decision-memory/repository', () => ({
  recordDecisionAction: vi.fn().mockResolvedValue({ id: 'action-1' }),
  findDecisionForPlannedSession: vi.fn().mockResolvedValue(null),
  findCoachingDecisionById: vi.fn().mockResolvedValue(null),
  findSessionPurposeForPlannedSession: vi.fn().mockResolvedValue(null),
}));

async function importRoute() {
  return await import('./handler');
}

const EXISTING = {
  id: 'session-1',
  type: 'RUN',
  intensity: 'ENDURANCE',
  durationMin: 45,
  load: 40,
  date: new Date('2026-07-20T12:00:00.000Z'),
};

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost/api/planned-sessions/session-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('GET /api/planned-sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when the session does not exist', async () => {
    const { GET } = await importRoute();
    const { getPlannedSessionById } = await import('@sharpit/server/lib/queries');
    vi.mocked(getPlannedSessionById).mockResolvedValue(null);

    const res = await GET(new NextRequest('http://localhost/api/planned-sessions/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns the session payload', async () => {
    const { GET } = await importRoute();
    const { getPlannedSessionById } = await import('@sharpit/server/lib/queries');
    vi.mocked(getPlannedSessionById).mockResolvedValue(EXISTING as never);

    const res = await GET(new NextRequest('http://localhost/api/planned-sessions/session-1'), {
      params: Promise.resolve({ id: 'session-1' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ id: 'session-1' });
  });
});

describe('PATCH /api/planned-sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records ACCEPTED when decisionId is given (athlete applying an adapt proposal)', async () => {
    const { getPlannedSessionById, updatePlannedSession } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction, findDecisionForPlannedSession } =
      await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(getPlannedSessionById).mockResolvedValue(EXISTING as never);
    vi.mocked(updatePlannedSession).mockResolvedValue({ ...EXISTING, load: 20 } as never);

    const { PATCH } = await importRoute();
    const response = await PATCH(patchRequest({ load: 20, decisionId: 'decision-1' }), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(recordDecisionAction).toHaveBeenCalledWith('default', {
      decisionId: 'decision-1',
      actionType: 'ACCEPTED',
      source: 'PLAN_REVIEW_UI',
      resultingPlannedSessionId: 'session-1',
    });
    expect(findDecisionForPlannedSession).not.toHaveBeenCalled();
  });

  it('rejects the write with 422 and never updates the session when the decision was Gate-REJECTED', async () => {
    const { updatePlannedSession, getPlannedSessionById } =
      await import('@sharpit/server/lib/queries');
    const { findCoachingDecisionById, recordDecisionAction } =
      await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(getPlannedSessionById).mockResolvedValue(EXISTING as never);
    vi.mocked(findCoachingDecisionById).mockResolvedValueOnce({
      id: 'decision-1',
      gateResult: { status: 'REJECTED' },
    } as never);

    const { PATCH } = await importRoute();
    const response = await PATCH(patchRequest({ load: 20, decisionId: 'decision-1' }), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(422);
    expect(updatePlannedSession).not.toHaveBeenCalled();
    expect(recordDecisionAction).not.toHaveBeenCalled();
  });

  it('records OVERRIDDEN when a session-defining field changes without decisionId and a prior decision exists', async () => {
    const { getPlannedSessionById, updatePlannedSession } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction, findDecisionForPlannedSession } =
      await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(getPlannedSessionById).mockResolvedValue(EXISTING as never);
    vi.mocked(updatePlannedSession).mockResolvedValue({ ...EXISTING, load: 70 } as never);
    vi.mocked(findDecisionForPlannedSession).mockResolvedValue({ id: 'decision-2' } as never);

    const { PATCH } = await importRoute();
    const response = await PATCH(patchRequest({ load: 70 }), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(findDecisionForPlannedSession).toHaveBeenCalledWith('default', 'session-1');
    expect(recordDecisionAction).toHaveBeenCalledWith('default', {
      decisionId: 'decision-2',
      actionType: 'OVERRIDDEN',
      source: 'CALENDAR_EDIT',
      resultingPlannedSessionId: 'session-1',
    });
  });

  it('does not look up a decision when the edit touches no session-defining field', async () => {
    const { getPlannedSessionById, updatePlannedSession } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction, findDecisionForPlannedSession } =
      await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(getPlannedSessionById).mockResolvedValue(EXISTING as never);
    vi.mocked(updatePlannedSession).mockResolvedValue({ ...EXISTING, title: 'Renamed' } as never);

    const { PATCH } = await importRoute();
    const response = await PATCH(patchRequest({ title: 'Renamed' }), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(findDecisionForPlannedSession).not.toHaveBeenCalled();
    expect(recordDecisionAction).not.toHaveBeenCalled();
  });

  it('does not record OVERRIDDEN when the session never came from a coaching decision', async () => {
    const { getPlannedSessionById, updatePlannedSession } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction, findDecisionForPlannedSession } =
      await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(getPlannedSessionById).mockResolvedValue(EXISTING as never);
    vi.mocked(updatePlannedSession).mockResolvedValue({ ...EXISTING, load: 70 } as never);
    vi.mocked(findDecisionForPlannedSession).mockResolvedValue(null);

    const { PATCH } = await importRoute();
    const response = await PATCH(patchRequest({ load: 70 }), {
      params: Promise.resolve({ id: 'session-1' }),
    });

    expect(response.status).toBe(200);
    expect(findDecisionForPlannedSession).toHaveBeenCalledWith('default', 'session-1');
    expect(recordDecisionAction).not.toHaveBeenCalled();
  });
});
