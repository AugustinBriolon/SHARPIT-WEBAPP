# Athlete memory + offline Decision Memory evals (P2) — Design

**Date:** 2026-10-06  
**Status:** Approved for planning  
**Depends on:** P0 Plan Gate confidence refusal; P1 keyword knowledge RAG

## Goals

1. **Runtime memory** — Inject Decision Memory learning patterns into coach **plan** and **adapt** prompts so prescriptions account for repeated athlete outcomes (e.g. RUN HARD often harder than planned).
2. **Offline evals** — Provide a local, deterministic harness that asserts memory-block assembly from synthetic outcomes, without requiring live LLM calls.

## Non-goals

- Core Recovery / Fatigue / Adaptation / Decision changes
- Vector / embedding stores
- Persisted `AthleteCalibrationSignal` write-back (still deferred per ADR-006 / ADR-007)
- Injecting memory into coach **chat / discuss** in this slice (same injection surface as P1: plan + adapt only)
- LLM-as-judge scoring

## Architecture

```
findRecentEvaluatedOutcomes (90d)
        ↓
buildLearningFeedback (pure stats)
        ↓
filter out INSUFFICIENT_EVIDENCE-only / empty
        ↓
describeLearningFeedbackItem (existing FR sentences)
        ↓
formatLearningMemoryBlock → "" | "## Apprentissages Decision Memory\n…"
        ↓
buildPlanPrompt / buildAdaptPrompt (alongside knowledge RAG block)
```

Offline:

```
golden fixtures (outcomes + expected substrings)
        → same formatLearningMemoryBlock path
        → pass/fail report under apps/api/.bench/
```

## Runtime memory

### Source of truth

Reuse existing pure pipeline:

- `findRecentEvaluatedOutcomes(athleteId, since)` — same window as weekly brief (`LEARNING_FEEDBACK_WINDOW_DAYS = 90`)
- `buildLearningFeedback(outcomes)` — `packages/server/src/lib/decision-memory/learning-feedback.ts`
- `describeLearningFeedbackItem` — `packages/server/src/lib/presentation/coaching/learning-feedback.ts`

### Prompt block rules

- Cap at **3** actionable items (exclude `INSUFFICIENT_EVIDENCE`).
- If no actionable items → return `''` (typed refuse; model must not invent athlete history).
- Prompt header (French, coach voice):

  ```
  ## Apprentissages Decision Memory
  Patterns issus des séances évaluées — ajuste la prescription si pertinent. Le verdict Twin du jour prime en cas de conflit.
  ```

- Place the block next to the knowledge RAG block in plan/adapt (after athlete context, before or after knowledge — prefer **after context, before knowledge** so Twin facts stay first).

### Wiring

- `preparePlanGeneration` and adapt prompt path (same handlers as P1 RAG).
- Extract a small helper e.g. `formatLearningMemoryBlock(items)` + async loader used by both handlers to avoid duplication.

## Offline evals

### Command

`yarn api eval:coach-memory` → `apps/api/scripts/eval-coach-memory.ts`

### Behaviour

- No network / no LLM required for the default path.
- Load golden JSON fixtures (synthetic categorized outcomes + expected presence/absence of sentence keys or substrings).
- Run `buildLearningFeedback` → `formatLearningMemoryBlock`.
- Assert expectations; write a short markdown/JSON report under `apps/api/.bench/` (directory already used by `bench:coach-models`).
- Exit non-zero on failure (CI-friendly later; not wired to CI in this slice unless trivial).

### Fixture shape (illustrative)

```json
{
  "id": "run-hard-repeated-harder",
  "outcomes": [/* type, intensity, outcomeStatus, complianceScore, verdict */],
  "expectBlockContains": ["plus dures que prévu"],
  "expectBlockEmpty": false
}
```

## Testing

- Unit: `formatLearningMemoryBlock` (empty, insufficient-only, cap at 3, FR content).
- Existing `buildLearningFeedback` / presentation tests remain the stats source of truth.
- Handler tests: mock outcomes loader → prompt includes / omits memory block (mirror P1 knowledge injection style if handlers are already tested).

## Success criteria

- [ ] Plan and adapt prompts include memory block when ≥1 actionable learning item exists
- [ ] Empty / insufficient-only → no memory section in prompt
- [ ] `yarn api eval:coach-memory` passes on committed fixtures without LLM keys
- [ ] Core packages unchanged

## Sequencing note

P0 + P1 shipped. This is **P2** from `knowledge/research/llm-agent-patterns.md`. Update that file’s sequencing line when implementation lands if needed.
