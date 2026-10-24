import { describe, it, expect } from 'vitest';
import { garminHealthToObservations } from './garmin-health-adapter';
import type { GarminDailyHealth } from '@sharpit/server/lib/integrations/garmin/garmin';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

// 2026-07-02 midnight UTC (= midnight local, per convention in garmin-sync.ts)
const CALENDAR_DATE = new Date('2026-07-02T00:00:00Z');
const RECEIVED_AT = new Date('2026-07-02T10:00:00Z');

const EMPTY_SLEEP = {
  sleepMinutes: null,
  napMinutes: null,
  sleepScore: null,
  sleepDeepMin: null,
  sleepLightMin: null,
  sleepRemMin: null,
  sleepAwakeMin: null,
  sleepBedtimeMin: null,
  sleepWakeMin: null,
  sleepRespiration: null,
  sleepAvgStress: null,
  sleepScoreFeedback: null,
};

function buildHealth(overrides: Partial<GarminDailyHealth> = {}): GarminDailyHealth {
  return {
    date: '2026-07-02',
    sleepMinutes: null,
    napMinutes: null,
    restingHr: null,
    hrv: null,
    weightKg: null,
    readinessScore: null,
    readinessLevel: null,
    readinessFeedback: null,
    readinessFactors: null,
    hrvStatus: null,
    hrvBaselineLow: null,
    hrvBaselineHigh: null,
    stress: null,
    bodyBattery: null,
    totalSteps: null,
    sleep: EMPTY_SLEEP,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty health record
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — empty health', () => {
  it('returns empty array when no health data is present', () => {
    const result = garminHealthToObservations(buildHealth(), CALENDAR_DATE, RECEIVED_AT);
    expect(result).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sleep
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — SLEEP', () => {
  it('produces a SLEEP observation when sleepMinutes is set', () => {
    const health = buildHealth({
      sleepMinutes: 450,
      sleep: {
        ...EMPTY_SLEEP,
        sleepBedtimeMin: 1380, // 23:00 local
        sleepWakeMin: 390, // 06:30 local
        sleepDeepMin: 90,
        sleepRemMin: 100,
        sleepLightMin: 240,
        sleepAwakeMin: 20,
        sleepScore: 78,
      },
    });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const sleep = observations.find((o) => o.type === 'SLEEP');

    expect(sleep).toBeDefined();
    if (sleep?.type !== 'SLEEP') {
      return;
    }

    expect(sleep.totalMinutes).toBe(450);
    expect(sleep.deepMin).toBe(90);
    expect(sleep.remMin).toBe(100);
    expect(sleep.garminScore).toBe(78);

    // Bedtime: 23:00 of the PREVIOUS day (1380 >= 720 → previous day)
    // calendarDate = 2026-07-02 00:00 UTC
    // previous day = 2026-07-01 00:00 UTC + 1380 min = 2026-07-01 23:00 UTC
    expect(sleep.timestamp.toISOString()).toBe('2026-07-01T23:00:00.000Z');

    // Wake: 06:30 of the calendar date
    // calendarDate + 390 min = 2026-07-02 06:30 UTC
    expect(sleep.wakeTimestamp.toISOString()).toBe('2026-07-02T06:30:00.000Z');
  });

  it('handles after-midnight bedtime correctly (sleepBedtimeMin < 720)', () => {
    const health = buildHealth({
      sleepMinutes: 300,
      sleep: {
        ...EMPTY_SLEEP,
        sleepBedtimeMin: 30, // 00:30 same calendar day
        sleepWakeMin: 330, // 05:30
      },
    });
    const [sleep] = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    expect(sleep?.type).toBe('SLEEP');
    if (sleep?.type !== 'SLEEP') {
      return;
    }
    // Bedtime: 2026-07-02 00:30 UTC (same day, < 720)
    expect(sleep.timestamp.toISOString()).toBe('2026-07-02T00:30:00.000Z');
    // Wake: 2026-07-02 05:30 UTC
    expect(sleep.wakeTimestamp.toISOString()).toBe('2026-07-02T05:30:00.000Z');
  });

  it('adds nap minutes to total sleep duration for recovery', () => {
    const health = buildHealth({
      sleepMinutes: 420,
      napMinutes: 30,
      sleep: {
        ...EMPTY_SLEEP,
        sleepWakeMin: 390,
        napMinutes: 30,
      },
    });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const sleep = observations.find((o) => o.type === 'SLEEP');
    expect(sleep?.type).toBe('SLEEP');
    if (sleep?.type !== 'SLEEP') {
      return;
    }
    expect(sleep.totalMinutes).toBe(450);
  });

  it('produces SLEEP observation when only a nap is recorded', () => {
    const health = buildHealth({
      sleepMinutes: null,
      napMinutes: 25,
      sleep: { ...EMPTY_SLEEP, napMinutes: 25 },
    });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const sleep = observations.find((o) => o.type === 'SLEEP');
    expect(sleep?.type).toBe('SLEEP');
    if (sleep?.type !== 'SLEEP') {
      return;
    }
    expect(sleep.totalMinutes).toBe(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HRV
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — HRV', () => {
  it('produces an HRV observation with OVERNIGHT_AVERAGE method', () => {
    const health = buildHealth({
      hrv: 58,
      hrvStatus: 'BALANCED',
      hrvBaselineLow: 48,
      hrvBaselineHigh: 70,
      sleep: { ...EMPTY_SLEEP, sleepWakeMin: 390 },
    });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const hrv = observations.find((o) => o.type === 'HRV');

    expect(hrv).toBeDefined();
    if (hrv?.type !== 'HRV') {
      return;
    }
    expect(hrv.valueMsRmssd).toBe(58);
    expect(hrv.measurementMethod).toBe('OVERNIGHT_AVERAGE');
    expect(hrv.garminStatus).toBe('BALANCED');
    expect(hrv.garminBaselineLow).toBe(48);
    expect(hrv.garminBaselineHigh).toBe(70);
    // Timestamp = wake time = calendarDate + 390 min = 06:30 UTC
    expect(hrv.timestamp.toISOString()).toBe('2026-07-02T06:30:00.000Z');
  });

  it('falls back to 06:00 when no wake time is available', () => {
    const health = buildHealth({ hrv: 52 });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const hrv = observations.find((o) => o.type === 'HRV');
    expect(hrv?.timestamp.toISOString()).toBe('2026-07-02T06:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resting HR
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — RESTING_HR', () => {
  it('produces a RESTING_HR observation', () => {
    const health = buildHealth({ restingHr: 48 });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const rhr = observations.find((o) => o.type === 'RESTING_HR');
    expect(rhr).toBeDefined();
    if (rhr?.type !== 'RESTING_HR') {
      return;
    }
    expect(rhr.valueBpm).toBe(48);
  });

  it('skips RESTING_HR when value is 0 or null', () => {
    const health = buildHealth({ restingHr: 0 });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    expect(observations.find((o) => o.type === 'RESTING_HR')).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Garmin Readiness
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — GARMIN_READINESS', () => {
  it('produces a GARMIN_READINESS observation with correct fields', () => {
    const health = buildHealth({
      readinessScore: 72,
      readinessLevel: 'HIGH',
      readinessFeedback: 'READY',
      readinessFactors: [
        { key: 'HRV', percent: 80, feedback: 'GOOD' },
        { key: 'SLEEP', percent: 70, feedback: 'OK' },
      ],
    });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const readiness = observations.find((o) => o.type === 'GARMIN_READINESS');

    expect(readiness).toBeDefined();
    if (readiness?.type !== 'GARMIN_READINESS') {
      return;
    }
    expect(readiness.score).toBe(72);
    expect(readiness.level).toBe('HIGH');
    expect(readiness.feedbackCode).toBe('READY');
    expect(readiness.contributingFactors).toEqual(['HRV', 'SLEEP']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Body Battery
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — GARMIN_BATTERY', () => {
  it('produces a GARMIN_BATTERY observation', () => {
    const health = buildHealth({ bodyBattery: 85 });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    const battery = observations.find((o) => o.type === 'GARMIN_BATTERY');

    expect(battery).toBeDefined();
    if (battery?.type !== 'GARMIN_BATTERY') {
      return;
    }
    expect(battery.peakValue).toBe(85);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full health record
// ─────────────────────────────────────────────────────────────────────────────

describe('garminHealthToObservations — full record', () => {
  it('produces 5 observations when all fields are present', () => {
    const health = buildHealth({
      sleepMinutes: 450,
      hrv: 58,
      restingHr: 48,
      readinessScore: 70,
      bodyBattery: 80,
      sleep: {
        ...EMPTY_SLEEP,
        sleepBedtimeMin: 1380,
        sleepWakeMin: 390,
        sleepScore: 75,
      },
    });
    const observations = garminHealthToObservations(health, CALENDAR_DATE, RECEIVED_AT);
    expect(observations).toHaveLength(5);

    const types = observations.map((o) => o.type);
    expect(types).toContain('SLEEP');
    expect(types).toContain('HRV');
    expect(types).toContain('RESTING_HR');
    expect(types).toContain('GARMIN_READINESS');
    expect(types).toContain('GARMIN_BATTERY');
  });
});

describe('garminHealthToObservations source', () => {
  it('labels a day filled by Apple Health as such', async () => {
    const { garminHealthToObservations } = await import('./garmin-health-adapter');
    const day = {
      date: '2026-09-28',
      sleepMinutes: 450,
      napMinutes: null,
      restingHr: 48,
      hrv: 62,
      weightKg: null,
      readinessScore: null,
      readinessLevel: null,
      readinessFeedback: null,
      readinessFactors: null,
      hrvStatus: null,
      hrvBaselineLow: null,
      hrvBaselineHigh: null,
      stress: null,
      bodyBattery: null,
      totalSteps: null,
      sleep: {
        sleepMinutes: 450,
        napMinutes: null,
        sleepScore: null,
        sleepDeepMin: null,
        sleepLightMin: null,
        sleepRemMin: null,
        sleepAwakeMin: null,
        sleepBedtimeMin: 1_380,
        sleepWakeMin: 390,
        sleepRespiration: null,
        sleepAvgStress: null,
        sleepScoreFeedback: null,
      },
    };
    const date = new Date('2026-09-28T00:00:00.000Z');

    const observations = garminHealthToObservations(day as never, date, date, 'APPLE_HEALTH');

    expect(observations.map((o) => o.type).sort()).toEqual(['HRV', 'RESTING_HR', 'SLEEP']);
    expect(new Set(observations.map((o) => o.source))).toEqual(new Set(['APPLE_HEALTH']));
    expect(
      garminHealthToObservations(day as never, date, date).every((o) => o.source === 'GARMIN'),
    ).toBe(true);
  });
});
