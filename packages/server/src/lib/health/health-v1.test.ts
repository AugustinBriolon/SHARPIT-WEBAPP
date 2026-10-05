import { describe, expect, it } from 'vitest';
import {
  hrvRange,
  projectV1HealthOverview,
  type HealthDailyRow,
  type HealthInputs,
} from './health-v1';
import { healthTrend } from './health-trend';

const now = new Date('2026-09-29T08:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function day(daysBack: number, values: Partial<HealthDailyRow> = {}): HealthDailyRow {
  return {
    date: daysAgo(daysBack),
    restingHr: null,
    hrv: null,
    hrvBaselineLow: null,
    hrvBaselineHigh: null,
    sleepMinutes: null,
    totalSteps: null,
    sleepRespiration: null,
    weightKg: null,
    ...values,
  };
}

function inputs(overrides: Partial<HealthInputs> = {}): HealthInputs {
  return {
    daily: [],
    composition: [],
    profile: {
      birthDate: new Date('1991-04-12T00:00:00.000Z'),
      sex: 'male',
      vo2max: 56,
      vo2maxMeasuredAt: daysAgo(10),
      targetWeightKg: 70,
    },
    biologicalAge: null,
    biologicalAgeAccess: 'pro_required',
    ...overrides,
  };
}

/** A month of steady nights and hearts, then a last week as given. */
function month(lastWeek: Partial<HealthDailyRow>): HealthDailyRow[] {
  return Array.from({ length: 45 }, (_, index) =>
    index < 7
      ? day(index, { restingHr: 48, hrv: 60, sleepMinutes: 450, totalSteps: 9_000, ...lastWeek })
      : day(index, { restingHr: 48, hrv: 60, sleepMinutes: 450, totalSteps: 9_000 }),
  );
}

describe('healthTrend', () => {
  it('calls a change smaller than the noise stable, and names the direction otherwise', () => {
    const points = [
      ...Array.from({ length: 20 }, (_, i) => ({ date: daysAgo(10 + i), value: 50 })),
      ...Array.from({ length: 5 }, (_, i) => ({ date: daysAgo(i), value: 51 })),
    ];
    expect(healthTrend(points, now, { favorable: 'down', noise: 2 })?.tone).toBe('neutral');
    expect(healthTrend(points, now, { favorable: 'down', noise: 0.5 })?.tone).toBe('watch');
    expect(healthTrend(points, now, { favorable: 'up', noise: 0.5 })?.tone).toBe('good');
    expect(healthTrend(points.slice(0, 20), now, { favorable: 'up', noise: 1 })).toBeNull();
  });
});

describe('projectV1HealthOverview', () => {
  it('reads each vital sign against its norm and its month, oldest first in the series', () => {
    const overview = projectV1HealthOverview(inputs({ daily: month({}) }), now);

    expect(overview.vitals.map((m) => m.key)).toEqual(['restingHr', 'hrv', 'sleep', 'vo2max']);
    const [heart] = overview.vitals;
    expect(heart).toMatchObject({ value: 48, unit: 'bpm', basis: 'average7' });
    expect(heart.norm?.band).toBe('athlete');
    expect(heart.trend).toMatchObject({ tone: 'neutral', stable: true });
    expect(heart.series.length).toBe(30);
    expect(heart.series[0].date < heart.series[29].date).toBe(true);
    expect(overview.vitals[3]).toMatchObject({ value: 56, basis: 'latest' });
    expect(overview.daily.map((m) => m.key)).toEqual(['steps']);
    // A quiet month: nothing to watch, every normed marker in its norm.
    expect(overview.watch).toEqual([]);
    expect(overview.synthesis.inNorm).toBe(overview.synthesis.normed);
  });

  it('flags a resting HR up for days, short nights and a falling HRV', () => {
    const overview = projectV1HealthOverview(
      inputs({ daily: month({ restingHr: 55, sleepMinutes: 360, hrv: 40 }) }),
      now,
    );

    expect(overview.watch.map((w) => w.key)).toEqual(['restingHr', 'hrv', 'sleep']);
    expect(overview.watch[0].detail).toContain('+7 bpm');
    expect(overview.watch[0].detail).toContain('7 jours');
    expect(overview.watch[2].detail).toContain('6 h 00');
    expect(overview.synthesis.highlights[0]).toMatchObject({ key: 'restingHr', tone: 'watch' });
  });

  it('flags a fast weight change', () => {
    const composition = [
      { measuredAt: daysAgo(16), weightKg: 74, bodyFatPct: 15, visceralFat: 7, musclePct: 45 },
      { measuredAt: daysAgo(1), weightKg: 72, bodyFatPct: 14.5, visceralFat: 7, musclePct: 45 },
    ];
    const overview = projectV1HealthOverview(inputs({ composition }), now);

    expect(overview.body.map((m) => m.key)).toEqual([
      'weight',
      'bodyFatPct',
      'visceralFat',
      'musclePct',
    ]);
    expect(overview.body[0]).toMatchObject({ value: 72, target: 70 });
    // Weight has no better direction: a change is named, never judged.
    expect(overview.body[0].trend).toMatchObject({ tone: 'neutral', stable: false });
    expect(overview.body[1].norm?.band).toBe('fitness');
    expect(overview.watch).toEqual([
      expect.objectContaining({ key: 'weight', detail: expect.stringContaining('−2 kg') }),
    ]);
  });

  it('gives no norm where it lacks what the norm needs', () => {
    const overview = projectV1HealthOverview(
      inputs({ daily: [day(1, { hrv: 50 })], profile: null }),
      now,
    );
    expect(overview.vitals.map((m) => [m.key, m.norm])).toEqual([['hrv', null]]);
  });
});

describe('hrvRange', () => {
  it('prefers Garmin’s own range, else two months of readings ±1 SD', () => {
    expect(hrvRange([day(1, { hrvBaselineLow: 50, hrvBaselineHigh: 70 })], now)).toEqual({
      low: 50,
      high: 70,
    });
    const own = Array.from({ length: 30 }, (_, i) => day(8 + i, { hrv: i % 2 === 0 ? 50 : 60 }));
    expect(hrvRange(own, now)).toEqual({ low: 50, high: 60 });
    expect(hrvRange(own.slice(0, 5), now)).toBeNull();
  });
});
