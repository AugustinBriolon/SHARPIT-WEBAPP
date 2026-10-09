import { describe, expect, it, vi, beforeEach } from 'vitest';

const findUniqueMock = vi.fn();
const aggregateMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
    aiUsageEvent: {
      aggregate: (...args: unknown[]) => aggregateMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

async function importModule() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  return await import('./ai-budget');
}

describe('ensureFreeAiBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('bypasses the Free budget entirely in local development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.resetModules();
    const { ensureFreeAiBudget } = await import('./ai-budget');

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status).toEqual({
      allowed: true,
      isPro: true,
      warning: false,
      retryAfterSeconds: null,
    });
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it('allows a Pro athlete under the soft daily ceiling', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    findUniqueMock.mockResolvedValue({ tier: 'PRO' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 100_000 } });
    const { ensureFreeAiBudget } = await import('./ai-budget');

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status).toEqual({ allowed: true, isPro: true, warning: false, retryAfterSeconds: null });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('blocks a Pro athlete once the soft daily ceiling is spent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    findUniqueMock.mockResolvedValue({ tier: 'PRO' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 600_000 } });
    const oldestEventAt = new Date(Date.now() - 20 * 60 * 60 * 1000);
    findManyMock.mockResolvedValue([
      { createdAt: oldestEventAt, totalTokens: 550_000 },
      { createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), totalTokens: 50_000 },
    ]);
    const { ensureFreeAiBudget } = await import('./ai-budget');

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status.allowed).toBe(false);
    expect(status.isPro).toBe(true);
    expect(status.retryAfterSeconds).toBeGreaterThan(3 * 60 * 60);
  });

  it('allows a FREE athlete under the rolling 24h budget', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 10_000 } });
    const { ensureFreeAiBudget } = await importModule();

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status).toEqual({
      allowed: true,
      isPro: false,
      warning: false,
      retryAfterSeconds: null,
    });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('blocks a FREE athlete once the rolling 24h budget is spent, with a real wait time', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 150_000 } });
    // Oldest event alone tips the athlete under budget once it ages out — that
    // event's own timestamp + 24h is when the athlete can spend again.
    const oldestEventAt = new Date(Date.now() - 20 * 60 * 60 * 1000); // 20h ago
    findManyMock.mockResolvedValue([
      { createdAt: oldestEventAt, totalTokens: 110_000 },
      { createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000), totalTokens: 40_000 },
    ]);
    const { ensureFreeAiBudget } = await importModule();

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status.allowed).toBe(false);
    expect(status.warning).toBe(false);
    // ~4h left before the oldest event ages past the 24h window (20h old now).
    expect(status.retryAfterSeconds).toBeGreaterThan(3 * 60 * 60);
    expect(status.retryAfterSeconds).toBeLessThanOrEqual(4 * 60 * 60 + 5);
  });

  it('treats a missing profile as FREE with no usage yet', async () => {
    findUniqueMock.mockResolvedValue(null);
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: null } });
    const { ensureFreeAiBudget } = await importModule();

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status).toEqual({
      allowed: true,
      isPro: false,
      warning: false,
      retryAfterSeconds: null,
    });
  });

  it('warns a FREE athlete who is still allowed but close to the rolling budget', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 42_000 } });
    const { ensureFreeAiBudget } = await importModule();

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status).toEqual({ allowed: true, isPro: false, warning: true, retryAfterSeconds: null });
  });

  it('warns a Pro athlete approaching the soft daily ceiling', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'PRO' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 420_000 } });
    const { ensureFreeAiBudget } = await importModule();

    const status = await ensureFreeAiBudget('athlete-1');

    expect(status).toEqual({ allowed: true, isPro: true, warning: true, retryAfterSeconds: null });
  });

  it('queries a rolling 24h window, not a calendar-day reset', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 0 } });
    const { ensureFreeAiBudget } = await importModule();

    const before = Date.now();
    await ensureFreeAiBudget('athlete-1');
    const after = Date.now();

    const call = aggregateMock.mock.calls[0][0] as { where: { createdAt: { gte: Date } } };
    const gteMs = call.where.createdAt.gte.getTime();
    // "24h ago" relative to the call, not midnight — bounded by the call's own timing window.
    expect(gteMs).toBeGreaterThanOrEqual(before - 24 * 60 * 60 * 1000);
    expect(gteMs).toBeLessThanOrEqual(after - 24 * 60 * 60 * 1000);
  });

  it('only sums coach usage — narrative analysis has its own separate gate and must not count here', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE' });
    aggregateMock.mockResolvedValue({ _sum: { totalTokens: 1_000 } });
    const { ensureFreeAiBudget } = await importModule();

    await ensureFreeAiBudget('athlete-1');

    expect(aggregateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ feature: 'coach' }),
      }),
    );
  });
});
