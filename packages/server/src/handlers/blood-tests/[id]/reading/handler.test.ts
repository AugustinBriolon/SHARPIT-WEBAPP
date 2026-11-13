import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleteFinding } from '@sharpit/app/lib/blood-markers/athlete-reading';

const requireProMock = vi.fn();
const getBloodTestMock = vi.fn();
const trainingMock = vi.fn();

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: () => Promise.resolve('ath1'),
}));
vi.mock('@sharpit/server/lib/access/require-pro', () => ({
  requirePro: (...args: unknown[]) => requireProMock(...args),
}));
vi.mock('@sharpit/server/lib/queries/blood-tests', () => ({
  getBloodTest: (...args: unknown[]) => getBloodTestMock(...args),
}));
vi.mock('@sharpit/server/lib/queries/training-before-sample', () => ({
  trainingBeforeSample: (...args: unknown[]) => trainingMock(...args),
}));

const context = { params: Promise.resolve({ id: 'bt1' }) };

describe('GET /api/v1/blood-tests/[id]/reading', () => {
  beforeEach(() => {
    requireProMock.mockReset().mockResolvedValue(null);
    getBloodTestMock.mockReset();
    trainingMock.mockReset();
  });

  it('answers pro_required below Pro and reads nothing', async () => {
    requireProMock.mockResolvedValue(NextResponse.json({ error: 'pro_required' }, { status: 403 }));
    const { GET } = await import('./handler');

    const response = await GET({} as never, context);

    expect(response.status).toBe(403);
    expect(getBloodTestMock).not.toHaveBeenCalled();
  });

  it('answers 404 for a test that is not the athlete’s', async () => {
    getBloodTestMock.mockResolvedValue(null);
    const { GET } = await import('./handler');

    expect((await GET({} as never, context)).status).toBe(404);
    expect(getBloodTestMock).toHaveBeenCalledWith('ath1', 'bt1');
  });

  it('reads the test against the training before its sample', async () => {
    getBloodTestMock.mockResolvedValue({
      id: 'bt1',
      sampledAt: '2026-01-10T08:00:00.000Z',
      results: [{ markerKey: 'ast', value: 70, unit: 'U/L', refLow: null, refHigh: 50 }],
    });
    trainingMock.mockResolvedValue({
      sessionsInWeek: 3,
      strengthInWeek: 0,
      sessionsInFourWeeks: 12,
    });
    const { GET } = await import('./handler');

    const body = (await (await GET({} as never, context)).json()) as { findings: AthleteFinding[] };

    expect(trainingMock).toHaveBeenCalledWith('ath1', new Date('2026-01-10T08:00:00.000Z'));
    expect(body.findings.map((finding) => finding.key)).toEqual(['transaminases_after_training']);
  });
});
