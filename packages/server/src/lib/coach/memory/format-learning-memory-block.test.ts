import { describe, expect, it } from 'vitest';
import type { LearningFeedbackItem } from '@sharpit/server/lib/decision-memory/learning-feedback';
import { formatLearningMemoryBlock } from './format-learning-memory-block';

const harder: LearningFeedbackItem = {
  kind: 'REPEATED_HARDER_THAN_PLANNED',
  type: 'RUN',
  intensity: 'THRESHOLD',
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
      {
        kind: 'RECOVERED_WITHIN_EXPECTED_WINDOW',
        type: 'BIKE',
        intensity: 'ENDURANCE',
        sampleCount: 4,
      },
      {
        kind: 'REPEATED_HARDER_THAN_PLANNED',
        type: 'SWIM',
        intensity: 'THRESHOLD',
        sampleCount: 3,
      },
      {
        kind: 'REPEATED_HARDER_THAN_PLANNED',
        type: 'STRENGTH',
        intensity: 'TEMPO',
        sampleCount: 6,
      },
    ];
    const block = formatLearningMemoryBlock(items);
    const bullets = block.split('\n').filter((line) => line.startsWith('- '));
    expect(bullets).toHaveLength(3);
  });
});
