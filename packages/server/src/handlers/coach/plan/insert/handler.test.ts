import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const created = vi.hoisted(() => ({ bodies: [] as unknown[], fail: false }));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));

vi.mock('@sharpit/server/handlers/planned-sessions/handler', () => ({
  createPlannedSessionFromBody: vi.fn(async (_athleteId: string, body: unknown) => {
    if (created.fail) {
      return { response: NextResponse.json({ error: 'rejected' }, { status: 422 }) };
    }
    created.bodies.push(body);
    return { session: { id: `s${created.bodies.length}` } };
  }),
}));

const squat = {
  sets: [{ exercise: 'Squat', intent: 'STRENGTH', pattern: 'SQUAT', sets: 4, reps: 6 }],
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-09-28',
    startTime: null,
    type: 'RUN',
    intensity: 'ENDURANCE',
    title: 'Footing',
    description: 'Footing en aisance respiratoire',
    durationMin: 45,
    load: 40,
    decisionId: null,
    ...overrides,
  };
}

async function insert(body: unknown) {
  const { POST } = await import('./handler');
  return POST(
    new NextRequest('https://api.sharpit.app/api/v1/coach/plan/insert', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

vi.mock('@sharpit/server/lib/access/require-pro', () => ({
  PRO_REQUIRED: 'pro_required',
  requirePro: vi.fn().mockResolvedValue(null),
}));

describe('coach plan insert', () => {
  beforeEach(() => {
    created.bodies = [];
    created.fail = false;
  });

  it('stores a strength session with its prescription and a summary for description', async () => {
    const response = await insert({
      goalId: 'goal-1',
      sessions: [
        session(),
        session({
          type: 'STRENGTH',
          intensity: 'TEMPO',
          title: 'Force',
          description: '',
          strengthPrescription: squat,
        }),
      ],
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ created: 2, ids: ['s1', 's2'] });
    const strength = created.bodies[1] as {
      strengthPrescription: { sets: unknown[] };
      description: string;
      goalId: string;
    };
    expect(strength.strengthPrescription.sets).toHaveLength(1);
    expect(strength.description).toBeTruthy();
    expect(strength.goalId).toBe('goal-1');
  });

  it('refuses the whole week before writing when one session cannot be stored', async () => {
    const response = await insert({
      sessions: [
        session(),
        session({ type: 'STRENGTH', description: '', strengthPrescription: null }),
      ],
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ index: 1 });
    expect(created.bodies).toHaveLength(0);
  });

  it('rejects a malformed body', async () => {
    const response = await insert({ sessions: [] });
    expect(response.status).toBe(400);
  });

  it('passes a Gate refusal through', async () => {
    created.fail = true;
    const response = await insert({ sessions: [session({ decisionId: 'd1' })] });
    expect(response.status).toBe(422);
  });
});

describe('coach plan insert · Pro (ADR-097)', () => {
  it('keeps the onboarding preview from a Free athlete: nothing is written', async () => {
    const { requirePro } = await import('@sharpit/server/lib/access/require-pro');
    vi.mocked(requirePro).mockResolvedValueOnce(
      NextResponse.json({ error: 'pro_required' }, { status: 403 }),
    );

    const response = await insert({ goalId: 'goal-1', sessions: [session()] });

    expect(response.status).toBe(403);
    expect(created.bodies).toEqual([]);
  });
});
