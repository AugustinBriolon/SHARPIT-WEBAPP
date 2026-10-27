# ADR-119: Data cards are the read tools' own numbers

**Status:** Accepted
**Date:** 2026-10-28
**Author:** Augustin Briolon
**Related:** [ADR-111](./ADR-111-the-coach-draws-cards-through-display-tools.md), [ADR-117](./ADR-117-every-coach-turn-is-stored-as-the-model-saw-it.md), [ADR-118](./ADR-118-coach-answers-are-checked-deterministically-before-any-model-judge.md)

---

## Context

ADR-111 lets the coach draw a workout card and follow-up buttons. Nothing draws data: a question
about energy, effort target or sleep against readiness comes back as markdown, and 9 of the 19
answers in the first export carried figures in prose. The three read tools (`explainDayScores`,
`explainTargetBand`, `compareSleepVsReadiness`) held the structured values and dropped them when
they formatted the markdown.

A card the model authors (as `presentWorkout` is) would let it type a figure. The coach already
quotes figures wrongly in places (phase 0 audit), so a drawn wrong number is worse than prose.

## Decision

- The read tools return their card with their markdown: `{ ok, markdown, schemaVersion, card }`.
  The model writes nothing in the card. It chooses a card by calling the tool, as it did before.
- The contract is a discriminated union (`sleepVsReadiness`, `dayScores`, `targetBand`) in
  `@sharpit/app/lib/coach/chat/cards/coach-data-cards.ts`, with fixtures in `data-fixtures`. Figures
  are rounded as the markdown states them, so card and prose agree.
- A card that breaks the contract (a score out of range) is left out and the markdown answers
  alone. A missing value is `null`, never zero.
- The prompt asks the coach not to copy a card's table or values into prose.
- ADR-118 gains `card-figure-mismatch`: an « x/100 » in the answer that no card of the turn holds.

## Options considered

### Option A — The tool result is the card (chosen)

Pros: no figure authored by a model; works with any model that calls tools; no new tool, no extra
step. Cons: one card per tool, so a new visual means a new or extended read tool.

### Option B — A display tool the model fills with references to read-tool outputs

Pros: the model composes cards freely. Cons: the display tool cannot see another tool's output
inside its execute, so the server would need a cross-call lookup; a wrong reference draws a wrong
card.

### Option C — A display tool where the model types the values

Pros: simplest to build, any chart. Cons: the model types figures; the numbers cannot be checked
against a source except after the fact.

## Consequences

### Positive

- Every figure on a data card is the tool's own number.
- The stored trace (ADR-117) holds the card, so ADR-118's check and later evals read it directly.

### Negative

- The iPhone app has to decode and draw `card` from these tool parts. Until it does, the card is
  ignored and the prose answers alone. The web client likewise.
- The tool output grows by the card, replayed in the thread history on later questions.

### Neutral

- Workout cards and follow-ups keep ADR-111's contract unchanged.

## References

- `docs/audits/2026-10-28-coach-visuals-plan.md`
- `packages/app/src/lib/coach/chat/cards/coach-data-cards.ts`
- `packages/server/src/lib/coach/chat/tools/coach-insights-cards.ts`
