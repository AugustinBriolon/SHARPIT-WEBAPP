import { prisma } from '@sharpit/db/client';

export type AiUsageFeature = 'coach' | 'analysis';

export type AiUsageTokens = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  /** Prompt-cache hits (gateway / provider). Same answer; cheaper input. */
  inputTokenDetails?: { cacheReadTokens?: number | null } | null;
};

/**
 * Fire-and-forget cost visibility — not a spend cap (that's the rate limiters
 * in src/lib/rate-limit.ts). Logging must never break a real coach response,
 * so failures are swallowed here rather than propagated.
 */
export async function recordAiUsage(
  athleteId: string,
  feature: AiUsageFeature,
  usage: AiUsageTokens | undefined,
): Promise<void> {
  const inputTokens = usage?.inputTokens ?? null;
  const outputTokens = usage?.outputTokens ?? null;
  const totalTokens = usage?.totalTokens ?? null;
  const cacheReadTokens = usage?.inputTokenDetails?.cacheReadTokens ?? 0;
  const input = inputTokens ?? 0;

  // Structured for log drains / FinOps: cache hit ratio without a schema migration.
  console.info('[ai-usage]', {
    athleteId,
    feature,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheHitRatio: input > 0 ? Math.round((cacheReadTokens / input) * 1000) / 1000 : null,
  });

  try {
    await prisma.aiUsageEvent.create({
      data: {
        athleteId,
        feature,
        inputTokens,
        outputTokens,
        totalTokens,
      },
    });
  } catch (error) {
    console.error('[ai-usage] failed to record usage:', error);
  }
}
