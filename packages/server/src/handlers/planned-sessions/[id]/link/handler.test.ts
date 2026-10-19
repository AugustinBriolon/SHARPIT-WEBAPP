import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const afterCallbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => Promise<void>) => afterCallbacks.push(callback),
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-a'),
}));

vi.mock('@sharpit/server/lib/ai', () => ({ isCoachConfigured: () => true }));

vi.mock('@sharpit/server/lib/activity/detail/enrich-observed-context', () => ({
  enrichActivityObservedContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sharpit/server/lib/coach/plan/coach-analysis', () => ({
  analyzePlannedSession: vi.fn().mockResolvedValue({ score: 80 }),
}));

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));

vi.mock('@sharpit/server/lib/queries', () => ({
  getPlannedSessionById: vi.fn().mockResolvedValue({ id: 'session-1' }),
  linkPlannedSessionActivity: vi.fn().mockResolvedValue({ id: 'session-1' }),
}));

vi.mock('@sharpit/server/lib/queries/planned-sessions', () => ({
  linkPlannedSessionActivity: vi.fn(),
  setPlannedSessionAnalysis: vi.fn().mockResolvedValue(null),
}));

vi.mock('@sharpit/server/lib/analysis/analysis-run-store', () => ({
  withAnalysisRun: async (_target: unknown, work: () => Promise<void>) => {
    await work();
    return true;
  },
}));

vi.mock('@sharpit/server/lib/rate-limit', () => ({
  rateLimiters: { sessionAnalyze: 'session-analyze' },
  checkRateLimit: vi.fn(),
}));

async function linkAndRunAfter() {
  const { POST } = await import('./handler');
  const response = await POST(
    new NextRequest('http://localhost/api/planned-sessions/session-1/link', {
      method: 'POST',
      body: JSON.stringify({ activityId: 'activity-1' }),
    }),
    { params: Promise.resolve({ id: 'session-1' }) },
  );
  await Promise.all(afterCallbacks.splice(0).map((callback) => callback()));
  return response;
}

vi.mock('@sharpit/server/lib/access/is-pro-athlete', () => ({
  isProAthlete: vi.fn().mockResolvedValue(true),
}));

describe('POST /api/planned-sessions/[id]/link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
  });

  it('links but skips the AI analysis once the session-analysis limit is reached', async () => {
    const { checkRateLimit } = await import('@sharpit/server/lib/rate-limit');
    vi.mocked(checkRateLimit).mockResolvedValue({
      ok: false,
      cause: 'limited',
      retryAfterSeconds: 60,
    });
    const { analyzePlannedSession } = await import('@sharpit/server/lib/coach/plan/coach-analysis');

    const response = await linkAndRunAfter();

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledWith('session-analyze', 'athlete-a', {
      failClosed: true,
    });
    expect(analyzePlannedSession).not.toHaveBeenCalled();
  });

  it('runs the AI analysis while under the limit', async () => {
    const { checkRateLimit } = await import('@sharpit/server/lib/rate-limit');
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const { analyzePlannedSession } = await import('@sharpit/server/lib/coach/plan/coach-analysis');

    await linkAndRunAfter();

    expect(analyzePlannedSession).toHaveBeenCalledWith('athlete-a', 'session-1');
  });
});

describe('POST /api/planned-sessions/[id]/link · Pro (ADR-097)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links for a Free athlete but never asks the coach to analyse', async () => {
    const { checkRateLimit } = await import('@sharpit/server/lib/rate-limit');
    vi.mocked(checkRateLimit).mockResolvedValue({ ok: true });
    const { isProAthlete } = await import('@sharpit/server/lib/access/is-pro-athlete');
    vi.mocked(isProAthlete).mockResolvedValueOnce(false);
    const { analyzePlannedSession } = await import('@sharpit/server/lib/coach/plan/coach-analysis');

    const response = await linkAndRunAfter();

    expect(response.status).toBe(200);
    expect(analyzePlannedSession).not.toHaveBeenCalled();
  });
});
