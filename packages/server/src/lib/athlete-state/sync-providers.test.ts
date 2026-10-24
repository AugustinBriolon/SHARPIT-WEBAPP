import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@sharpit/server/lib/integrations/garmin/garmin-activity-sync', () => ({
  syncGarminActivities: vi.fn(),
}));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-sync', () => ({
  getGarminAccount: vi.fn(),
  syncGarminHealth: vi.fn(),
  GARMIN_HEALTH_OPEN_PATH_FALLBACK_DAYS: 14,
}));
vi.mock('@sharpit/server/lib/integrations/strava/strava-sync', () => ({
  getStravaAccount: vi.fn(),
  syncStravaActivities: vi.fn(),
}));
vi.mock('@sharpit/server/lib/integrations/renpho/renpho-sync', () => ({
  getRenphoAccount: vi.fn().mockResolvedValue(null),
  syncRenphoHealth: vi.fn(),
}));
vi.mock('@sharpit/server/lib/integrations/withings/withings-sync', () => ({
  getWithingsAccount: vi.fn().mockResolvedValue(null),
  syncWithingsHealth: vi.fn(),
}));
vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => ({
  getGoogleAccount: vi.fn().mockResolvedValue(null),
  syncFromGoogle: vi.fn(),
}));

describe('syncProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs garmin health and activities in parallel', async () => {
    const { getGarminAccount, syncGarminHealth } =
      await import('@sharpit/server/lib/integrations/garmin/garmin-sync');
    const { syncGarminActivities } =
      await import('@sharpit/server/lib/integrations/garmin/garmin-activity-sync');
    const { syncProviders } = await import('@sharpit/server/lib/athlete-state/sync-providers');

    let healthStarted = false;
    let activitiesStartedWhileHealthPending = false;
    let resolveHealth!: () => void;
    const healthDone = new Promise<void>((r) => {
      resolveHealth = r;
    });

    vi.mocked(getGarminAccount).mockResolvedValue({ id: 'default' } as never);
    vi.mocked(syncGarminHealth).mockImplementation(async () => {
      healthStarted = true;
      await healthDone;
      return { days: 1, updated: 1, emptyDays: 0, observationsBackfilled: 0 };
    });
    vi.mocked(syncGarminActivities).mockImplementation(async () => {
      // If health has started but not finished, we are truly parallel.
      activitiesStartedWhileHealthPending = healthStarted;
      resolveHealth();
      return {
        fetched: 1,
        imported: 1,
        updated: 0,
        merged: 0,
        skipped: 0,
        importedActivityIds: ['a1'],
        importedTypes: [],
        changedTypes: [],
        changedActivityIds: [],
      };
    });

    const results = await syncProviders('default', ['garmin']);

    expect(activitiesStartedWhileHealthPending).toBe(true);
    expect(syncGarminHealth).toHaveBeenCalledWith('default', { days: 14 });
    expect(results).toHaveLength(1);
    expect(results[0]?.activityIds).toEqual(['a1']);
    expect(results[0]?.observationCount).toBe(1);
  });

  it('syncs distinct providers concurrently and isolates failures', async () => {
    const { getGarminAccount, syncGarminHealth } =
      await import('@sharpit/server/lib/integrations/garmin/garmin-sync');
    const { syncGarminActivities } =
      await import('@sharpit/server/lib/integrations/garmin/garmin-activity-sync');
    const { getStravaAccount, syncStravaActivities } =
      await import('@sharpit/server/lib/integrations/strava/strava-sync');
    const { syncProviders } = await import('@sharpit/server/lib/athlete-state/sync-providers');

    let stravaStartedWhileGarminPending = false;
    let resolveGarmin!: () => void;
    const garminGate = new Promise<void>((r) => {
      resolveGarmin = r;
    });

    vi.mocked(getGarminAccount).mockResolvedValue({ id: 'default' } as never);
    vi.mocked(syncGarminHealth).mockImplementation(async () => {
      await garminGate;
      return { days: 0, updated: 0, emptyDays: 0, observationsBackfilled: 0 };
    });
    vi.mocked(syncGarminActivities).mockImplementation(async () => {
      await garminGate;
      return {
        fetched: 0,
        imported: 0,
        updated: 0,
        merged: 0,
        skipped: 0,
        importedActivityIds: [],
        importedTypes: [],
        changedTypes: [],
        changedActivityIds: [],
      };
    });

    vi.mocked(getStravaAccount).mockResolvedValue({ id: 'default' } as never);
    vi.mocked(syncStravaActivities).mockImplementation(async () => {
      stravaStartedWhileGarminPending = true;
      resolveGarmin();
      throw new Error('strava down');
    });

    const results = await syncProviders('default', ['garmin', 'strava']);

    expect(stravaStartedWhileGarminPending).toBe(true);
    expect(results.map((r) => r.provider)).toEqual(['garmin']);
  });
});
