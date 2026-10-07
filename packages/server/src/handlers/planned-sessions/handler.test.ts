import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@sharpit/server/lib/queries', () => ({
  createPlannedSession: vi.fn(),
  getPlannedSessionById: vi.fn(),
  getPlannedSessions: vi.fn(),
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('default'),
}));

vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => ({
  pushSessionToGoogle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sharpit/server/lib/planned-session/resolve-context', () => ({
  refreshAndPersistPlannedSessionContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sharpit/server/lib/decision-memory/repository', () => ({
  recordDecisionAction: vi.fn().mockResolvedValue({ id: 'action-1' }),
  findCoachingDecisionById: vi.fn().mockResolvedValue(null),
  findSessionPurposesByPlannedSessionIds: vi.fn().mockResolvedValue(new Map()),
}));

async function importRoute() {
  return await import('./handler');
}

const BASE_BODY = {
  type: 'RUN',
  date: '2026-07-20T12:00:00.000Z',
  intensity: 'ENDURANCE',
  durationMin: 45,
  load: 40,
  description: 'Footing Z2 45 min',
};

describe('POST /api/planned-sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session and does not touch Decision Memory when no decisionId is given', async () => {
    const { createPlannedSession, getPlannedSessionById } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction } = await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(createPlannedSession).mockResolvedValue({ id: 'session-1' } as never);
    vi.mocked(getPlannedSessionById).mockResolvedValue({ id: 'session-1' } as never);

    const { POST } = await importRoute();
    const response = await POST(
      new NextRequest('http://localhost/api/planned-sessions', {
        method: 'POST',
        body: JSON.stringify(BASE_BODY),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordDecisionAction).not.toHaveBeenCalled();
  });

  it('records an ACCEPTED action linked to the new session when decisionId is given', async () => {
    const { createPlannedSession, getPlannedSessionById } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction } = await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(createPlannedSession).mockResolvedValue({ id: 'session-2' } as never);
    vi.mocked(getPlannedSessionById).mockResolvedValue({ id: 'session-2' } as never);

    const { POST } = await importRoute();
    const response = await POST(
      new NextRequest('http://localhost/api/planned-sessions', {
        method: 'POST',
        body: JSON.stringify({ ...BASE_BODY, decisionId: 'decision-1' }),
      }),
    );

    expect(response.status).toBe(201);
    expect(recordDecisionAction).toHaveBeenCalledWith('default', {
      decisionId: 'decision-1',
      actionType: 'ACCEPTED',
      source: 'PLAN_REVIEW_UI',
      resultingPlannedSessionId: 'session-2',
    });
  });

  it('does not send decisionId to session validation — it must not leak into PlannedSession fields', async () => {
    const { createPlannedSession, getPlannedSessionById } =
      await import('@sharpit/server/lib/queries');
    vi.mocked(createPlannedSession).mockResolvedValue({ id: 'session-3' } as never);
    vi.mocked(getPlannedSessionById).mockResolvedValue({ id: 'session-3' } as never);

    const { POST } = await importRoute();
    await POST(
      new NextRequest('http://localhost/api/planned-sessions', {
        method: 'POST',
        body: JSON.stringify({ ...BASE_BODY, decisionId: 'decision-1' }),
      }),
    );

    const [[createArgs]] = vi.mocked(createPlannedSession).mock.calls;
    expect(createArgs).not.toHaveProperty('decisionId');
  });

  it('rejects the write with 422 and never creates the session when the decision was Gate-REJECTED', async () => {
    const { createPlannedSession } = await import('@sharpit/server/lib/queries');
    const { findCoachingDecisionById, recordDecisionAction } =
      await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(findCoachingDecisionById).mockResolvedValueOnce({
      id: 'decision-1',
      gateResult: { status: 'REJECTED' },
    } as never);

    const { POST } = await importRoute();
    const response = await POST(
      new NextRequest('http://localhost/api/planned-sessions', {
        method: 'POST',
        body: JSON.stringify({ ...BASE_BODY, decisionId: 'decision-1' }),
      }),
    );

    expect(response.status).toBe(422);
    expect(createPlannedSession).not.toHaveBeenCalled();
    expect(recordDecisionAction).not.toHaveBeenCalled();
  });

  it('still returns 201 even when recordDecisionAction rejects — the audit hook is best-effort', async () => {
    const { createPlannedSession, getPlannedSessionById } =
      await import('@sharpit/server/lib/queries');
    const { recordDecisionAction } = await import('@sharpit/server/lib/decision-memory/repository');
    vi.mocked(createPlannedSession).mockResolvedValue({ id: 'session-4' } as never);
    vi.mocked(getPlannedSessionById).mockResolvedValue({ id: 'session-4' } as never);
    vi.mocked(recordDecisionAction).mockRejectedValue(new Error('db down'));

    const { POST } = await importRoute();
    const response = await POST(
      new NextRequest('http://localhost/api/planned-sessions', {
        method: 'POST',
        body: JSON.stringify({ ...BASE_BODY, decisionId: 'decision-1' }),
      }),
    );

    expect(response.status).toBe(201);
  });
});
