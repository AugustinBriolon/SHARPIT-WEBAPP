import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries = vi.hoisted(() => ({
  getActivityById: vi.fn(),
  getBrickSessions: vi.fn(),
  getMultisportLegsForActivity: vi.fn(),
}));

vi.mock('@sharpit/server/lib/queries', () => queries);
vi.mock('@sharpit/server/lib/goals/goal-achievements', () => ({
  getGoalAchievementsForActivity: async () => ['goal'],
}));
vi.mock('@sharpit/server/lib/training/records/records', () => ({
  getPerformanceRecordsForActivity: async () => ['record'],
}));
vi.mock('@sharpit/server/lib/access/narrative-access', () => ({
  canGenerateNarrativeForActivity: async () => ({ isPro: false, allowed: true }),
}));
vi.mock('@sharpit/server/lib/ai', () => ({ isCoachConfigured: () => true }));
vi.mock('@sharpit/app/lib/planned-session/brick/brick-sessions', () => ({
  resolveBrickSiblingActivityLinks: (legs: unknown[]) => legs,
}));

describe('loadActivityDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is null for an activity the athlete does not own', async () => {
    queries.getActivityById.mockResolvedValue(null);
    const { loadActivityDetail } = await import('./activity-detail');
    await expect(loadActivityDetail('ath-1', 'act-1')).resolves.toBeNull();
  });

  it('loads legs only for a triathlon and siblings only for a brick', async () => {
    queries.getActivityById.mockResolvedValue({
      id: 'act-1',
      type: 'TRIATHLON',
      date: new Date(),
      plannedSession: { brickGroupId: 'brick-1' },
    });
    queries.getMultisportLegsForActivity.mockResolvedValue(['swim']);
    queries.getBrickSessions.mockResolvedValue(['leg']);
    const { loadActivityDetail } = await import('./activity-detail');

    expect(await loadActivityDetail('ath-1', 'act-1')).toMatchObject({
      multisportLegs: ['swim'],
      brickSiblings: ['leg'],
      goalValidations: ['goal'],
      performanceRecords: ['record'],
      narrativeAccess: { allowed: true },
      coachEnabled: true,
    });
  });

  it('skips legs and siblings for a plain run', async () => {
    queries.getActivityById.mockResolvedValue({
      id: 'act-2',
      type: 'RUN',
      date: new Date(),
      plannedSession: null,
    });
    const { loadActivityDetail } = await import('./activity-detail');

    expect(await loadActivityDetail('ath-1', 'act-2')).toMatchObject({
      multisportLegs: null,
      brickSiblings: [],
    });
    expect(queries.getMultisportLegsForActivity).not.toHaveBeenCalled();
    expect(queries.getBrickSessions).not.toHaveBeenCalled();
  });
});
