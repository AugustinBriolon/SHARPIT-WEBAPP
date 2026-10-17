import { prisma } from '@sharpit/db/client';

/** `coach` is what the athlete asks for and counts against their budget; `analysis` and
 * `briefing` are written for them in the background and have their own ledgers. */
export type AiUsageFeature = 'coach' | 'analysis' | 'briefing';

export type AiUsageTokens = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  /** Prompt-cache hits (gateway / provider). Same answer; cheaper input. */
  inputTokenDetails?: { cacheReadTokens?: number | null } | null;
  /** Model id that served this call, when the caller knows it. */
  model?: string | null;
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
  const cacheReadTokens = usage?.inputTokenDetails?.cacheReadTokens ?? null;
  const model = usage?.model ?? null;
  const input = inputTokens ?? 0;
  const cacheRead = cacheReadTokens ?? 0;

  // Structured for log drains; columns below for SQL FinOps.
  console.info('[ai-usage]', {
    athleteId,
    feature,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: cacheRead,
    cacheHitRatio: input > 0 ? Math.round((cacheRead / input) * 1000) / 1000 : null,
  });

  try {
    await prisma.aiUsageEvent.create({
      data: {
        athleteId,
        feature,
        inputTokens,
        outputTokens,
        totalTokens,
        cacheReadTokens,
        model,
      },
    });
  } catch (error) {
    console.error('[ai-usage] failed to record usage:', error);
  }
}
