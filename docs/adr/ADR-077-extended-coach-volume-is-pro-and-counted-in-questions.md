# ADR-077: Extended coach volume is Pro, and counted in questions

**Status:** Accepted
**Date:** 2026-10-10
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (turns the `extended-coach` perk from `planned` into `pro`)

---

## Context

The coach routes (chat, plan, adapt) already share one budget per athlete: tokens spent over a
rolling 24 h (`ensureFreeAiBudget`), 50 000 for Free and 500 000 for Pro. The Pro page still listed
« Volume de coach étendu » as planned, and the athlete saw nothing of the budget until a warning at
80 % or a refusal. A token count means nothing to an athlete.

Production usage in the 30 days to 2026-10-10: a coach call costs about 8 000 tokens on average
(5 800 to 12 100 per day's mean, single calls up to 44 000). Free's budget is about 6 questions a
day, Pro's about 62. The heaviest day seen, 667 000 tokens, came from development use.

---

## Decision

- The budgets stay 50 000 / 500 000 tokens per rolling 24 h. They move to `ai-budget-shared.ts`,
  beside `AVERAGE_COACH_QUESTION_TOKENS = 8_000` and `questionsFor`, so the server's gate and the
  Pro page read one value.
- « Volume de coach étendu » becomes a Pro perk, its copy computed from those constants
  (« Environ 62 questions au coach par 24 h, contre 6 sans Pro »).
- `GET /api/coach/quota` and its native twin `/api/v1/coach/quota` answer what is left, in
  questions: `{ isPro, dailyQuestions, remainingQuestions, usedRatio, retryAfterSeconds }`.
  `coachQuota` reads the same spend as the gate (`readCoachSpend`).
- The iOS coach shows a thin gauge above the composer once half the budget is spent, counting the
  questions left or saying when the budget frees up; a Free athlete is offered Pro there.

---

## Options considered

### Option A — Leave the perk planned

Pro already gets ten times Free's budget without being told; the perk sells nothing.

### Option B — Count questions instead of tokens

Simple to show, but a plan run costs several times a chat turn, and a long answer with tools
costs more than a short one. The cost is in tokens; counting questions would either undercharge
the expensive turns or overcharge the cheap ones.

### Option C — Keep tokens, show questions (chosen)

The gate stays on what the coach costs. The athlete reads an estimate in questions, from the
measured average; the gauge is approximate (« Environ »).

---

## Consequences

### Positive

- The Pro perk is real and quoted with the real numbers.
- The athlete sees the limit coming instead of meeting it.

### Negative

- The question count is an average: a heavy plan run consumes several « questions ».
- `AVERAGE_COACH_QUESTION_TOKENS` must be re-measured when the model or the prompt changes.

### Neutral

- Local development still bypasses the gate; the quota route reads the real spend.

---

## References

- `packages/app/src/lib/access/ai-budget-shared.ts`
- `packages/server/src/lib/access/ai-budget.ts` (`coachQuota`, `ensureFreeAiBudget`)
- `packages/server/src/handlers/coach/quota/handler.ts`
- `packages/app/src/lib/access/pro-perks.ts`
