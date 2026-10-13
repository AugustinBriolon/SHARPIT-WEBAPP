import { describe, expect, it } from 'vitest';
import {
  decayedBest,
  raceTargetHr,
  robustLine,
  smoothedWeekly,
  paceAtHr,
} from '@sharpit/app/lib/goals/goal-race-capacity';

const AS_OF = new Date('2026-10-11T00:00:00Z');
const weeksAgo = (weeks: number) => new Date(AS_OF.getTime() - weeks * 7 * 86_400_000);

describe('raceTargetHr', () => {
  it('takes a share of LTHR, else of LTHR estimated from max HR', () => {
    expect(raceTargetHr({ lthr: 165, maxHr: 190 }, 0.93)).toBeCloseTo(153.45);
    expect(raceTargetHr({ lthr: null, maxHr: 190 }, 0.93)).toBeCloseTo(0.87 * 190, 0);
    expect(raceTargetHr({ lthr: null, maxHr: null }, 0.93)).toBeNull();
  });
});

describe('HR curve', () => {
  const points = [130, 135, 140, 145, 150].map((hr) => ({ hr, value: 600 - 2 * hr }));

  it('fits a robust line that one outlier does not bend', () => {
    expect(robustLine([...points, { hr: 142, value: 900 }])?.slope).toBeCloseTo(-2);
  });

  it('reads the value at the target HR, extrapolating at most 15 bpm', () => {
    expect(paceAtHr(points, 155)).toBeCloseTo(290);
    expect(paceAtHr(points, 190)).toBeCloseTo(600 - 2 * 165);
  });

  it('needs 5 points and pace falling as HR rises', () => {
    expect(paceAtHr(points.slice(0, 4), 150)).toBeNull();
    expect(
      paceAtHr(
        points.map((point) => ({ ...point, value: 2 * point.hr })),
        150,
      ),
    ).toBeNull();
    expect(paceAtHr(points, null)).toBeNull();
  });

  it('refuses a fit HR explains too little of (|r| < 0.4)', () => {
    const noisy = [130, 135, 140, 145, 150, 132, 148].map((hr, i) => ({
      hr,
      value: 330 - 0.2 * hr + [40, -35, 30, -45, 25, -30, 38][i],
    }));
    expect(paceAtHr(noisy, 155)).toBeNull();
  });
});

describe('decayedBest', () => {
  it('slows each reference by 0.5 % per 4 weeks of age', () => {
    expect(decayedBest([{ date: weeksAgo(8), sec: 1000 }], AS_OF)).toBeCloseTo(1010);
    expect(
      decayedBest(
        [
          { date: weeksAgo(20), sec: 990 },
          { date: weeksAgo(1), sec: 1000 },
        ],
        AS_OF,
      ),
    ).toBeCloseTo(1001.25);
  });
});

describe('smoothedWeekly', () => {
  it('keeps one EWMA point per week with data, oldest first', () => {
    const series = smoothedWeekly(
      [
        { date: weeksAgo(2.5), sec: 100 },
        { date: weeksAgo(2.2), sec: 90 },
        { date: weeksAgo(0.5), sec: 80 },
      ],
      AS_OF,
      (week) => Math.min(...week),
    );
    expect(series.map((point) => Math.round(point.sec))).toEqual([90, 86]);
  });
});
