import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './handler';
import * as cronSecretModule from '@sharpit/server/lib/cron/verify-cron-secret';
import * as seedModule from '@sharpit/server/lib/demo/seed-demo-data';

const findUnique = vi.hoisted(() => vi.fn());

vi.mock('@sharpit/server/lib/cron/verify-cron-secret', () => ({ verifyCronSecret: vi.fn() }));
vi.mock('@sharpit/db/client', () => ({ prisma: { athleteProfile: { findUnique } } }));
vi.mock('@sharpit/server/lib/demo/seed-demo-data', () => ({
  seedDemoAthlete: vi.fn(),
  refreshReviewAthleteHistory: vi.fn(),
}));

const call = () => GET(new Request('https://api.sharpit.app/api/cron/demo-reseed'));

describe('GET /api/cron/demo-reseed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cronSecretModule.verifyCronSecret).mockReturnValue(true);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses a call without the cron secret', async () => {
    vi.mocked(cronSecretModule.verifyCronSecret).mockReturnValueOnce(false);
    expect((await call()).status).toBe(401);
    expect(seedModule.seedDemoAthlete).not.toHaveBeenCalled();
  });

  it('reseeds the demo and leaves the review account alone when none is named', async () => {
    const res = await call();
    expect(await res.json()).toEqual({ ok: true, review: 'skipped' });
    expect(seedModule.seedDemoAthlete).toHaveBeenCalled();
    expect(seedModule.refreshReviewAthleteHistory).not.toHaveBeenCalled();
  });

  it('moves the named review account to today', async () => {
    vi.stubEnv('REVIEW_CLERK_USER_ID', 'user_review');
    findUnique.mockResolvedValueOnce({ id: 'athlete-review' });
    const res = await call();
    expect(await res.json()).toEqual({ ok: true, review: 'refreshed' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { clerkUserId: 'user_review' },
      select: { id: true },
    });
    expect(seedModule.refreshReviewAthleteHistory).toHaveBeenCalledWith(
      expect.anything(),
      'athlete-review',
    );
  });

  it('still answers ok when the review refresh refuses the athlete', async () => {
    vi.stubEnv('REVIEW_CLERK_USER_ID', 'user_review');
    findUnique.mockResolvedValueOnce({ id: 'athlete-review' });
    vi.mocked(seedModule.refreshReviewAthleteHistory).mockRejectedValueOnce(
      new Error('not a review account'),
    );
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, review: 'failed' });
  });
});
