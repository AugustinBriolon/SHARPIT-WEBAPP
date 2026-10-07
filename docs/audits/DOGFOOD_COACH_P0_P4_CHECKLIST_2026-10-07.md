# Dogfood checklist — Coach initiative P0–P4

> **Status:** Ready to run (athlete-filled)  
> **Date:** 2026-10-07  
> **Scope:** Validate real impact of the Oct 2026 coach/knowledge slices (Gate confidence, RAG, learning memory, calibrating, weekly brief scout, help copy, day-load vocab, activity status).  
> **Related:** [`DOGFOODING_COACHING_LOOP_2026-07-15.md`](./DOGFOODING_COACHING_LOOP_2026-07-15.md) · `knowledge/research/llm-agent-patterns.md` · CI scripts `eval:coach-memory` · `eval:weekly-brief` · `eval:coach-prompt-improve`

## How to use

1. Run **offline guardrails** once (§0) before live scenarios.
2. Execute scenarios **A–H** on a real athlete account (web and/or iOS). Mark Pass / Fail / N/A.
3. For Fail: one line in §2 Findings (`id`, slice, repro, expected, actual).
4. After ≥72 h on completed sessions, fill **§1 Delayed** (outcomes → learning block).
5. Do **not** invent Core changes from a single Fail — open a fixture or prompt-mutation candidate first.

Legend: **P** = Pass · **F** = Fail · **N** = N/A (precondition missing)

---

## 0. Offline guardrails (same day, no LLM required)

| #   | Check                                            | Command / action                     | P/F/N | Notes |
| --- | ------------------------------------------------ | ------------------------------------ | ----- | ----- |
| G1  | Coach memory fixtures green                      | `yarn api eval:coach-memory`         |       |       |
| G2  | Weekly brief quality fixtures green              | `yarn api eval:weekly-brief`         |       |       |
| G3  | Prompt self-improve keep/rollback fixtures green | `yarn api eval:coach-prompt-improve` |       |       |
| G4  | CI “Coach offline evals” green on latest `main`  | GitHub Actions                       |       |       |

---

## 1. Live scenarios (fill same day unless marked Delayed)

### A — Confidence Gate / calibrating (P0, P3c)

| #   | Scenario                                                                            | Pass if                                                                                | P/F/N | Notes |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----- | ----- |
| A1  | Low / insufficient Twin confidence (new day, missing morning data, or cold history) | Plan does **not** show a hard coach-written session; Gate / UI explains low confidence |       |       |
| A2  | Same state in Coach chat                                                            | Chat stays factual / cautious; no “train hard” prescription contradicting Gate         |       |       |
| A3  | Session Rationale on a gated or accepted session                                    | Evidence labels visible when refs exist; no raw obscure paths leaked                   |       |       |
| A4  | Calibrating surfacing                                                               | Coach context / copy mentions calibration when confidence is LOW / INSUFFICIENT        |       |       |

### B — Knowledge RAG (P1, P3a)

| #   | Scenario                                                            | Pass if                                                                             | P/F/N | Notes |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----- | ----- |
| B1  | Plan or adapt with a clear physiological cue (e.g. recovery / load) | Prompt path injects a knowledge block **or** cleanly refuses when retrieval is weak |       |       |
| B2  | Nonsense / off-corpus question in chat                              | No invented studies; stays on Twin + Sharpit corpus                                 |       |       |

### C — Learning memory (P2, P3b) — Delayed

Precondition: ≥1 completed planned session with outcome evaluation available (~72 h after session date).

| #   | Scenario                          | Pass if                                                                                          | P/F/N | Notes |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------ | ----- | ----- |
| C1  | Outcomes exist in Decision Memory | At least one evaluated outcome for this athlete                                                  |       |       |
| C2  | Plan or adapt after C1            | System prompt / plan includes `## Apprentissages Decision Memory` when actionable patterns exist |       |       |
| C3  | Chat after C1                     | Same learning block available on chat path when loader returns content                           |       |       |
| C4  | Insufficient-only history         | No learning section invented when evidence is empty / insufficient                               |       |       |

### D — Weekly brief quality (P3d)

