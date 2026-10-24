/**
 * What the AI costs per athlete, in US dollars (ADR-103). Prices are the Vercel AI Gateway's list
 * prices per token, read from https://ai-gateway.vercel.sh/v1/models on 2026-10-24; update them
 * when a model or a price changes. An unknown model is priced as the dearest one known, so the
 * figure errs high rather than low.
 */
type TokenPrices = { input: number; output: number; cacheRead: number };

export const AI_TOKEN_PRICES_USD: Record<string, TokenPrices> = {
  'google/gemini-3-flash': { input: 0.0000005, output: 0.000003, cacheRead: 0.00000005 },
  'anthropic/claude-haiku-4.5': { input: 0.000001, output: 0.000005, cacheRead: 0.0000001 },
  'openai/gpt-5-mini': { input: 0.00000025, output: 0.000002, cacheRead: 0.000000025 },
};

const DEAREST = AI_TOKEN_PRICES_USD['anthropic/claude-haiku-4.5']!;

export type AiUsageTotals = {
  model: string | null;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
};

/** A stored model id with or without its provider (`gemini-3-flash` or `google/gemini-3-flash`). */
function pricesFor(model: string | null): TokenPrices {
  if (!model) {
    return DEAREST;
  }
  const known = Object.entries(AI_TOKEN_PRICES_USD).find(
    ([id]) => id === model || id.endsWith(`/${model}`),
  );
  return known?.[1] ?? DEAREST;
}

/** Cache hits are part of the input tokens, billed at the cache price. */
export function aiCostUsd(usage: AiUsageTotals): number {
  const prices = pricesFor(usage.model);
  const cacheRead = Math.min(usage.cacheReadTokens, usage.inputTokens);
  return (
    (usage.inputTokens - cacheRead) * prices.input +
    cacheRead * prices.cacheRead +
    usage.outputTokens * prices.output
  );
}

export type AthleteAiCost = {
  /** Over the window, every feature. */
  totalUsd: number;
  /** The share the athlete asked for (the coach), the rest being written for them. */
  coachUsd: number;
};

export function athleteAiCost(rows: AiUsageTotals[]): AthleteAiCost {
  return rows.reduce(
    (cost, row) => {
      const usd = aiCostUsd(row);
      return {
        totalUsd: cost.totalUsd + usd,
        coachUsd: cost.coachUsd + (row.feature === 'coach' ? usd : 0),
      };
    },
    { totalUsd: 0, coachUsd: 0 },
  );
}
