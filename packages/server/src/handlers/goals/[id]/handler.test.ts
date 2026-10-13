import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const queries = vi.hoisted(() => ({
  getGoalById: vi.fn(),
  getGoalActivities: vi.fn(),
  updateGoal: vi.fn(),
  deleteGoal: vi.fn(),
}));

vi.mock('@sharpit/server/lib/queries', () => queries);
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
vi.mock('@sharpit/server/lib/goals/goal-achievements', () => ({
  recordManualGoalAchievement: vi.fn(),
  withRaceStanding: vi.fn(async (_athleteId: string, goals: object[]) =>
    goals.map((goal) => ({ ...goal, status: 'upcoming', result: null })),
  ),
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    bodyCompositionMeasurement: { findFirst: vi.fn().mockResolvedValue(null) },
    activity: { findMany: vi.fn().mockResolvedValue([]) },
    performanceRecord: { findMany: vi.fn().mockResolvedValue([]) },
    plannedSession: { findMany: vi.fn().mockResolvedValue([]) },
    goalProjectionSnapshot: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
    },
    goal: { update: vi.fn() },
  },
}));

import { GET } from './handler';

const context = { params: Promise.resolve({ id: 'goal-1' }) };

describe('GET /api/v1/goals/[id] — race projection contract', () => {
  beforeEach(() => {
    queries.getGoalActivities.mockResolvedValue([]);
    queries.getGoalById.mockResolvedValue({
      id: 'goal-1',
      kind: 'RACE',
      title: 'Semi de Paris',
      raceFormat: 'Semi',
      targetPerformance: '1:45:00',
      targetDate: new Date('2099-03-01T00:00:00Z'),
      frozenProjection: null,
      frozenProjectionAt: null,
    });
  });

  it('returns the projection shape iOS reads', async () => {
    const response = await GET(new NextRequest('http://localhost/api/v1/goals/goal-1'), context);
    const body = await response.json();

    expect(body.projection).toEqual({
      finishSec: expect.any(Number),
      todaySec: body.projection.finishSec,
      regularity: null,
      trend: { secPerWeek: null },
      history: [
        {
          weekKey: expect.any(String),
          date: expect.any(String),
          finishSec: body.projection.finishSec,
        },
      ],
      lowSec: expect.any(Number),
      highSec: expect.any(Number),
      targetSec: 6300,
      deltaSec: body.projection.finishSec - 6300,
      legs: [{ kind: 'run', sec: body.projection.finishSec, source: 'default' }],
      confidence: 'low',
      missing: [expect.stringContaining('allure seuil')],
      frozenAt: null,
    });
    expect(body).not.toHaveProperty('frozenProjection');
    expect(body).toMatchObject({ status: 'upcoming', activities: [] });
  });
});