| #   | Scenario                                               | Pass if                                                                    | P/F/N | Notes |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------- | ----- | ----- |
| D1  | Open / generate weekly coaching brief on a normal week | Brief has plan week, load, key sessions (or honest empty state)            |       |       |
| D2  | Thin week (few sessions)                               | Copy does not pretend a full coaching narrative; empty/thin state readable |       |       |

### E — Help / coach boundaries (P4a)

| #   | Scenario                                 | Pass if                                                   | P/F/N | Notes |
| --- | ---------------------------------------- | --------------------------------------------------------- | ----- | ----- |
| E1  | Open `/aide/coach/limites`               | Will / will-not list matches Gate + medical non-diagnosis |       |       |
| E2  | Hub search “diagnostic” or “ne fera pas” | Surfaces the limites article                              |       |       |

### F — Day load vs training status (P4b)

| #   | Scenario                                                     | Pass if                                                           | P/F/N | Notes |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------- | ----- | ----- |
| F1  | Open `/aide/scores/charge-du-jour-et-statut`                 | Distinguishes day cost vs PMC / fatigue / adaptation horizon      |       |       |
| F2  | Chat after a hard day while TSB / form still OK (or reverse) | Coach does **not** equate “journée dure” with overtraining status |       |       |

### G — Activity status (P4e)

| #   | Scenario                                                                | Pass if                                                                         | P/F/N | Notes |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----- | ----- |
| G1  | Set status **Malade** (or Blessé / En pause), ask Coach for a hard week | Coach respects status; no normal load plan without acknowledging the constraint |       |       |
| G2  | Set status back to **Actif**                                            | Normal planning resumes; no stale “sick” imperative in context                  |       |       |
| G3  | Open `/aide/methode/statut-d-activite`                                  | Four modes + planning impact match product copy                                 |       |       |

### H — End-to-end smoke (optional same day)

| #   | Scenario                                                                  | Pass if                                                               | P/F/N | Notes |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----- | ----- |
| H1  | Morning Today → generate/adapt week → accept one session → open rationale | No contradiction Today ↔ Coach ↔ Gate on confidence / verdict framing |       |       |
| H2  | One-line journal                                                          | Fill §3 for that day                                                  |       |       |

---

## 2. Findings log

| Id  | Slice (P0–P4) | Repro (steps) | Expected | Actual | Next action (fixture / prompt candidate / product) | Done |
| --- | ------------- | ------------- | -------- | ------ | -------------------------------------------------- | ---- |
|     |               |               |          |        |                                                    |      |

---

## 3. Daily one-liner journal

Copy one row per calendar day during the dogfood window.

| Date       | Status used | What coach said (1 line) | What I did | Result / feel | Slice touched |
| ---------- | ----------- | ------------------------ | ---------- | ------------- | ------------- |
| YYYY-MM-DD | active/…    |                          |            |               |               |

---

## 4. Improvement loop (after findings)

For each **F** that is unambiguous and repeatable:

1. Add or extend a golden fixture (`eval-coach-memory`, `eval-weekly-brief`, or `eval-coach-prompt-improve`) that fails on the bad behaviour.
2. Fix the smallest surface (copy, format line, retrieval rule) — not Core.
3. If prompt-shaped: run `yarn api eval:coach-prompt-improve` (optional `--write-candidate`); keep only if score rises; review candidate before any source edit.
4. Re-run the failing scenario row until **P**.

---

## 5. Exit criteria (initiative “impact validated”)

Mark the initiative’s dogfood pass when **all** hold:

- [ ] §0 all **P**
- [ ] A1–A2, E1, F1–F2, G1–G2 all **P** (or N with written reason)
- [ ] C1–C2 **P** once outcomes exist (or explicitly deferred with date)
- [ ] Every **F** either fixed + retested, or logged in §2 with a scheduled next action
- [ ] No open safety contradiction (Gate refuse vs Coach hard prescribe)

---

## 6. Out of scope for this checklist

- Core Recovery / Fatigue / Adaptation formula changes
- Embeddings / new RAG engine
- iOS-only hike-trip cleanup (tracked separately)
- Billed `bench:coach-models` as a substitute for dogfood
