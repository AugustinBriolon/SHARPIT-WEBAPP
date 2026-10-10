import { format } from 'date-fns';

/**
 * Header name and copy shared between the coach routes (server) and the coach
 * hooks (client) that warn an athlete approaching their daily AI budget.
 *
 * Kept in its own prisma-free module: `ai-budget.ts` imports `@sharpit/db/client`,
 * which must never end up in a client bundle. Client code imports only from
 * here.
 */

export const AI_BUDGET_WARNING_HEADER = 'X-Ai-Budget-Warning';

/**
 * The coach's daily spend, in tokens over a rolling 24 h: a real limit for Free, sized to several
 * exchanges and one plan run; ten times that for Pro (« Volume de coach étendu »), a soft ceiling
 * that only stops a runaway loop.
 */
export const FREE_DAILY_TOKEN_BUDGET = 50_000;
export const PRO_DAILY_TOKEN_BUDGET = 500_000;

/**
 * What one coach question costs on average — chat turns with their tools, measured in prod in
 * October 2026 (≈ 8k tokens). Turns the budget into questions an athlete can count.
 */
export const AVERAGE_COACH_QUESTION_TOKENS = 8_000;

export function dailyTokenBudget(isPro: boolean): number {
  return isPro ? PRO_DAILY_TOKEN_BUDGET : FREE_DAILY_TOKEN_BUDGET;
}

/** About how many questions a budget of tokens buys, never below zero. */
export function questionsFor(tokens: number): number {
  return Math.max(0, Math.floor(tokens / AVERAGE_COACH_QUESTION_TOKENS));
}

/** `/api/v1/coach/quota`: what is left of the athlete's coach budget, in questions. */
export type CoachQuota = {
  isPro: boolean;
  /** About how many questions the full budget buys: 6 Free, 62 Pro. */
  dailyQuestions: number;
  /** About how many are left in the rolling 24 h. */
  remainingQuestions: number;
  /** Share of the budget spent, 0 to 1. */
  usedRatio: number;
  /** Set once the budget is spent: seconds until enough of it frees up. */
  retryAfterSeconds: number | null;
};

/** Standard HTTP header — set on the 402 with the real wait, in seconds, until the rolling window frees enough budget. */
export const RETRY_AFTER_HEADER = 'Retry-After';

export function aiBudgetWarningMessage(): string {
  return "Tu approches de ta limite d'échanges avec le coach sur les dernières 24h.";
}

/** "3 h" / "12 min" — used for the server's error sentence, which has no reliable way to know the athlete's timezone. */
export function formatRetryDuration(retryAfterSeconds: number): string {
  if (retryAfterSeconds >= 3600) {
    return `${Math.ceil(retryAfterSeconds / 3600)} h`;
  }
  return `${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min`;
}

/**
 * "dans 12 min" / "à 18:45" — for the client-side blocked chip, which has no
 * live countdown. A relative duration goes silently stale the moment the
 * athlete leaves the tab open without a fresh response — "dans 3h" still
 * reads "dans 3h" 45 minutes later. An absolute clock time doesn't have that
 * problem, so it takes over past the one-hour mark, where staleness would
 * otherwise be most misleading. Computed client-side (not reused from the
 * server) so it lands in the athlete's own local time, not the server's.
 */
export function formatBudgetRetryEta(retryAfterSeconds: number): string {
  if (retryAfterSeconds < 3600) {
    return `dans ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} min`;
  }
  return `à ${format(new Date(Date.now() + retryAfterSeconds * 1000), 'HH:mm')}`;
}
