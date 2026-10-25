# ADR-111: The coach draws native cards through display tools

**Status:** Accepted
**Date:** 2026-10-25
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-056](./ADR-056-coach-chat-survives-what-breaks-it.md), [ADR-057](./ADR-057-the-server-owns-coach-conversations.md), [ADR-052](./ADR-052-coach-chat-request-scope.md), [ADR-017](./ADR-017-endurance-prescription-authoring.md)

---

## Context

The coach answers in streamed markdown. When the athlete asks « que faire demain ? », the session
comes back as prose: blocks, durations and efforts as bullet lines the iPhone cannot lay out the
way a workout reads. A structured session only existed as the input of `createPlannedSession`, which
proposes a write to the plan. The coach could not show a session without asking to add it.

The athlete also had no way to go on from an answer other than typing. The obvious next questions
(« et si je n'ai que 45 min ? ») were left to them.

We wanted typed, versioned responses the app renders natively. The textbook route is a JSON
envelope produced with Structured Outputs (`{ type, summary, sections, workout, actions, followUps }`).
In this repository that route meets three constraints:

- the chat streams through the AI SDK's UI-message protocol, and its time to first text was
  worked down to 2–4 s (ADR-056). A JSON envelope is only usable once complete;
- the model sits behind the Vercel AI Gateway with failover across providers (Gemini first,
  Claude Haiku and GPT-5 mini next). Provider-specific response formats are not a common floor;
- the server replays the stored UI parts (ADR-057): thought signatures and tool approvals live in
  them. A second response format would need a second history.

---

## Decision

Draw cards through **display tools**: tools whose input is the card and which write nothing.

1. **Contract v1** in `@sharpit/app/lib/coach/chat/cards/coach-cards.ts`, version
   `COACH_CARDS_SCHEMA_VERSION = 1`:
   - `presentWorkout`: `type`, `title`, `purpose`, optional `intensity`, `durationMin`, `load`,
     `endurancePrescription` (ADR-017's authoring shape) or `strengthPrescription`, and `warnings`
     (always present, `[]` when none);
   - `suggestFollowUps`: `suggestions`, 1 to 3 short questions written as the athlete's own.
     The zod schema is the tool's `inputSchema`, so the AI SDK rejects a malformed card before it
     runs. The tool answers `{ ok: true, schemaVersion }`, or `{ ok: false, error }` for a card that
     cannot be drawn (a sport not practised, a strength session without exercises). Paces, watts and
     heart rates are never authored: a step names its effort.
2. **Fixtures** next to the schema are the shared contract. The iPhone keeps a byte-identical
   copy in `SHARPIT-APPTests/Fixtures/CoachCards`. The web test fails when the two drift (skipped
   when the app repository is not beside this one).
3. **A drawn card ends the turn.** `stopWhen` adds `drewCoachCard`: after a step where a display
   tool returned `ok: true`, the model is not called again. A card costs its output tokens, never
   another step. A refused card lets the model read why and retry within the step budget.
4. **Scope** (ADR-052): `suggestFollowUps` goes with every read-only scope. `presentWorkout`, with
   its larger schema, goes to `session` and `recovery`, plus the scopes that already carry every
   tool. A meal question does not carry it.
5. **Prompt rules**: 1–3 sentences of reasoning, then the card, without restating its blocks in
   prose. One workout card per answer. Follow-ups last, never after an off-scope refusal or beside a
   proposal awaiting approval. The coach also gets three honesty rules: a planned session counts as
   done only once an activity confirms it; data versus inference is kept apart, and a recovery
   figure is an indicator, not a diagnosis; one targeted question replaces a guess when a missing
   fact changes the answer.
6. **iPhone**: `CoachWorkout` / `CoachFollowUps` decode the part's input. They only decode at
   `input-available` or `output-available`, and never when the output refused the card or carries
   another schema version. `CoachWorkoutCard` and `CoachFollowUpsView` render them in the
   thread. A card that does not decode is left out, and the prose around it still reads.
   Follow-ups show under the last settled answer only, and a tap sends the suggestion as the
   athlete's question.

A card writes nothing. Adding the session to the plan stays the existing `createPlannedSession`
proposal, which needs the athlete's approval.

---

## Rationale

- Tool calls are already structured output in every provider the gateway fails over to, and they
  stream as parts the app already assembles (`CoachUIMessageAssembler`). The prose keeps
  streaming, and only the card waits for its own JSON to complete.
- The history stays one format. Replay, approvals, quotas and the empty-answer retry
  (ADR-056) are unchanged.
- The card's schema is the write tool's input minus the scheduling fields. A later « Ajouter au
  plan » can map one onto the other without a second session model.

---

## Alternatives Considered

### Alternative 1: Structured Outputs envelope on the Responses API

**Description:** One JSON object per answer (`type`, `sections`, `workout`, `actions`, `followUps`)
via `response_format: json_schema`, rendered by type on the client.

**Pros:**

- One schema describes the whole answer.
- Every answer has a declared type.

**Cons:**

- No usable text until the object is complete: it gives up the streamed first words of ADR-056.
- Ties the coach to one provider's response format, and loses the gateway failover.
- Duplicates conversation state beside the stored UI parts.

**Rejected because:** it would trade latency, resilience and one history for a uniformity the
app does not need. Prose stays prose; only what has a shape gets a card.

### Alternative 2: Parse structure out of the markdown

**Description:** Ask for a fenced JSON block, or a markdown convention, inside the text, and parse
it on the client.

**Pros:**

- Needs no new tools.

**Cons:**

- Unvalidated until the client sees it.
- Shows half-written JSON while it streams.
- The prompt already forbids printing JSON.

**Rejected because:** validation belongs on the server, before the athlete sees anything.

---

## Consequences

### Positive

- A proposed session reads as a workout: blocks in order, repeats, efforts, cautions.
- The next question is a tap away.
- Cards are versioned and pinned by shared fixtures on both platforms.

### Negative

- Each answer may spend ~50 output tokens on follow-ups, and the workout schema adds prompt
  tokens in the scopes that carry it.
- The card shows efforts, not the athlete's numeric targets. Resolving them from thresholds is a
  later step.
- Only two card types exist so far. Analysis, recovery and plan cards follow the same pattern
  in later phases.

### Neutral

- The web has no coach chat UI today. The iPhone is the only renderer.
