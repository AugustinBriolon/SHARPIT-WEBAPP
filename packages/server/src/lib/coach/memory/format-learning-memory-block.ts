import type { LearningFeedbackItem } from '@sharpit/server/lib/decision-memory/learning-feedback';
import { describeLearningFeedbackItem } from '@sharpit/server/lib/presentation/coaching/learning-feedback';

const MAX_ITEMS = 3;

/**
 * Prompt block for plan/adapt from Decision Memory learning patterns.
 * Empty when there is no actionable evidence (typed refuse — same spirit as knowledge RAG).
 */
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
