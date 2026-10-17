# ADR-092: The background briefing has its own AI ledger and is regenerated at most every 15 minutes

**Status:** Accepted
**Date:** 2026-10-18
**Author:** Augustin Briolon
**Amends:** ADR-077 (coach token budget)

---

## Context

On 2026-10-17 a new account finished the iOS onboarding and its first week could not be
generated: `/api/v1/coach/plan` answered 402, the Free coach budget (50 000 tokens over a rolling
24 h, ADR-077) being spent.

The plan itself had cost about 4 500 tokens per run. The rest — about 90 calls of ~3 000 tokens,
1 to 2 per second, ≈ 280 000 tokens in an hour — came from the daily briefing:

- every sync (`/api/v1/health-workouts` and the other imports) schedules the background tasks
  with `regenerateBriefing`, and `generateAndStoreDailyBriefing` asked the model again each time;
- a new account importing its Apple Health history syncs in many batches, so the briefing was
  rewritten once per batch;
- `generateDailyBriefingContent` recorded its usage under `coach`, the feature the budget counts,
  so a text the athlete never asked for spent the budget their plan and questions need.

## Decision

1. The briefing records its usage under a new `briefing` feature (`AiUsageFeature`). The coach
   budget keeps counting `coach` only: chat, plan, adapt and weekly review — what the athlete asks
   for.
2. The background path keeps a briefing generated in the last 15 minutes
   (`generateAndStoreDailyBriefing(…, { minIntervalMinutes: 15 })`, `isBriefingFresh`). The
   explicit briefing route still regenerates on demand.

`AiUsageEvent.feature` is a string column, so no migration is needed.

## Options considered

### Option A — Own ledger plus a 15-minute debounce (chosen)

Pros: the import storm costs one briefing instead of dozens; the athlete's budget only reflects
what they asked for. Cons: a briefing can lag the last synced batch by up to 15 minutes.

### Option B — Debounce only

Pros: one change. Cons: a few background briefings a day still eat into a 50 000-token Free
budget the athlete cannot see being spent.

### Option C — Raise the Free budget

Pros: no code. Cons: pays for the loop instead of removing it; the cost per athlete grows.

## Consequences

### Positive

- A history import no longer empties the coach budget; the onboarding's first week can run.
- Briefing spend is visible on its own in `AiUsageEvent` for FinOps.

### Negative

- Briefing spend is no longer capped by the coach budget; the debounce and the per-day upsert
  bound it instead (at most about 4 an hour while syncs keep arriving).

### Neutral

- Usage rows written before this change stay under `coach`.

## References

- `packages/server/src/lib/briefing/daily-briefing.ts`
- `packages/server/src/lib/athlete-state/background.ts`
- `packages/server/src/lib/ai/usage.ts`, `packages/server/src/lib/access/ai-budget.ts`
