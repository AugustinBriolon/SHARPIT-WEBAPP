import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRecentGoalAchievements,
  recordRaceResult,
  withRaceStanding,
} from '@sharpit/server/lib/goals/goal-achievements';
import { prisma } from '@sharpit/db/client';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    goalAchievement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    goal: { updateMany: vi.fn() },
    activity: { findMany: vi.fn() },
  },
}));

describe('getRecentGoalAchievements', () => {
  beforeEach(() => {
    vi.mocked(prisma.goalAchievement.findMany).mockResolvedValue([]);
  });

  it('scopes achievements to the current athlete', async () => {
    await getRecentGoalAchievements('athlete-demo', 15);

    expect(prisma.goalAchievement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { goal: { athleteId: 'athlete-demo' } },
        take: 15,
      }),
    );
  });
});

describe('recordRaceResult', () => {
  const race = { id: 'goal-1', kind: 'RACE' };
  const activity = { id: 'tri', duration: 9000 };

  beforeEach(() => {
    vi.mocked(prisma.goalAchievement.upsert).mockClear();
  });

  it('refreshes the value and activity of the result on update', async () => {
    vi.mocked(prisma.goalAchievement.findUnique).mockResolvedValue({ activityId: 'tri' } as never);

    await recordRaceResult(race, activity, 'auto');

    expect(prisma.goalAchievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { source: 'auto', value: 9000, activityId: 'tri' },
      }),
    );
  });

  it('never lets an automatic link take over a result on another activity', async () => {
    vi.mocked(prisma.goalAchievement.findUnique).mockResolvedValue({
      activityId: 'other',
    } as never);

    await recordRaceResult(race, activity, 'auto');

    expect(prisma.goalAchievement.upsert).not.toHaveBeenCalled();
  });

  it('lets a manual link replace it, and ignores non-race goals', async () => {
    await recordRaceResult(race, activity, 'manual');
    await recordRaceResult({ id: 'g', kind: 'METRIC' }, activity, 'manual');

    expect(prisma.goalAchievement.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('recordRaceResult — reaching the race', () => {
  const activity = { id: 'tri', duration: 20403 };

  beforeEach(() => {
    vi.mocked(prisma.goal.updateMany).mockClear();
    vi.mocked(prisma.goalAchievement.findUnique).mockResolvedValue(null);
  });

  it('marks a race reached once its day has come, never touching one already reached', async () => {
    const past = { id: 'goal-1', kind: 'RACE', targetDate: new Date('2026-01-11T00:00:00Z') };

    await recordRaceResult(past, activity, 'auto');

    expect(prisma.goal.updateMany).toHaveBeenCalledWith({
      where: { id: 'goal-1', achieved: false },
      data: { achieved: true },
    });
  });

  it('leaves a race ahead in progress when a session is linked to it', async () => {
    const ahead = { id: 'goal-1', kind: 'RACE', targetDate: new Date('2999-01-01T00:00:00Z') };

    await recordRaceResult(ahead, activity, 'manual');

    expect(prisma.goal.updateMany).not.toHaveBeenCalled();
  });
});

describe('withRaceStanding', () => {
  it('reads a past race with a linked activity as done, with its time', async () => {
    vi.mocked(prisma.activity.findMany).mockResolvedValue([
      { id: 'tri', title: 'Half', duration: 20403, goalId: 'goal-1' },
    ] as never);
    const goal = {
      id: 'goal-1',
      kind: 'RACE',
      targetDate: new Date('2026-01-11T00:00:00Z'),
      achieved: false,
    };

    const [standing] = await withRaceStanding('athlete', [goal as never]);

    expect(standing).toMatchObject({
      status: 'done',
      result: { activityId: 'tri', durationSec: 20403 },
    });
  });
});
