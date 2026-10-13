import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { withRaceProjection } from '@sharpit/server/lib/goals/race-projection';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: { findUnique: vi.fn() },
    bodyCompositionMeasurement: { findFirst: vi.fn() },
    activity: { findMany: vi.fn(), findFirst: vi.fn() },
    performanceRecord: { findMany: vi.fn() },
    plannedSession: { findMany: vi.fn() },
    goalProjectionSnapshot: { findMany: vi.fn(), upsert: vi.fn() },
    goal: { update: vi.fn() },
  },
}));

const NOW = new Date('2026-10-13T08:00:00Z');

function race(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'half',
    kind: 'RACE',
    title: 'Half IronMan Versailles',
    raceFormat: 'HALF IRON MAN',
    targetPerformance: 'Sub 6h',
    targetDate: new Date('2026-11-20T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    frozenProjection: null,
    frozenProjectionAt: null,
    ...overrides,
  } as Goal;
}

function snapshot(weekKey: string, finishSec: number, day: string) {
  const at = new Date(`${day}T06:00:00Z`);
  return { goalId: 'half', weekKey, finishSec, createdAt: at, payload: null, computedAt: at };
}

describe('withRaceProjection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValue({
      swimCssSecPer100m: 108,
      runThresholdPaceSecPerKm: 334,
      ftpW: 200,
    } as never);
    vi.mocked(prisma.bodyCompositionMeasurement.findFirst).mockResolvedValue({
      weightKg: 81.2,
    } as never);
    vi.mocked(prisma.activity.findMany).mockResolvedValue([]);
    vi.mocked(prisma.performanceRecord.findMany).mockResolvedValue([]);
    vi.mocked(prisma.plannedSession.findMany).mockResolvedValue([]);
    vi.mocked(prisma.goalProjectionSnapshot.findMany).mockResolvedValue([]);
  });

  it("stores this week's projection and returns the history oldest first", async () => {
    vi.mocked(prisma.goalProjectionSnapshot.findMany).mockResolvedValue([
      snapshot('2026-W41', 20_500, '2026-10-06'),
      snapshot('2026-W40', 21_000, '2026-09-29'),
    ] as never);
    const [goal] = await withRaceProjection('athlete', [race()], NOW);

    expect(prisma.goalProjectionSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { goalId_weekKey: { goalId: 'half', weekKey: '2026-W42' } },
        create: expect.objectContaining({
          payload: expect.objectContaining({ targetSec: 21_600 }),
        }),
      }),
    );
    expect(goal.projection?.history.map((point) => point.weekKey)).toEqual([
      '2026-W40',
      '2026-W41',
      '2026-W42',
    ]);
    expect(goal.projection).toMatchObject({ trend: { secPerWeek: null }, regularity: null });
  });

  it("serves this week's stored projection while no activity changed since", async () => {
    vi.mocked(prisma.goalProjectionSnapshot.findMany).mockResolvedValue([
      { ...snapshot('2026-W42', 20_500, '2026-10-12'), payload: { finishSec: 20_500, legs: [] } },
    ] as never);
    vi.mocked(prisma.activity.findFirst).mockResolvedValue({
      updatedAt: new Date('2026-10-11T00:00:00Z'),
    } as never);
    const [goal] = await withRaceProjection('athlete', [race()], NOW);

    expect(goal.projection).toMatchObject({ finishSec: 20_500 });
    expect(goal.projection?.history).toHaveLength(1);
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
    expect(prisma.goalProjectionSnapshot.upsert).not.toHaveBeenCalled();
  });

  it('recomputes when an activity changed after the stored projection', async () => {
    vi.mocked(prisma.goalProjectionSnapshot.findMany).mockResolvedValue([
      { ...snapshot('2026-W42', 20_500, '2026-10-12'), payload: { finishSec: 20_500, legs: [] } },
    ] as never);
    vi.mocked(prisma.activity.findFirst).mockResolvedValue({
      updatedAt: new Date('2026-10-13T07:00:00Z'),
    } as never);
    const [goal] = await withRaceProjection('athlete', [race()], NOW);

    expect(goal.projection?.finishSec).not.toBe(20_500);
    expect(prisma.goalProjectionSnapshot.upsert).toHaveBeenCalledTimes(1);
    expect(goal.projection?.history).toHaveLength(1);
  });

  it('adds a live projection to an upcoming race, without exposing the stored columns', async () => {
    const [goal] = await withRaceProjection('athlete', [race()], NOW);

    expect(goal.projection).toMatchObject({ targetSec: 21_600, frozenAt: null });
    expect(goal.projection?.legs.map((leg) => leg.kind)).toEqual([
      'swim',
      't1',
      'bike',
      't2',
      'run',
    ]);
    expect(goal).not.toHaveProperty('frozenProjection');
    expect(prisma.goal.update).not.toHaveBeenCalled();
  });

  it('freezes the projection from the eve of the race, with evidence cut at race day', async () => {
    const [goal] = await withRaceProjection(
      'athlete',
      [race({ targetDate: new Date('2026-10-11T00:00:00Z') })],
      NOW,
    );

    expect(prisma.goal.update).toHaveBeenCalledWith({
      where: { id: 'half' },
      data: expect.objectContaining({ frozenProjectionAt: expect.any(Date) }),
    });
    expect(goal.projection?.frozenAt).toEqual(expect.any(String));
  });

  it('exposes the frozen projection without loading anything', async () => {
    const frozen = { finishSec: 20_000, legs: [], missing: [], frozenAt: null };
    const at = new Date('2026-10-10T07:00:00Z');
    const [goal] = await withRaceProjection(
      'athlete',
      [race({ frozenProjection: frozen, frozenProjectionAt: at })],
      NOW,
    );

    expect(goal.projection).toMatchObject({ finishSec: 20_000, frozenAt: at.toISOString() });
    expect(prisma.activity.findMany).not.toHaveBeenCalled();
  });

  it('gives figure goals and unknown formats no projection, without loading anything', async () => {
    const goals = await withRaceProjection(
      'athlete',
      [
        race({ id: 'metric', kind: 'METRIC' }),
        race({ id: 'trail', raceFormat: 'Trail', title: 'Trail' }),
      ],
      NOW,
    );

    expect(goals.map((goal) => goal.projection)).toEqual([null, null]);
    expect(prisma.athleteProfile.findUnique).not.toHaveBeenCalled();
  });
});
