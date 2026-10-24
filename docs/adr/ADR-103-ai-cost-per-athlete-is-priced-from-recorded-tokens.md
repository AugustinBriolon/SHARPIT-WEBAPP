# ADR-103: AI cost per athlete is priced from recorded tokens

**Status:** Accepted
**Date:** 2026-10-24
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-077](./ADR-077-extended-coach-volume-is-pro-and-counted-in-questions.md), [ADR-102](./ADR-102-plan-adherence-is-measured-in-weeks-one-to-four.md)

---

## Context

SharpIt Pro is priced at 12,99 € a month and its main cost is the AI: the coach, the session
analyses and the briefings. ADR-077 budgets the coach in tokens, but nobody could say what an
athlete costs in money, so the price could not be checked against it.

Every AI call is already recorded in `AiUsageEvent` with its input, output and cache-read tokens
and the model that served it.

---

## Decision

We price the last 30 days of `AiUsageEvent` per athlete and show it on `/admin`, beside plan
adherence: each athlete's cost (the coach's share on hover) and the mean over the athletes who
made an AI call.

- **Prices** are the Vercel AI Gateway's list prices per token for the models in use
  (`google/gemini-3-flash`, `anthropic/claude-haiku-4.5`, `openai/gpt-5-mini`), read from
  `https://ai-gateway.vercel.sh/v1/models` on 2026-10-24 and kept in
  `@sharpit/app/lib/admin/ai-cost`.
- **Cache hits** are part of the input tokens and are billed at the cache-read price.
- **An unknown model** (a new one, or a row without a model) is priced as the dearest known one,
  so the figure errs high.
- **In US dollars**, the gateway's currency; the page sets it beside the Pro price in euros.
- **One query**: the tokens summed per athlete, model and feature in SQL.

---

## Options considered

### A — Price the recorded tokens with a table in code (chosen)

- **Pros:** no new call or table; exact for the tokens we record; testable.
- **Cons:** the table must be updated by hand when a model or a price changes.

### B — Read the gateway's billing

- **Pros:** the amount actually billed, every surcharge included.
- **Cons:** per account, not per athlete — the question asked is per athlete.

### C — Fetch the gateway's prices at runtime

- **Pros:** never stale.
- **Cons:** a network call on every admin load and a page that fails with the gateway, for prices
  that change a few times a year.

---

## Consequences

### Positive

- The Pro price can be set against what an active athlete costs, and quotas (ADR-077) tuned on it.

### Negative

- List prices: tool surcharges (web search), regional and priority tiers are not counted.
- A stale price table misstates the cost; the unknown-model rule only protects against new models.

### Neutral

- Calls whose usage failed to record (`recordAiUsage` swallows errors) are missing from the sum.
