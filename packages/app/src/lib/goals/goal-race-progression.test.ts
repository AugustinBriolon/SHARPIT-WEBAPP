import { describe, expect, it } from 'vitest';
import {
  legTrend,
  raceDayFactor,
  regularityScore,
  volumeSteadiness,
} from '@sharpit/app/lib/goals/goal-race-progression';

const AS_OF = new Date('2026-10-12T00:00:00Z');

function weeksAgo(weeks: number): Date {
  return new Date(AS_OF.getTime() - weeks * 7 * 86_400_000 - 86_400_000);
}

describe('regularity', () => {
  it('is null with neither a plan nor training', () => {
    expect(regularityScore({ plannedSessions: [], trainingVolume: [] }, AS_OF)).toBeNull();
  });

  it('is 1 − CV of weekly volume without a plan', () => {
    const steady = Array.from({ length: 8 }, (_, week) => ({
      date: weeksAgo(week),
      durationSec: 3600,
    }));
    expect(volumeSteadiness(steady, AS_OF)).toBe(1);
    expect(volumeSteadiness([steady[0]], AS_OF)).toBe(0);
  });

  it('blends plan adherence (60 %) with steadiness (40 %)', () => {
    const steady = Array.from({ length: 8 }, (_, week) => ({
      date: weeksAgo(week),
      durationSec: 3600,
    }));
    const plannedSessions = [true, true, true, false].map((completed, i) => ({
      day: weeksAgo(i).toISOString().slice(0, 10),
      completed,
      brickGroupId: null,
    }));
    expect(regularityScore({ plannedSessions, trainingVolume: steady }, AS_OF)).toBeCloseTo(
      0.6 * 0.75 + 0.4,
    );
  });
});

describe('legTrend', () => {
  it('needs 3 points over 3 weeks', () => {
    expect(
      legTrend([
        { date: weeksAgo(1), sec: 100 },
        { date: weeksAgo(0), sec: 99 },
      ]),
    ).toBeNull();
  });

  it('is the relative least-squares slope per week', () => {
    const trend = legTrend(
      [0, 1, 2, 3].map((week) => ({ date: weeksAgo(3 - week), sec: 1000 - 10 * week })),
    )!;
    expect(trend.perWeek).toBeCloseTo(-10 / 985);
    expect(trend.spanWeeks).toBeCloseTo(3);
  });
});

describe('raceDayFactor', () => {
  it('weights the trend by regularity and caps it at 1 %/week and 6 %', () => {
    expect(raceDayFactor({ perWeek: -0.004, spanWeeks: 8 }, 0.5, 4)).toBeCloseTo(1 - 0.008);
    expect(raceDayFactor({ perWeek: -0.05, spanWeeks: 8 }, 1, 4)).toBeCloseTo(0.96);
    expect(raceDayFactor({ perWeek: -0.05, spanWeeks: 8 }, 1, 20)).toBeCloseTo(0.94);
  });

  it('never predicts a slowdown beyond the one observed', () => {
    expect(raceDayFactor({ perWeek: 0.005, spanWeeks: 4 }, 1, 20)).toBeCloseTo(1.02);
  });

  it('is neutral without a trend or once the race has come', () => {
    expect(raceDayFactor(null, 1, 10)).toBe(1);
    expect(raceDayFactor({ perWeek: -0.01, spanWeeks: 8 }, 1, 0)).toBe(1);
  });
});
