import { describe, expect, it, vi, beforeEach } from 'vitest';

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

  it('syncs distinct providers concurrently and isolates failures', async () => {
    const { getWithingsAccount, syncWithingsHealth } =
      await import('@sharpit/server/lib/integrations/withings/withings-sync');
    const { getStravaAccount, syncStravaActivities } =
      await import('@sharpit/server/lib/integrations/strava/strava-sync');
    const { syncProviders } = await import('@sharpit/server/lib/athlete-state/sync-providers');

    let stravaStartedWhileWithingsPending = false;
    let resolveWithings!: () => void;
    const withingsGate = new Promise<void>((r) => {
      resolveWithings = r;
    });

    vi.mocked(getWithingsAccount).mockResolvedValue({ id: 'default' } as never);
    vi.mocked(syncWithingsHealth).mockImplementation(async () => {
      await withingsGate;
      return { days: 0, updated: 0, imported: 0 };
    });

    vi.mocked(getStravaAccount).mockResolvedValue({ id: 'default' } as never);
    vi.mocked(syncStravaActivities).mockImplementation(async () => {
      stravaStartedWhileWithingsPending = true;
      resolveWithings();
      throw new Error('strava down');
    });

    const results = await syncProviders('default', ['withings', 'strava']);

    expect(stravaStartedWhileWithingsPending).toBe(true);
    expect(results.map((r) => r.provider)).toEqual(['withings']);
  });
});
