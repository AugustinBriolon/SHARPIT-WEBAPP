import { afterEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn().mockResolvedValue(undefined);

vi.mock('@sharpit/db/client', () => ({
  prisma: { aiUsageEvent: { create } },
}));

describe('recordAiUsage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('persists tokens and logs cache hit ratio without failing the caller', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { recordAiUsage } = await import('./usage');

    await recordAiUsage('athlete-1', 'coach', {
      inputTokens: 1000,
      outputTokens: 200,
      totalTokens: 1200,
      inputTokenDetails: { cacheReadTokens: 800 },
      model: 'google/gemini-3-flash',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        athleteId: 'athlete-1',
        feature: 'coach',
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        cacheReadTokens: 800,
        model: 'google/gemini-3-flash',
      },
    });
    expect(info).toHaveBeenCalledWith(
      '[ai-usage]',
      expect.objectContaining({
        athleteId: 'athlete-1',
        model: 'google/gemini-3-flash',
        cacheReadTokens: 800,
        cacheHitRatio: 0.8,
      }),
    );
  });
});
