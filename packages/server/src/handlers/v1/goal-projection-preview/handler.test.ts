import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
const prisma = vi.hoisted(() => ({
  athleteProfile: { findUnique: vi.fn().mockResolvedValue(null) },
  bodyCompositionMeasurement: { findFirst: vi.fn().mockResolvedValue(null) },
  activity: { findMany: vi.fn().mockResolvedValue([]) },
  performanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
  plannedSession: { findMany: vi.fn().mockResolvedValue([]) },
  goalProjectionSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
  goal: { update: vi.fn() },
}));
vi.mock('@sharpit/db/client', () => ({ prisma }));

import { POST } from './handler';

function preview(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/v1/goals/projection-preview', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /api/v1/goals/projection-preview', () => {
  it('returns the projection, a verdict and the bounds without writing', async () => {
    const response = await preview({
      discipline: 'RUN',
      formatKey: 'RUN_10K',
      targetSeconds: 1500,
      targetDate: '2099-03-01',
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      projection: { targetSec: 1500, legs: [{ kind: 'run' }], history: [] },
      verdict: 'ambitious',
      verdictLabel: 'Ambitieux au vu de ta forme actuelle',
      targetBounds: { minSec: expect.any(Number), maxSec: expect.any(Number) },
    });
    expect(prisma.goalProjectionSnapshot.upsert).not.toHaveBeenCalled();
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('answers 422 for a format the discipline does not have', async () => {
    expect((await preview({ discipline: 'BIKE', formatKey: 'RUN_10K' })).status).toBe(422);
  });
});
