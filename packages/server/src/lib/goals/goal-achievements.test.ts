import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRecentGoalAchievements,
  recordRaceResult,
} from '@sharpit/server/lib/goals/goal-achievements';
import { prisma } from '@sharpit/db/client';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    goalAchievement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
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
