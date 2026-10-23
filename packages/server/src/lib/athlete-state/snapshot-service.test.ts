import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';

vi.mock('@sharpit/server/infrastructure/athlete-state/snapshot-repository', () => ({
  getLatestAthleteSnapshot: vi.fn(),
  getSnapshotByFingerprint: vi.fn(),
  saveAthleteSnapshot: vi.fn(),
}));
vi.mock('@sharpit/server/lib/briefing/daily-briefing', () => ({
  getDailyBriefing: vi.fn().mockResolvedValue(null),
}));
vi.mock('@sharpit/server/lib/today/navigation/today-state-server', () => ({
  loadTodayState: vi.fn(),
}));
vi.mock('@sharpit/server/lib/athlete-state/freshness-service', () => ({
  computeFreshnessSnapshot: vi.fn(),
}));
vi.mock('@sharpit/server/lib/athlete-state/snapshot-builder', () => ({
  buildAthleteSnapshot: vi.fn(),
}));
vi.mock('@sharpit/db/client', () => ({ prisma: {} }));

import { getLatestAthleteSnapshot } from '@sharpit/server/infrastructure/athlete-state/snapshot-repository';
import { todayIsoDate } from '@sharpit/app/lib/health/activity-status';
import { getOrBuildAthleteSnapshot } from './snapshot-service';

/** A snapshot read hours after it was written, in a phase that ages after 90 minutes. */
function agedSnapshot(trainingDayId: string): AthleteSnapshot {
  return {
    trainingDayId,
    generatedAt: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
    adviceActionable: true,
    briefing: null,
    dailyPhase: { phase: 'MORNING' },
    phaseNarrative: { posture: 'steady', heroHeadline: 'Une journée posée', heroSubline: '' },
  } as unknown as AthleteSnapshot;
}

describe('getOrBuildAthleteSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads a settled day as it was kept, however old the snapshot', async () => {
    const kept = agedSnapshot('2026-05-02');
    vi.mocked(getLatestAthleteSnapshot).mockResolvedValue(kept);

    await expect(getOrBuildAthleteSnapshot('athlete-1', '2026-05-02')).resolves.toBe(kept);
    expect(getLatestAthleteSnapshot).toHaveBeenCalledTimes(1);
  });

  it('rebuilds today once its phase has aged', async () => {
    const today = todayIsoDate();
    vi.mocked(getLatestAthleteSnapshot).mockResolvedValue(agedSnapshot(today));

    // The rebuild reads the snapshot again before anything else; failing there proves it ran.
    vi.mocked(getLatestAthleteSnapshot).mockResolvedValueOnce(agedSnapshot(today));
    vi.mocked(getLatestAthleteSnapshot).mockRejectedValueOnce(new Error('rebuilt'));

    await expect(getOrBuildAthleteSnapshot('athlete-1', today)).rejects.toThrow('rebuilt');
  });
});
