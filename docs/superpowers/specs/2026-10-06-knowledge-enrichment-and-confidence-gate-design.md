# Design — Knowledge enrichment + confidence Gate (P0)

**Date:** 2026-10-06  
**Status:** Approved via product direction (enrich knowledge → improve algorithms)  
**Scope:** Knowledge corpus enrichment from competitive research (Bevel Help, agent-pattern survey) + Plan Gate refusal when confidence is weak + surface Gate evidence citations in Session Rationale.

## Goals

1. Turn scraped / surveyed external material into **Sharpit-owned** knowledge (no verbatim product copy in athlete-facing surfaces).
2. Close the gap between `confidence-scoring.md` ("insufficient → no recommendation") and Plan Gate behaviour (today: `INSUFFICIENT` → `REQUIRES_CONFIRMATION`, proposal still shown).
3. Surface existing Gate `evidenceRefs` in the Session Rationale presentation layer.

## Non-goals

- New Core physiological engines (Core remains frozen).
- LLM schema `evidenceRefs` on plan/adapt generation (P1).
- Corrective RAG over `knowledge/` at runtime (P1).
- Replicating Bevel Strain / Energy Bank / Biological Age as products.

## Knowledge enrichment

| Artifact                                     | Role                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `knowledge/research/README.md`               | Index of research corpora (Bevel scrape, future sources)                            |
| `knowledge/research/competitive-concepts.md` | Sharpit concept map inspired by Bevel Help (attribution, no copy-paste of articles) |
| `knowledge/research/llm-agent-patterns.md`   | Patterns from awesome-llm-apps relevant to coach / Decision Memory                  |
| `knowledge/confidence-scoring.md`            | Add **Plan Gate enforcement** policy                                                |
| `knowledge/glossary.md`                      | Add Calibration, Daily load vs training status, Confidence Gate                     |
| `knowledge/README.md`                        | Link research section                                                               |

Raw Bevel articles stay under `knowledge/research/bevel-help/` for internal research only.

## Algorithm P0 — Plan Gate

### Refusal policy

| `confidenceTier`                       | Gate severity | Rule code                    | Athlete effect                                      |
| -------------------------------------- | ------------- | ---------------------------- | --------------------------------------------------- |
| missing decision **or** `INSUFFICIENT` | `REJECTED`    | `DECISION_INSUFFICIENT_DATA` | Filtered before UI (handlers already drop REJECTED) |
| `LOW`                                  | `REJECTED`    | `DECISION_LOW_CONFIDENCE`    | Same                                                |
| `MEDIUM` / `HIGH`                      | unchanged     | intensity / fatigue rules    | As today                                            |

Rationale: aligns with Core `shouldGateAdvice` (confidence &lt; 0.6 or insufficient data) and with `confidence-scoring.md` insufficient band. Decision Memory still records the proposal + Gate result.

### Citations

- Extend `SessionRationaleGate` findings to include resolved `evidenceLabels` (FR), mapped from `evidenceRefs`.
- Do not leak raw `ruleCode` (existing invariant).
- UI: show evidence labels under each finding rationale when present.

## Files to change (code)

- `packages/server/src/lib/plan-gate/rules/decision-compatibility.ts` (+ tests)
- `packages/app/src/presentation/session-rationale-view-model.ts`
- `packages/server/src/lib/presentation/planned-session/session-rationale.ts` (+ tests)
- `packages/server/src/lib/presentation/coaching/evidence-ref-labels.ts` (new)
- Hub help alignment: `apps/hub/src/help/articles/methode.ts`, `plan.ts`

**Note:** Session Rationale UI on the web was removed by ADR-072 (carnet de lecture). Evidence labels ship in the presentation ViewModel / API for the iPhone app; do not resurrect `apps/web/.../session-rationale-card.tsx`.

## Success criteria

- Unit tests: INSUFFICIENT and LOW → REJECTED; HIGH intensity under RECOVER still REJECTED; MEDIUM allows endurance under RECOVER.
- Session rationale VM includes evidence labels when findings carry refs.
- Knowledge index links research + updated confidence Gate policy.
