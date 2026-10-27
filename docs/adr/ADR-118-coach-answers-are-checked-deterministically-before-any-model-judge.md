# ADR-118: Coach answers are checked deterministically before any model judge

**Status:** Accepted
**Date:** 2026-10-27
**Author:** Augustin Briolon

---

## Context

The phase 0 audit (`docs/audits/2026-10-27-coach-phase-0-error-analysis.md`) grouped the coach's
failures into types. Several are visible in the stored turn alone: a session written and then
« does this suit you? », a change announced with no tool call, a tool call pasted into the text,
an internal verdict code shown to the athlete, a server warning ignored, a refused call described
as an error. A model judge is the usual tool for answer quality, but it costs money, is itself a
model whose agreement with a human must be measured first, and sends the answer's health context
to a third party when it runs in production.

## Decision

- The checks live in `packages/server/src/lib/coach/evals/turn-checks.ts` as pure functions over
  a turn: its text and its tool calls with their states and outputs. They call no model.
- Seven checks: `empty-answer`, `writes-then-asks`, `claims-without-tool`, `raw-tool-json`,
  `internal-codes`, `audit-warning-ignored`, `denied-misread`.
- They run in Vitest on synthetic turns, one positive and one negative case each. They run on
  stored turns (`CoachTurnTrace`, ADR-117) once those fill, and on the phase 0 conversations.
- A model judge is added later, only for qualities a check cannot read (tone, relevance), and
  only after its agreement with labelled turns is measured.

## Options considered

### Option A — Deterministic checks first (chosen)

Pros: free, reproducible, runs in CI, names the exact failure, needs no third-party call.
Cons: patterns are written for the French the coach uses today and miss paraphrases; each check
has false positives that nothing measures yet.

### Option B — A model judge first

Pros: reads meaning, not wording. Cons: needs labels to trust it (κ ≥ 0.7 on 50 turns), costs a
model call per turn, and sends health context to a provider.

### Option C — Fix the failures in the prompt only

Pros: no harness. Cons: the audit showed the prompt already states most of these rules; the
failures persisted. Nothing would detect a regression.

## Consequences

### Positive

- The baseline in the audit is reproducible: 19 stored answers give 3, 5, 3, 1, 1, 1 findings for
  the six checks, and zero empty answers.
- A check that fires on a new answer names the failure before the athlete reads it.

### Negative

- Precision is not measured. The counts are upper bounds on true failures until a sample is read
  by hand; this is the next step before any check gates a deploy.
- Pattern checks depend on wording. A rephrased claim (« la séance est à jour ») may slip past.

### Neutral

- The checks read the tool outputs the handler already stores, so they add no data collection.

## References

- `packages/server/src/lib/coach/evals/turn-checks.ts`
- [ADR-117](./ADR-117-every-coach-turn-is-stored-as-the-model-saw-it.md)
- `docs/audits/2026-10-27-coach-phase-0-error-analysis.md`
