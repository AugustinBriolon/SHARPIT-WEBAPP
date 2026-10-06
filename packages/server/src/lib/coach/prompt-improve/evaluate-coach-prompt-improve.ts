/**
 * One mutation → score → keep only if score rises, else rollback.
 * Offline self-improve. Does not write files.
 */

import {
  applyCoachPromptMutation,
  type CoachPromptMutationId,
} from './mutate-coach-prompt-fragment';
import {
  scoreCoachPromptFragment,
  type CoachPromptQualityResult,
} from './score-coach-prompt-fragment';

export type CoachPromptImproveDecision = 'keep' | 'rollback';

export type CoachPromptImproveResult = {
  readonly mutationId: CoachPromptMutationId;
  readonly baseline: CoachPromptQualityResult;
  readonly mutated: CoachPromptQualityResult;
  readonly decision: CoachPromptImproveDecision;
  /** Text to keep when decision is keep; otherwise the untouched baseline. */
  readonly retained: string;
  readonly candidate: string;
};

export function evaluateCoachPromptImprove(
  baseline: string,
  mutationId: CoachPromptMutationId,
): CoachPromptImproveResult {
  const baselineScore = scoreCoachPromptFragment(baseline);
  const candidate = applyCoachPromptMutation(baseline, mutationId);
  const mutatedScore = scoreCoachPromptFragment(candidate);
  const decision: CoachPromptImproveDecision =
    mutatedScore.score > baselineScore.score ? 'keep' : 'rollback';

  return {
    mutationId,
    baseline: baselineScore,
    mutated: mutatedScore,
    decision,
    retained: decision === 'keep' ? candidate : baseline,
    candidate,
  };
}
