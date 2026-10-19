import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './handler';
import * as cronSecretModule from '@sharpit/server/lib/cron/verify-cron-secret';
import * as horizonModule from '@sharpit/server/lib/coach/plan/plan-horizon';

vi.mock('@sharpit/server/lib/cron/verify-cron-secret', () => ({
  verifyCronSecret: vi.fn(),
}));

vi.mock('@sharpit/server/lib/coach/plan/plan-horizon', () => ({
  runPlanHorizon: vi.fn(),
}));

describe('GET /api/cron/plan-horizon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a call without the cron secret', async () => {
    vi.mocked(cronSecretModule.verifyCronSecret).mockReturnValueOnce(false);
    const res = await GET(new Request('https://api.sharpit.app/api/cron/plan-horizon'));
    expect(res.status).toBe(401);
    expect(horizonModule.runPlanHorizon).not.toHaveBeenCalled();
  });

  it('runs the daily pass and reports what it did', async () => {
    vi.mocked(cronSecretModule.verifyCronSecret).mockReturnValueOnce(true);
    vi.mocked(horizonModule.runPlanHorizon).mockResolvedValueOnce({ generate: 1, none: 2 });
    const res = await GET(new Request('https://api.sharpit.app/api/cron/plan-horizon'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, generate: 1, none: 2 });
  });
});
