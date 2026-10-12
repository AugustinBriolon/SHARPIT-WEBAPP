import { describe, expect, it } from 'vitest';
import { computeTargetStrainBand } from '../model';

describe('computeTargetStrainBand', () => {
  it('returns null without signals', () => {
    expect(
      computeTargetStrainBand({
        readinessScore: null,
        recentStrainScores: [],
        todayStrainScore: null,
      }),
    ).toBeNull();
  });

  it('classifies within the band', () => {
    const band = computeTargetStrainBand({
      readinessScore: 70,
      recentStrainScores: [8, 9, 10, 8],
      todayStrainScore: 9,
    })!;
    expect(band.status).toBe('within');
    expect(band.low).toBeLessThan(band.high);
  });

  it('raises the band when readiness is high', () => {
    const low = computeTargetStrainBand({
      readinessScore: 40,
      recentStrainScores: [10, 10, 10],
      todayStrainScore: 10,
    })!;
    const high = computeTargetStrainBand({
      readinessScore: 90,
      recentStrainScores: [10, 10, 10],
      todayStrainScore: 10,
    })!;
    expect(high.low).toBeGreaterThan(low.low);
  });
});
