import { addHours, subHours } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import { hasProAccess } from '@sharpit/app/lib/access/tier';
import {
  AI_BUDGET_WARNING_HEADER,
  RETRY_AFTER_HEADER,
  aiBudgetWarningMessage,
  dailyTokenBudget,
  formatRetryDuration,
  questionsFor,
  type CoachQuota,
} from '@sharpit/app/lib/access/ai-budget-shared';

/**
 * Global cost ceiling for the coach conversation surface (chat/plan/adapt),
 * distinct from the per-endpoint rate limiters in rate-limit.ts (those cap
 * request *frequency*; this caps daily *spend* in tokens). Scoped to the
 * 'coach' AiUsageEvent feature only — session-narrative analysis has its own,
 * separate, tighter gate (narrative-trial.ts: 1/day, post-signup activities
 * only) and must not eat into or be eaten into by this budget. The budgets
 * themselves live in ai-budget-shared.ts, so the Pro page can quote them.
 */

/**
 * Rolling window, not a calendar-day reset: usage counts if it happened in
 * the last 24h, sliding with `now` rather than resetting at local midnight.
 * A fixed midnight reset lets an athlete spend a full budget at 23:59 and
 * another at 00:01 — two budgets within minutes. The rolling window closes
 * that: hitting the cap at 15:00 means waiting for that usage to age past
 * 24h, i.e. back below the cap around 15:00 the next day, not "at midnight".
 */
const BUDGET_WINDOW_HOURS = 24;

/** Ratio of the daily budget at which a still-allowed FREE athlete gets a heads-up before the cutoff. */
const WARNING_THRESHOLD_RATIO = 0.8;

export type AiBudgetStatus = {
  allowed: boolean;
  isPro: boolean;
  warning: boolean;
  /** Seconds until the rolling window frees enough budget — set only when `allowed` is false. */
  retryAfterSeconds: number | null;
};

/**
 * Walks usage oldest-first, dropping events until the remaining sum clears
 * the budget — the moment that dropped event ages past the window is the
 * real "available again" time. Only called once the aggregate has already
 * confirmed the athlete is over budget, so this second query stays rare.
 */
async function computeRetryAfterSeconds(
  athleteId: string,
  since: Date,
  budget: number,
): Promise<number> {
  const events = await prisma.aiUsageEvent.findMany({
    where: { athleteId, feature: 'coach', createdAt: { gte: since } },
    select: { createdAt: true, totalTokens: true },
    orderBy: { createdAt: 'asc' },
  });
  let remaining = events.reduce((sum, event) => sum + (event.totalTokens ?? 0), 0);
  for (const event of events) {
    remaining -= event.totalTokens ?? 0;
    if (remaining < budget) {
      const availableAt = addHours(event.createdAt, BUDGET_WINDOW_HOURS);
      return Math.max(1, Math.ceil((availableAt.getTime() - Date.now()) / 1000));
    }
  }
  // Defensive fallback — the aggregate that triggered this call already
  // guarantees the loop above returns before exhausting `events`.
  return BUDGET_WINDOW_HOURS * 3600;
}

/** The athlete's tier, budget and coach spend over the rolling window. */
async function readCoachSpend(athleteId: string) {
  const since = subHours(new Date(), BUDGET_WINDOW_HOURS);
  const [profile, usage] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { id: athleteId }, select: { tier: true } }),
    prisma.aiUsageEvent.aggregate({
      where: { athleteId, feature: 'coach', createdAt: { gte: since } },
      _sum: { totalTokens: true },
    }),
  ]);
  const isPro = hasProAccess(profile?.tier ?? 'FREE');
  return {
    since,
    isPro,
    budget: dailyTokenBudget(isPro),
    usedRecently: usage._sum.totalTokens ?? 0,
  };
}

/** Read-only check — never spends anything itself, the AiUsageEvent rows recordAiUsage already writes are the ledger. */
export async function ensureFreeAiBudget(athleteId: string): Promise<AiBudgetStatus> {
  // Local next dev: no Free token ceiling — same posture as rate-limit bypass.
  if (process.env.NODE_ENV === 'development') {
    return { allowed: true, isPro: true, warning: false, retryAfterSeconds: null };
  }

  const { since, isPro, budget, usedRecently } = await readCoachSpend(athleteId);
  const allowed = usedRecently < budget;

  return {
    allowed,
    isPro,
    warning: allowed && usedRecently >= budget * WARNING_THRESHOLD_RATIO,
    retryAfterSeconds: allowed ? null : await computeRetryAfterSeconds(athleteId, since, budget),
  };
}

/** What is left of the coach budget, in questions — the coach's gauge reads it. */
export async function coachQuota(athleteId: string): Promise<CoachQuota> {
  const { since, isPro, budget, usedRecently } = await readCoachSpend(athleteId);
  const spent = usedRecently >= budget;
  return {
    isPro,
    dailyQuestions: questionsFor(budget),
    remainingQuestions: questionsFor(budget - usedRecently),
    usedRatio: Math.min(1, usedRecently / budget),
    retryAfterSeconds: spent ? await computeRetryAfterSeconds(athleteId, since, budget) : null,
  };
}

export function aiBudgetResponseBody(
  retryAfterSeconds: number,
  isPro = false,
): {
  error: string;
  retryAfterSeconds: number;
} {
  const wait = formatRetryDuration(retryAfterSeconds);
  return {
    error: isPro
      ? `Tu as atteint ta limite d'échanges avec le coach pour les dernières 24h. Réessaie dans ${wait}.`
      : `Tu as atteint ta limite d'échanges avec le coach. Réessaie dans ${wait}, ou passe Pro pour un plafond plus élevé.`,
    retryAfterSeconds,
  };
}

export { AI_BUDGET_WARNING_HEADER, RETRY_AFTER_HEADER, aiBudgetWarningMessage };

/** Merges the warning header onto a coach route's response headers when the budget check flagged one. */
export function withAiBudgetWarningHeader<T extends Record<string, string>>(
  headers: T,
  warning: boolean,
): T | (T & Record<typeof AI_BUDGET_WARNING_HEADER, string>) {
  return warning ? { ...headers, [AI_BUDGET_WARNING_HEADER]: '1' } : headers;
}
