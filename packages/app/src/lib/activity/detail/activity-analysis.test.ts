import { describe, expect, it } from 'vitest';
import {
  analyzeActivityStreams,
  powerZoneIndex,
  type AthleteThresholds,
} from '@sharpit/app/lib/activity/detail/activity-analysis';

const THRESHOLDS: AthleteThresholds = {
  ftp: 280,
  maxHr: 190,
  lthr: 170,
  runThresholdPaceSecPerKm: 270,
  source: 'profile',
};

describe('analyzeActivityStreams splits', () => {
  it('labels the final run split with the actual remaining distance', () => {
    const analysis = analyzeActivityStreams(
      {
        time: [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3240],
        distance: [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 10800],
        heartrate: [150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161],
        watts: [],
        velocity: [3.33, 3.33, 3.33, 3.33, 3.33, 3.33, 3.33, 3.33, 3.33, 3.33, 3.33, 3.33],
        altitude: [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5],
      },
      THRESHOLDS,
      { type: 'RUN', durationSec: 3240, bikeNormalizedPower: null, bikeIntensityFactor: null },
    );

    expect(analysis?.run?.splits.at(-1)?.label).toBe('10,8 km');
  });

  it('labels the final bike split with the actual remaining distance', () => {
    const analysis = analyzeActivityStreams(
      {
        time: [0, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4800, 5400],
        distance: [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 40900],
        heartrate: [140, 142, 144, 145, 146, 147, 148, 149, 150, 151],
        watts: [210, 215, 220, 225, 230, 228, 226, 224, 222, 220],
        velocity: [8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 2.5],
        altitude: [0, 5, 8, 12, 13, 15, 18, 19, 20, 20],
      },
      THRESHOLDS,
      { type: 'BIKE', durationSec: 5400, bikeNormalizedPower: null, bikeIntensityFactor: null },
    );

    expect(analysis?.bike?.splits.at(-1)?.label).toBe('40,9 km');
  });
});

describe('powerZoneIndex', () => {
  it('places a wattage in its zone by share of FTP', () => {
    expect(powerZoneIndex(100, 200)).toBe(0);
    expect(powerZoneIndex(130, 200)).toBe(1);
    expect(powerZoneIndex(200, 200)).toBe(3);
    expect(powerZoneIndex(400, 200)).toBe(6);
  });
});
