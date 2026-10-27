# ADR-117: Every coach turn is stored as the model saw it

**Status:** Accepted
**Date:** 2026-10-27
**Author:** Augustin Briolon

---

## Context

The coach phase 0 audit (`docs/audits/2026-10-27-coach-phase-0-error-analysis.md`) could not check
the figures the coach quoted (TSB, « capacité 88 % », readiness): the context each turn was built
from was never stored. It could not measure cost or latency per turn either: tokens lived in
`AiUsageEvent`, timings only in logs and Langfuse spans.

Langfuse already receives every coach turn's prompts when its keys are set, which they are in
production. That copy is held by a third party, is not joinable to an athlete's own rows, and is
not something the evals can query from the app.

## Decision

- A `CoachTurnTrace` row is written when each coach turn ends: the full system prompt the model
  saw (health context included), the intent, the model that served the last step, the finish
  reason, the outcome (`ok`, `empty`, `error`, `aborted`), steps, input / cached / output tokens,
  time to first text and total latency. The row cascades from the athlete profile, so account
  deletion erases it with the rest.
- The row is written from the handler's existing timing summary and turn outcome, so no second
  measurement exists. A retry on an empty answer records the retry's numbers.
- The write runs under `after`, as the conversation save does, and a failed write is logged and
  never fails the answer.
- Turns on threads the client owns are recorded too, with no `conversationId`.

## Options considered

### Option A — A table in our database, the full prompt stored (chosen)

Pros: the evals and the Phase 0 queries run in SQL against the same rows as the athlete data; the
prompt that produced an answer stays with the answer; deletion already cascades. Cons: the table
holds health context (the same data the athlete's snapshots hold), and it grows by one prompt
(~14 kB) per turn.

### Option B — Keep Langfuse as the only trace

Pros: nothing to build. Cons: the evals could not join a trace to the athlete's sessions or
decisions, and Langfuse's copy of health context is outside our database and outside the
deletion path (`deleteLangfuseTracesForAthlete` has to reach it separately).

### Option C — Store a hash and a compact summary of the context, not the prompt

Pros: smaller, less health data at rest. Cons: a hash cannot be replayed, and a summary is a
second, lossy copy of the context whose fidelity the evals would have to check.

## Consequences

### Positive

- Figures quoted by the coach can be checked against the prompt it had.
- Cost and latency per turn, and the outcome mix, are one SQL query.
- Account deletion needs no change: the relation cascades.

### Negative

- Health context is stored in our database per turn. Retention is not yet bounded; it follows the
  account until deletion. A retention window is a follow-up decision.
- Langfuse receives coach turns' timing and token spans, without prompts or answers: the coach's
  `streamText` records no inputs or outputs. Other AI features still send their prompts; whether
  they keep doing so is a separate decision.
- The migration `20261027120000_coach_turn_traces` was applied to production on 2026-10-27. Before
  it was, the write failed, was logged, and the answer was unaffected.

### Neutral

- Turns are recorded for every intent, including planning turns that create sessions.

## References

- `docs/audits/2026-10-27-coach-phase-0-error-analysis.md`
- [ADR-116](./ADR-116-many-row-queries-on-athlete-data-must-name-the-athlete.md)
- `packages/server/src/lib/coach/chat/coach-turn-trace.ts`
- `packages/server/src/handlers/coach/chat/handler.ts` (`coachTurnRecorder`)
