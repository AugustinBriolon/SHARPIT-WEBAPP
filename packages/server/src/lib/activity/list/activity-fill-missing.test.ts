import { describe, expect, it } from 'vitest';
import {
  fillMissingActivityUpdate,
  fillMissingMetricUpdate,
  fillMissingScalar,
  isBlankActivityValue,
} from './activity-fill-missing';

describe('isBlankActivityValue', () => {
  it('treats null, undefined, empty string and NaN as blank', () => {
    expect(isBlankActivityValue(null)).toBe(true);
    expect(isBlankActivityValue(undefined)).toBe(true);
    expect(isBlankActivityValue('')).toBe(true);
    expect(isBlankActivityValue('  ')).toBe(true);
    expect(isBlankActivityValue(Number.NaN)).toBe(true);
    expect(isBlankActivityValue(0)).toBe(false);
    expect(isBlankActivityValue('Run')).toBe(false);
  });
});

describe('fillMissingScalar', () => {
  it('keeps an existing value and ignores the incoming one', () => {
    expect(fillMissingScalar('Garmin run', 'Strava run')).toBeUndefined();
    expect(fillMissingScalar(40, 42)).toBeUndefined();
  });

  it('takes the incoming value only when the existing one is blank', () => {
    expect(fillMissingScalar(null, 'Strava run')).toBe('Strava run');
    expect(fillMissingScalar(undefined, 42)).toBe(42);
    expect(fillMissingScalar(null, null)).toBeUndefined();
  });
});

describe('fillMissingMetricUpdate', () => {
  it('fills only blank metric columns', () => {
    expect(
      fillMissingMetricUpdate(
        { distanceM: 5000, avgHr: null, elevationM: 40 },
        { distanceM: 5100, avgHr: 148, elevationM: 55, cadence: 170 },
      ),
    ).toEqual({ avgHr: 148, cadence: 170 });
  });

  it('returns the whole update when no metrics row exists yet', () => {
    expect(fillMissingMetricUpdate(null, { distanceM: 5000, avgHr: 140 })).toEqual({
      distanceM: 5000,
      avgHr: 140,
    });
  });
});

describe('fillMissingActivityUpdate', () => {
  it('always applies provider ids and source, fills blank scalars only', () => {
    const update = fillMissingActivityUpdate(
      {
        title: 'Morning run',
        duration: 2400,
        load: null,
        rpe: null,
        feeling: null,
        notes: null,
        runMetrics: { distanceM: 5000, avgHr: null },
      },
      {
        stravaId: '99',
        source: 'both',
        title: 'Evening jog',
        duration: 2500,
        load: 62,
        runMetrics: {
          upsert: {
            create: { distanceM: 5100, avgHr: 150 },
            update: { distanceM: 5100, avgHr: 150 },
          },
        },
      },
      { always: ['stravaId', 'source'] },
    );

    expect(update).toEqual({
      stravaId: '99',
      source: 'both',
      load: 62,
      runMetrics: {
        upsert: {
          create: { distanceM: 5100, avgHr: 150 },
          update: { avgHr: 150 },
        },
      },
    });
  });

  it('creates sport metrics when the primary row has none', () => {
    const update = fillMissingActivityUpdate(
      { title: 'Ride', duration: 3600, runMetrics: null, bikeMetrics: null },
      {
        bikeMetrics: {
          upsert: {
            create: { distanceM: 40_000, avgPower: 200 },
            update: { distanceM: 40_000, avgPower: 200 },
          },
        },
      },
    );

    expect(update.bikeMetrics).toEqual({
      upsert: {
        create: { distanceM: 40_000, avgPower: 200 },
        update: { distanceM: 40_000, avgPower: 200 },
      },
    });
  });
});
