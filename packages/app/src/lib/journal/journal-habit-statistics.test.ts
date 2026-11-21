import { describe, expect, it } from 'vitest';
import {
  baselineAdjuster,
  weekendAdjuster,
  benjaminiHochberg,
  loadAdjuster,
  mannWhitneyPValue,
} from '@sharpit/app/lib/journal/journal-habit-statistics';

describe('journal-habit-statistics', () => {
  it('finds a clean separation unlikely as chance, and overlapping groups likely', () => {
    expect(mannWhitneyPValue([1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12])).toBeLessThan(0.01);
    expect(mannWhitneyPValue([1, 4, 6, 8, 10], [2, 3, 5, 7, 9])).toBeGreaterThan(0.5);
    expect(mannWhitneyPValue([5, 5, 5], [5, 5, 5])).toBe(1);
    expect(mannWhitneyPValue([], [1])).toBe(1);
  });

  it('matches the textbook value for a small sample (scipy, continuity-corrected)', () => {
    // scipy.stats.mannwhitneyu([1,2,3,4,5],[6,7,8,9,10], method='asymptotic') → p ≈ 0.0122
    expect(mannWhitneyPValue([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])).toBeCloseTo(0.0122, 3);
  });

  it('adjusts p-values for the number of contrasts, monotone in rank', () => {
    const q = benjaminiHochberg([0.01, 0.04, 0.03, 0.5]);
    expect(q[0]).toBeCloseTo(0.04);
    expect(q[2]).toBeCloseTo(0.0533, 3);
    expect(q[1]).toBeCloseTo(0.0533, 3);
    expect(q[3]).toBeCloseTo(0.5);
  });

  it('removes the load slope and keeps values at the average load unchanged', () => {
    const points = Array.from({ length: 12 }, (_, i) => ({ load: i * 10, value: 80 - i * 2 }));
    const adjust = loadAdjuster(points)!;
    expect(adjust(80, 0)).toBeCloseTo(69);
    expect(adjust(58, 110)).toBeCloseTo(69);
    expect(loadAdjuster(points.slice(0, 5))).toBeNull();
    expect(loadAdjuster(points.map((p) => ({ ...p, load: 50 })))).toBeNull();
  });
});

describe('weekendAdjuster', () => {
  it('removes the gap between weekend and weekday mornings', () => {
    const points = [
      ...[480, 500, 490, 510].map((value) => ({ weekend: true, value })),
      ...[420, 430, 410, 440].map((value) => ({ weekend: false, value })),
    ];
    const adjust = weekendAdjuster(points)!;
    expect(adjust(495, true)).toBeCloseTo(425, 6);
    expect(adjust(425, false)).toBe(425);
  });

  it('says nothing from too few weekend mornings', () => {
    const points = [
      { weekend: true, value: 480 },
      ...[420, 430, 410, 440].map((value) => ({ weekend: false, value })),
    ];
    expect(weekendAdjuster(points)).toBeNull();
  });

  it('reads a morning against the mornings around it, not against another season', () => {
    // 30 mornings at 50, then 30 at 70: each is ordinary for its own block.
    const points = Array.from({ length: 60 }, (_, dayIndex) => ({
      dayIndex,
      value: dayIndex < 30 ? 50 : 70,
    }));
    const adjust = baselineAdjuster(points)!;
    expect(adjust(50, 5)).toBe(adjust(70, 50));
    // A morning ten points under its own block stays ten points under.
    expect(adjust(60, 50) - adjust(70, 51)).toBe(-10);
    // Too few mornings around: read as it is.
    const sparse = baselineAdjuster([...points, { dayIndex: 200, value: 90 }])!;
    expect(sparse(90, 200)).toBe(90);
    expect(baselineAdjuster(points.slice(0, 3))).toBeNull();
  });
});
