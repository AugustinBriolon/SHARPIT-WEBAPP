import { beforeEach, describe, expect, it, vi } from 'vitest';
import { baseProposal, decisionState, physicalHealthData } from './test-fixtures';

const googleSync = vi.hoisted(() => ({
  getGoogleAccount: vi.fn(),
  getUpcomingBusy: vi.fn(),
}));

const prefsStore = vi.hoisted(() => ({
  loadResolvedSourcePrefs: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => googleSync);
vi.mock('@sharpit/server/lib/integrations/source-prefs-store', () => prefsStore);
vi.mock('@sharpit/server/lib/athlete-state/snapshot-service', () => ({
  getOrBuildAthleteSnapshot: vi.fn().mockResolvedValue({
    snapshotId: 'snap-gate',
    confidence: 0.8,
    decision: decisionState(),
    physicalHealth: physicalHealthData(),
    fatigue: { trainingCapacity: 'FULL' },
  }),
}));
vi.mock('@sharpit/server/lib/training/pmc/pmc-server', () => ({
  loadDailyTrainingStressEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock('@sharpit/server/lib/queries', () => ({
  getPlannedSessions: vi.fn().mockResolvedValue([]),
  getGoalById: vi.fn().mockResolvedValue(null),
  getActiveTrainingPlan: vi.fn().mockResolvedValue(null),
  getAthleteProfile: vi.fn().mockResolvedValue(null),
  getTrainingZoneNotes: vi.fn().mockResolvedValue([]),
}));

import { buildGateContext } from './build-context';

describe('buildGateContext busyBlocks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads busy via getUpcomingBusy when Apple calendar is enabled without Google OAuth', async () => {
    googleSync.getGoogleAccount.mockResolvedValue(null);
    prefsStore.loadResolvedSourcePrefs.mockResolvedValue({
      version: 1,
      classes: {
        calendar: { primary: 'apple-calendar', enabled: ['apple-calendar'] },
      },
    });
    const busy = [{ dayKey: '2026-07-17', start: '09:00', end: '10:00' }];
    googleSync.getUpcomingBusy.mockResolvedValue(busy);

    const { context } = await buildGateContext({
      athleteId: 'ath-1',
      trainingDayId: '2026-07-15',
      proposals: [baseProposal()],
    });

    expect(context.busyBlocks).toEqual(busy);
    expect(googleSync.getUpcomingBusy).toHaveBeenCalledWith('ath-1', 8);
  });
});
