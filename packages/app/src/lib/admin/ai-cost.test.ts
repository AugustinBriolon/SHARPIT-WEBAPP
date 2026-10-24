import { describe, expect, it } from 'vitest';
import { aiCostUsd, athleteAiCost } from './ai-cost';

const usage = (model: string | null, feature = 'coach') => ({
  model,
  feature,
  inputTokens: 10_000,
  outputTokens: 1_000,
  cacheReadTokens: 4_000,
});

describe('aiCostUsd', () => {
  it('bills cache hits at the cache price and the rest at list price', () => {
    // 6 000 × 0.5 µ$ + 4 000 × 0.05 µ$ + 1 000 × 3 µ$ = 0.003 + 0.0002 + 0.003
    expect(aiCostUsd(usage('google/gemini-3-flash'))).toBeCloseTo(0.0062, 6);
  });

  it('finds a model stored without its provider', () => {
    expect(aiCostUsd(usage('gemini-3-flash'))).toBeCloseTo(0.0062, 6);
  });

  it('prices an unknown model as the dearest one, so the figure errs high', () => {
    expect(aiCostUsd(usage('some/new-model'))).toBeCloseTo(
      aiCostUsd(usage('anthropic/claude-haiku-4.5')),
      9,
    );
    expect(aiCostUsd(usage(null))).toBeCloseTo(aiCostUsd(usage('anthropic/claude-haiku-4.5')), 9);
  });
});

describe('athleteAiCost', () => {
  it('splits what the coach cost from what was written in the background', () => {
    const cost = athleteAiCost([
      usage('google/gemini-3-flash'),
      usage('google/gemini-3-flash', 'analysis'),
    ]);
    expect(cost.totalUsd).toBeCloseTo(0.0124, 6);
    expect(cost.coachUsd).toBeCloseTo(0.0062, 6);
  });
});
