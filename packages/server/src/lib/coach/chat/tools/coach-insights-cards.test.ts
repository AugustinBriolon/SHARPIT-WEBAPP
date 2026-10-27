import { describe, expect, it } from 'vitest';
import { coachDataCardSchema } from '@sharpit/app/lib/coach/chat/cards/coach-data-cards';
import type { V1DayScores } from '@sharpit/server/lib/presentation/v1/day-scores';
import { dayScoresCard, roundedBand, roundedScore } from './coach-insights-cards';

const scores = {
  stress: { value: 38.4 },
  energyBank: { value: 70.6, typicalBaseline: 64.2 },
  targetBand: { low: 7.6, high: 12.4, status: 'within' },
  strainPerformance: null,
} as unknown as V1DayScores;

describe('coach insight data cards', () => {
  it('rounds every figure the way the markdown states it', () => {
    const card = dayScoresCard('2026-10-27', scores, 65.5);

    expect(card).toMatchObject({
      energyBank: { value: 71, typicalBaseline: 64 },
      stress: 38,
      targetBand: { low: 8, high: 12, status: 'within' },
      readiness: 66,
    });
    expect(coachDataCardSchema.safeParse(card).success).toBe(true);
  });

  it('leaves a missing score null instead of drawing it as zero', () => {
    const card = dayScoresCard(
      '2026-10-27',
      { stress: null, energyBank: null, targetBand: null, strainPerformance: null },
      null,
    );

    expect(card).toMatchObject({
      energyBank: null,
      stress: null,
      targetBand: null,
      readiness: null,
    });
    expect(roundedScore(undefined)).toBeNull();
  });

  it('keeps the band status', () => {
    expect(roundedBand({ low: 1, high: 2, status: null } as never).status).toBeNull();
  });
});
