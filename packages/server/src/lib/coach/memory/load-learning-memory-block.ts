import { subDays } from 'date-fns';
import { formatLearningMemoryBlock } from '@sharpit/server/lib/coach/memory/format-learning-memory-block';
import { buildLearningFeedback } from '@sharpit/server/lib/decision-memory/learning-feedback';
import { findRecentEvaluatedOutcomes } from '@sharpit/server/lib/decision-memory/repository';

/** Same window as the weekly coaching brief learning feedback. */
export const LEARNING_MEMORY_WINDOW_DAYS = 90;

/**
 * Loads recent evaluated Decision Memory outcomes and formats the coach prompt block.
 * Returns '' when evidence is weak or absent.
 */
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
