import { beforeEach, describe, expect, it, vi } from 'vitest';

const purgeSoftDeletedAthletes = vi.fn();

vi.mock('@sharpit/server/lib/cron/verify-cron-secret', () => ({ verifyCronSecret: () => true }));
vi.mock('@sharpit/server/lib/privacy/account-deletion', () => ({ purgeSoftDeletedAthletes }));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-push', () => ({
  purgeProcessedGarminPushes: () => Promise.resolve(0),
}));
vi.mock('@sharpit/server/lib/privacy/inactive-accounts', () => ({
  processInactiveAccounts: () => Promise.resolve({ notified: [], deleted: [] }),
}));

beforeEach(() => vi.clearAllMocks());

describe('GET /cron/privacy-purge', () => {
  it('answers 200 when every deletion finished', async () => {
    purgeSoftDeletedAthletes.mockResolvedValue({ purged: ['a1'], failed: [] });
    const { GET } = await import('./handler');

    const response = await GET(new Request('https://example.test/api/cron/privacy-purge'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      purgedCount: 1,
      failedErasures: [],
    });
  });

  it('answers 500 and names the stuck step when an erasure failed', async () => {
    purgeSoftDeletedAthletes.mockResolvedValue({
      purged: [],
      failed: [{ athleteId: 'a1', step: 'clerk-identity' }],
    });
    const { GET } = await import('./handler');

    const response = await GET(new Request('https://example.test/api/cron/privacy-purge'));

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      failedErasures: [{ athleteId: 'a1', step: 'clerk-identity' }],
    });
  });
});
