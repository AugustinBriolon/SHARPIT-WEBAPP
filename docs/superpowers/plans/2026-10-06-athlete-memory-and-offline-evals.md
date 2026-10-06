# Athlete memory + offline evals (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject Decision Memory learning patterns into plan/adapt prompts, and ship a deterministic offline eval harness for the memory block.

**Architecture:** Reuse `findRecentEvaluatedOutcomes` → `buildLearningFeedback` → FR sentences via `describeLearningFeedbackItem`. New pure `formatLearningMemoryBlock` + shared async loader. Offline script runs the same pure path on golden fixtures (no LLM).

**Tech Stack:** TypeScript, Vitest, existing Decision Memory + coach plan/adapt handlers.

## Global Constraints

- Core packages unchanged
- No embeddings / no AthleteCalibrationSignal persistence
- Plan + adapt only (not chat)
- Empty / insufficient-only → empty string (typed refuse)
- Cap 3 actionable items; French prompt copy as in the design spec
- Window: 90 days (same as weekly brief)

## File map

| File                                                                        | Responsibility                        |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `packages/server/src/lib/coach/memory/format-learning-memory-block.ts`      | Pure: items → prompt block or `''`    |
| `packages/server/src/lib/coach/memory/format-learning-memory-block.test.ts` | Unit tests                            |
| `packages/server/src/lib/coach/memory/load-learning-memory-block.ts`        | Async: athleteId → formatted block    |
| `packages/server/src/handlers/coach/plan/handler.ts`                        | Inject memory block into plan prompt  |
| `packages/server/src/handlers/coach/adapt/handler.ts`                       | Inject memory block into adapt prompt |
| `apps/api/scripts/eval-coach-memory.ts`                                     | Offline eval runner                   |
| `apps/api/scripts/eval-coach-memory-fixtures.json`                          | Golden fixtures                       |
| `apps/api/package.json`                                                     | `eval:coach-memory` script            |

---

### Task 1: formatLearningMemoryBlock (TDD)

**Files:**

- Create: `packages/server/src/lib/coach/memory/format-learning-memory-block.ts`
- Create: `packages/server/src/lib/coach/memory/format-learning-memory-block.test.ts`

**Interfaces:**

- Consumes: `LearningFeedbackItem` from `@sharpit/server/lib/decision-memory/learning-feedback`; `describeLearningFeedbackItem` from presentation layer
- Produces: `formatLearningMemoryBlock(items: readonly LearningFeedbackItem[]): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { formatLearningMemoryBlock } from './format-learning-memory-block';
import type { LearningFeedbackItem } from '@sharpit/server/lib/decision-memory/learning-feedback';

const harder: LearningFeedbackItem = {
  kind: 'REPEATED_HARDER_THAN_PLANNED',
  type: 'RUN',
  intensity: 'HARD',
  sampleCount: 5,
};

describe('formatLearningMemoryBlock', () => {
  it('returns empty string for empty input', () => {
    expect(formatLearningMemoryBlock([])).toBe('');
  });

  it('returns empty string when only INSUFFICIENT_EVIDENCE', () => {
    expect(
      formatLearningMemoryBlock([
        { kind: 'INSUFFICIENT_EVIDENCE', type: null, intensity: null, sampleCount: 2 },
      ]),
    ).toBe('');
  });

  it('includes header and FR sentence for actionable items', () => {
    const block = formatLearningMemoryBlock([harder]);
    expect(block).toContain('## Apprentissages Decision Memory');
    expect(block).toContain('plus dures que prévu');
  });

  it('caps at 3 actionable items', () => {
    const items: LearningFeedbackItem[] = [
      { ...harder, type: 'RUN' },
      { kind: 'RECOVERED_WITHIN_EXPECTED_WINDOW', type: 'BIKE', intensity: 'EASY', sampleCount: 4 },
      { kind: 'REPEATED_HARDER_THAN_PLANNED', type: 'SWIM', intensity: 'HARD', sampleCount: 3 },
      {
        kind: 'REPEATED_HARDER_THAN_PLANNED',
        type: 'STRENGTH',
        intensity: 'MODERATE',
        sampleCount: 6,
      },
    ];
    const block = formatLearningMemoryBlock(items);
    const bullets = block.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd packages/server && yarn test src/lib/coach/memory/format-learning-memory-block.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { LearningFeedbackItem } from '@sharpit/server/lib/decision-memory/learning-feedback';
import { describeLearningFeedbackItem } from '@sharpit/server/lib/presentation/coaching/learning-feedback';

const MAX_ITEMS = 3;

export function formatLearningMemoryBlock(items: readonly LearningFeedbackItem[]): string {
  const actionable = items
    .filter((item) => item.kind !== 'INSUFFICIENT_EVIDENCE')
    .slice(0, MAX_ITEMS);
  if (actionable.length === 0) {
    return '';
  }
  const lines = actionable.map((item) => `- ${describeLearningFeedbackItem(item).sentence}`);
  return `

