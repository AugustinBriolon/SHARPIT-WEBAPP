# Knowledge enrichment + confidence Gate — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enrich Sharpit scientific knowledge from competitive research, then enforce confidence-based Plan Gate refusal and surface Gate evidence citations.

**Architecture:** Knowledge is Sharpit-authored prose under `knowledge/` (research scrapes stay quarantined). Algorithm change is limited to Plan Gate + Session Rationale presentation — Core engines untouched.

**Tech Stack:** TypeScript, Vitest, existing Plan Gate / Decision Memory / Session Rationale stack.

---

### Task 1: Knowledge enrichment docs

**Files:**

- Create: `knowledge/research/README.md`
- Create: `knowledge/research/competitive-concepts.md`
- Create: `knowledge/research/llm-agent-patterns.md`
- Modify: `knowledge/confidence-scoring.md`
- Modify: `knowledge/glossary.md`
- Modify: `knowledge/README.md`

**Steps:**

1. Write research index + concept map + agent patterns (English, Sharpit voice).
2. Add Plan Gate enforcement section to confidence-scoring.
3. Glossary entries for Calibration, Confidence Gate, Daily load vs training status.
4. Link from knowledge README.

---

### Task 2: Decision compatibility — reject LOW / INSUFFICIENT

**Files:**

- Modify: `packages/server/src/lib/plan-gate/rules/decision-compatibility.ts`
- Modify: `packages/server/src/lib/plan-gate/rules/decision-compatibility.test.ts`

**Steps:**

1. Write failing tests: INSUFFICIENT → REJECTED; LOW → REJECTED (`DECISION_LOW_CONFIDENCE`); missing decision → REJECTED.
2. Update `insufficientDecisionFinding` severity to REJECTED; add `lowConfidenceDecisionFinding`.
3. Run `yarn server test src/lib/plan-gate/rules/decision-compatibility.test.ts` (or workspace equivalent).

---

### Task 3: Evidence labels in Session Rationale

**Files:**

- Create: `packages/server/src/lib/presentation/coaching/evidence-ref-labels.ts` (+ test)
- Modify: `packages/app/src/presentation/session-rationale-view-model.ts`
- Modify: `packages/server/src/lib/presentation/planned-session/session-rationale.ts` (+ test)
- Modify: `apps/hub/src/help/articles/methode.ts` + `plan.ts` (align athlete copy with Gate)
- **Do not** modify `apps/web/.../session-rationale-card.tsx` (removed by ADR-072)

**Steps:**

1. Map known `evidenceRefs` paths → FR labels; unknown refs omitted (no raw leak of obscure paths preferred — or pass through sanitized).
2. Extend finding type with `evidenceLabels: readonly string[]`.
3. UI: list labels under rationale.
4. Tests for mapping + VM.

---

### Task 4: Verify

Run targeted Vitest suites for plan-gate decision-compatibility and session-rationale.
