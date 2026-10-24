import { describe, expect, it } from 'vitest';
import {
  isGarminSessionActivity,
  pushedActivityToConnect,
  pushedBodyCompToHealth,
  pushedDailyToHealth,
  pushedDetailsToRawStreams,
  pushedHrvToHealth,
  pushedSleepToHealth,
  pushedUserMetricsToProfile,
} from './garmin-push-mappers';

// Shapes from docs/garmin/Activity_API 2.0_0.pdf and Health_API_2.0.pdf.
const RUN = {
  userId: 'u1',
  summaryId: '5001968355',
  activityId: 5001968355,
  activityType: 'RUNNING',
  activityName: 'Olathe RUNNING',
  startTimeInSeconds: 1452470400, // 2016-01-11 00:00 UTC
  startTimeOffsetInSeconds: 3600,
  durationInSeconds: 3600,
  distanceInMeters: 10000,
  averageSpeedInMetersPerSecond: 2.78,
  averageHeartRateInBeatsPerMinute: 144,
  activeKilocalories: 448,
};

describe('pushedActivityToConnect', () => {
  it('maps a pushed run onto the Connect activity the import reads, on the device clock', () => {
    const activity = pushedActivityToConnect(RUN);
    expect(activity).toMatchObject({
      activityId: 5001968355,
      activityName: 'Olathe RUNNING',
      activityType: { typeKey: 'running' },
      startTimeLocal: '2016-01-11 01:00:00',
      duration: 3600,
      distance: 10000,
      averageHR: 144,
    });
  });

  it('skips a summary without a start time', () => {
    expect(pushedActivityToConnect({ ...RUN, startTimeInSeconds: undefined })).toBeNull();
  });
});

describe('isGarminSessionActivity', () => {
  it('keeps the legs and drops a multisport parent and its transitions', () => {
    expect(isGarminSessionActivity(RUN)).toBe(true);
    expect(isGarminSessionActivity({ ...RUN, activityType: 'MULTI_SPORT', isParent: true })).toBe(
      false,
    );
    expect(isGarminSessionActivity({ ...RUN, activityType: 'SWIM_TO_BIKE_TRANSITION_V2' })).toBe(
      false,
    );
  });
});

describe('pushedDetailsToRawStreams', () => {
  it('reads per-second samples as streams from the session start', () => {
    const raw = pushedDetailsToRawStreams({
      activityId: 1,
      summary: { startTimeInSeconds: 1000 },
      samples: [
        { startTimeInSeconds: 1000, heartRate: 120, latitudeInDegree: 45, longitudeInDegree: 6 },
        { startTimeInSeconds: 1001, heartRate: 122, totalDistanceInMeters: 3, powerInWatts: 210 },
      ],
    });
    expect(raw?.time).toEqual([0, 1]);
    expect(raw?.heartrate).toEqual([120, 122]);
    expect(raw?.distance).toEqual([0, 3]);
    expect(raw?.watts).toEqual([0, 210]);
    expect(raw?.latlng).toEqual([[45, 6]]);
  });

  it('thins a long session to at most 2 000 points', () => {
    const samples = Array.from({ length: 10_000 }, (_, i) => ({
      startTimeInSeconds: i,
      heartRate: 130,
    }));
    const raw = pushedDetailsToRawStreams({ summary: { startTimeInSeconds: 0 }, samples });
    expect(raw?.time.length).toBeLessThanOrEqual(2000);
    expect(raw?.time.at(-1)).toBeGreaterThan(9900);
  });

  it('has nothing for a manual activity without samples', () => {
    expect(pushedDetailsToRawStreams({ samples: [] })).toBeNull();
  });
});

describe('Health summaries', () => {
  it('reads a daily, with stress -1 as unknown', () => {
    const day = pushedDailyToHealth({
      calendarDate: '2026-10-24',
      restingHeartRateInBeatsPerMinute: 48,
      steps: 9000,
      averageStressLevel: -1,
    });
    expect(day).toMatchObject({
      date: '2026-10-24',
      restingHr: 48,
      totalSteps: 9000,
      stress: null,
    });
  });

  it('reads a night: stages, score and wall-clock bed and wake times', () => {
    const night = pushedSleepToHealth({
      calendarDate: '2026-10-24',
      startTimeInSeconds: Date.UTC(2026, 9, 23, 21, 30) / 1000,
      startTimeOffsetInSeconds: 7200, // 23:30 local
      durationInSeconds: 27000, // 7 h 30 asleep
      awakeDurationInSeconds: 1800,
      deepSleepDurationInSeconds: 5400,
      lightSleepDurationInSeconds: 16200,
      remSleepInSeconds: 5400,
      overallSleepScore: { value: 87, qualifierKey: 'GOOD' },
      timeOffsetSleepRespiration: { '60': 14, '120': 16 },
    });
    expect(night?.sleepMinutes).toBe(450);
    expect(night?.sleep).toMatchObject({
      sleepScore: 87,
      sleepScoreFeedback: 'GOOD',
      sleepDeepMin: 90,
      sleepRemMin: 90,
      sleepBedtimeMin: 23 * 60 + 30,
      sleepWakeMin: 7 * 60 + 30,
      sleepRespiration: 15,
    });
  });

  it('reads the night HRV average and a weighing in kilograms', () => {
    expect(pushedHrvToHealth({ calendarDate: '2026-10-24', lastNightAvg: 44 })?.hrv).toBe(44);
    const weighing = pushedBodyCompToHealth({
      measurementTimeInSeconds: Date.UTC(2026, 9, 24, 6) / 1000,
      measurementTimeOffsetInSeconds: 7200,
      weightInGrams: 75450,
    });
    expect(weighing).toMatchObject({ date: '2026-10-24', weightKg: 75.45 });
  });

  it('reads VO2max estimates for the profile', () => {
    expect(pushedUserMetricsToProfile({ vo2Max: 52, vo2MaxCycling: 55 })).toEqual({
      vo2maxRunning: 52,
      vo2maxCycling: 55,
    });
  });
});
