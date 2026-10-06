import { describe, expect, it } from 'vitest';
import { COACH_COPY_DASH_RULE } from '@sharpit/app/lib/coach/sanitize-coach-copy';
import { DAY_LOAD_VS_STATUS_COACH_LINE } from '@sharpit/server/lib/coach/context/coach-context-format';
import { evaluateCoachPromptImprove } from './evaluate-coach-prompt-improve';
import {
  applyCoachPromptMutation,
  CONFIDENCE_REFUSE_COACH_LINE,
  MEDICAL_BOUNDARY_COACH_LINE,
} from './mutate-coach-prompt-fragment';
import { scoreCoachPromptFragment } from './score-coach-prompt-fragment';

const FULL_FRAGMENT = [
  DAY_LOAD_VS_STATUS_COACH_LINE,
  CONFIDENCE_REFUSE_COACH_LINE,
  MEDICAL_BOUNDARY_COACH_LINE,
  COACH_COPY_DASH_RULE,
].join('\n');

describe('scoreCoachPromptFragment', () => {
  it('scores a complete fragment at 100', () => {
    expect(scoreCoachPromptFragment(FULL_FRAGMENT)).toEqual({ score: 100, flags: [] });
  });

  it('deducts for a missing day-load vocabulary line', () => {
    const without = FULL_FRAGMENT.replace(DAY_LOAD_VS_STATUS_COACH_LINE, '').trim();
    const result = scoreCoachPromptFragment(without);
    expect(result.flags).toContain('missing_day_load_vocab');
    expect(result.score).toBeLessThan(100);
  });

  it('flags conflation when overtraining appears without day-load vocabulary', () => {
    const result = scoreCoachPromptFragment(
      'Risque de surentraînement : baisse la charge immédiatement.',
    );
    expect(result.flags).toContain('conflates_day_and_status');
  });
});

describe('applyCoachPromptMutation', () => {
  it('appends the day-load line once', () => {
    const once = applyCoachPromptMutation('Base.', 'add-day-load-vocab');
    expect(once).toContain(DAY_LOAD_VS_STATUS_COACH_LINE);
    expect(applyCoachPromptMutation(once, 'add-day-load-vocab')).toBe(once);
  });

  it('strips day-load lines on weaken', () => {
    const weakened = applyCoachPromptMutation(FULL_FRAGMENT, 'weaken-day-load');
    expect(weakened).not.toMatch(/charge du jour/i);
  });
});

describe('evaluateCoachPromptImprove', () => {
  it('keeps a mutation that raises the score', () => {
    const degraded = [
      CONFIDENCE_REFUSE_COACH_LINE,
      MEDICAL_BOUNDARY_COACH_LINE,
      COACH_COPY_DASH_RULE,
    ].join('\n');
    const result = evaluateCoachPromptImprove(degraded, 'add-day-load-vocab');
    expect(result.decision).toBe('keep');
    expect(result.mutated.score).toBeGreaterThan(result.baseline.score);
    expect(result.retained).toContain(DAY_LOAD_VS_STATUS_COACH_LINE);
  });

  it('rolls back a mutation that lowers the score', () => {
    const result = evaluateCoachPromptImprove(FULL_FRAGMENT, 'weaken-day-load');
    expect(result.decision).toBe('rollback');
    expect(result.mutated.score).toBeLessThan(result.baseline.score);
    expect(result.retained).toBe(FULL_FRAGMENT);
  });
});