## Apprentissages Decision Memory
Patterns issus des séances évaluées — ajuste la prescription si pertinent. Le verdict Twin du jour prime en cas de conflit.

${lines.join('\n')}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat: add learning memory prompt block formatter`

---

### Task 2: loadLearningMemoryBlock + wire plan/adapt

**Files:**

- Create: `packages/server/src/lib/coach/memory/load-learning-memory-block.ts`
- Modify: `packages/server/src/handlers/coach/plan/handler.ts`
- Modify: `packages/server/src/handlers/coach/adapt/handler.ts`

**Interfaces:**

- Consumes: `findRecentEvaluatedOutcomes`, `buildLearningFeedback`, `formatLearningMemoryBlock`
- Produces: `loadLearningMemoryBlock(athleteId: string, now?: Date): Promise<string>`

- [ ] **Step 1: Implement loader**

```ts
import { subDays } from 'date-fns';
import { buildLearningFeedback } from '@sharpit/server/lib/decision-memory/learning-feedback';
import { findRecentEvaluatedOutcomes } from '@sharpit/server/lib/decision-memory/repository';
import { formatLearningMemoryBlock } from '@sharpit/server/lib/coach/memory/format-learning-memory-block';

export const LEARNING_MEMORY_WINDOW_DAYS = 90;

export async function loadLearningMemoryBlock(
  athleteId: string,
  now: Date = new Date(),
): Promise<string> {
  const outcomes = await findRecentEvaluatedOutcomes(
    athleteId,
    subDays(now, LEARNING_MEMORY_WINDOW_DAYS),
  );
  return formatLearningMemoryBlock(buildLearningFeedback(outcomes));
}
```

- [ ] **Step 2: Wire plan handler** — add `memoryBlock: string` to `buildPlanPrompt`; in `preparePlanGeneration` await `loadLearningMemoryBlock(athleteId)` and insert after `contextText`, before `knowledgeBlock`.

- [ ] **Step 3: Wire adapt handler** — same: `memoryBlock` after `formatCoachContext(ctx)`, before `knowledgeBlock`.

- [ ] **Step 4: Typecheck / targeted tests**

Run: `cd packages/server && yarn typecheck && yarn test src/lib/coach/memory/`

- [ ] **Step 5: Commit** `feat: inject Decision Memory learning into plan and adapt prompts`

---

### Task 3: Offline eval harness

**Files:**

- Create: `apps/api/scripts/eval-coach-memory-fixtures.json`
- Create: `apps/api/scripts/eval-coach-memory.ts`
- Modify: `apps/api/package.json` — add `"eval:coach-memory": "tsx scripts/eval-coach-memory.ts"`

**Interfaces:**

- Consumes: `buildLearningFeedback`, `formatLearningMemoryBlock`
- Produces: CLI exit 0/1 + report under `apps/api/.bench/eval-coach-memory-<timestamp>.md`

- [ ] **Step 1: Fixtures** — at least: empty → empty block; insufficient-only → empty; repeated harder → contains "plus dures"; recovered → contains "récupères" / recovery phrasing; >3 actionable → max 3 bullets.

- [ ] **Step 2: Script** — load fixtures, run pipeline, assert `expectBlockEmpty` / `expectBlockContains`, write report, `process.exit(failed ? 1 : 0)`.

- [ ] **Step 3: Run** `yarn api eval:coach-memory` — expect exit 0.

- [ ] **Step 4: Commit** `test: add offline coach memory eval harness`

---

### Task 4: Verify

- [ ] Run `cd packages/server && yarn test src/lib/coach/memory/ src/lib/decision-memory/learning-feedback.test.ts`
- [ ] Run `yarn api eval:coach-memory`
- [ ] Confirm no Core package diffs
