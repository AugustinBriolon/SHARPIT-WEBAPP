import { describe, it, expect } from 'vitest';
import {
  mapGarminSportType,
  garminActivityToSession,
  garminEvaluationToSubjective,
} from './garmin-activity-adapter';
import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const RECEIVED_AT = new Date('2026-07-02T10:00:00Z');

function buildActivity(overrides: Partial<IActivity> = {}): IActivity {
  return {
    activityId: 12345678,
    activityName: 'Morning Run',
    startTimeLocal: '2026-07-02T07:00:00',
    activityType: {
      typeKey: 'running',
      typeId: 1,
      parentTypeId: 17,
      isHidden: false,
      restricted: false,
      trimmable: false,
    },
    distance: 10000,
    duration: 3600,
    movingDuration: 3550,
    elapsedDuration: 3600,
    averageSpeed: 2.78,
    averageHR: 155,
    maxHR: 178,
    elevationGain: 80,
    calories: 450,
    trainingStressScore: 65,
    activityTrainingLoad: null,
    avgPower: null,
    normPower: null,
    averageBikingCadenceInRevPerMinute: null,
    averageRunningCadenceInStepsPerMinute: 170,
    ...overrides,
  } as unknown as IActivity;
}

// ─────────────────────────────────────────────────────────────────────────────
// mapGarminSportType
// ─────────────────────────────────────────────────────────────────────────────

describe('mapGarminSportType', () => {
  it.each([
    ['running', 'RUN'],
    ['trail_running', 'TRAIL_RUN'],
    ['cycling', 'BIKE'],
    ['indoor_cycling', 'BIKE'],
    ['mountain_biking', 'MTB'],
    ['open_water_swimming', 'OPEN_WATER'],
    ['lap_swimming', 'SWIM'],
    ['strength_training', 'STRENGTH'],
    ['yoga', 'YOGA'],
    ['triathlon', 'TRIATHLON'],
    ['multisport', 'TRIATHLON'],
    ['multi_sport', 'TRIATHLON'],
  ])('%s → %s', (typeKey, expected) => {
    expect(mapGarminSportType(typeKey)).toBe(expected);
  });

  it('returns null for unsupported type keys', () => {
    expect(mapGarminSportType('kayaking')).toBeNull();
    expect(mapGarminSportType('')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// garminActivityToSession
// ─────────────────────────────────────────────────────────────────────────────

function expectBasicGarminSession(
  session: ReturnType<typeof garminActivityToSession>,
): asserts session is NonNullable<ReturnType<typeof garminActivityToSession>> {
  expect(session).not.toBeNull();
  expect(session?.type).toBe('SESSION');
  expect(session?.source).toBe('GARMIN');
}

describe('garminActivityToSession', () => {
  it('returns null for unsupported activity type', () => {
    const activity = buildActivity({
      activityType: { typeKey: 'kayaking' } as IActivity['activityType'],
    });
    expect(garminActivityToSession(activity, RECEIVED_AT)).toBeNull();
  });

  it('maps a run to RawSessionObservation with correct fields', () => {
    const activity = buildActivity();
    const session = garminActivityToSession(activity, RECEIVED_AT);

    expectBasicGarminSession(session);
    expect(session.sportType).toBe('RUN');
    expect(session.externalId).toBe('12345678');
    expect(session.durationSec).toBe(3550);
    expect(session.hrData?.avgBpm).toBe(155);
    expect(session.hrData?.maxBpm).toBe(178);
    expect(session.hrData?.quality).toBe('MEASURED_OPTICAL');
  });

  it('uses elapsed duration for STRENGTH activities', () => {
    const activity = buildActivity({
      activityType: { typeKey: 'strength_training' } as IActivity['activityType'],
      movingDuration: 1800,
      elapsedDuration: 3600,
    });
    const session = garminActivityToSession(activity, RECEIVED_AT);
    expect(session?.durationSec).toBe(3600); // elapsed preferred for strength
  });

  it('includes power data with MEASURED_DIRECT quality for cycling', () => {
    const activity = buildActivity({
      activityType: { typeKey: 'cycling' } as IActivity['activityType'],
      avgPower: 250,
      normPower: 265,
      trainingStressScore: 85,
    });
    const session = garminActivityToSession(activity, RECEIVED_AT);
    const power = session?.powerData;
    expect(power?.avgWatts).toBe(250);
    expect(power?.normalizedPower).toBe(265);
    expect(power?.quality).toBe('MEASURED_DIRECT');
    expect(power?.sourceComputedTss).toBe(85);
  });

  it('includes paceData for running activities', () => {
    const activity = buildActivity(); // averageSpeed = 2.78 m/s, distance = 10000m
    const session = garminActivityToSession(activity, RECEIVED_AT);
    expect(session?.paceData?.distanceM).toBe(10000);
    // 1000 / 2.78 / 60 ≈ 5.99 min/km
    expect(session?.paceData?.avgMinPerKm).toBeCloseTo(5.99, 1);
  });

  it('uses sourceProvidedStress with ESTIMATED quality when HR present but no power', () => {
    const activity = buildActivity({ trainingStressScore: 65 });
    const session = garminActivityToSession(activity, RECEIVED_AT);
    expect(session?.sourceProvidedStress?.value).toBe(65);
    expect(session?.sourceProvidedStress?.quality).toBe('ESTIMATED'); // HR present
  });

  it('never substitutes the EPOC training load for a Training Stress Score', () => {
    // activityTrainingLoad is EPOC-derived and sits on an unrelated scale — about
    // three times the TSS scale on real data. Accepting it as a stand-in made
    // cycling and running incomparable, so a session with no genuine TSS reports
    // none and the Core's cascade computes the load instead.
    const activity = buildActivity({
      trainingStressScore: null,
      activityTrainingLoad: 210,
    } as Partial<IActivity>);
    const session = garminActivityToSession(activity, RECEIVED_AT);

    expect(session?.sourceProvidedStress).toBeUndefined();
  });

  it('does NOT include rpe or feeling (those become SubjectiveObservation)', () => {
    const activity = buildActivity();
    const session = garminActivityToSession(activity, RECEIVED_AT);
    expect(session).not.toHaveProperty('rpe');
    expect(session).not.toHaveProperty('feeling');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// garminEvaluationToSubjective
// ─────────────────────────────────────────────────────────────────────────────

describe('garminEvaluationToSubjective', () => {
  const SESSION_TS = new Date('2026-07-02T07:00:00Z');

  it('returns null when both rpe and feeling are null', () => {
    const result = garminEvaluationToSubjective(
      { rpe: null, feeling: null, notes: null },
      '12345678',
      SESSION_TS,
      RECEIVED_AT,
    );
    expect(result).toBeNull();
  });

  it('converts rpe and maps feeling to mood scale', () => {
    const result = garminEvaluationToSubjective(
      { rpe: 7, feeling: 'Bien', notes: 'Good session' },
      '12345678',
      SESSION_TS,
      RECEIVED_AT,
    );
    expect(result).not.toBeNull();
    expect(result?.type).toBe('SUBJECTIVE');
    expect(result?.rpe).toBe(7);
    expect(result?.mood).toBe(4); // 'Bien' → 4
    expect(result?.sessionExternalId).toBe('12345678');
    expect(result?.notes).toBe('Good session');
  });

  it('maps all feeling labels to correct mood values', () => {
    const cases: Array<[string, number]> = [
      ['Très mal', 1],
      ['Mal', 2],
      ['Correct', 3],
      ['Bien', 4],
      ['Très bien', 5],
    ];
    for (const [feeling, expectedMood] of cases) {
      const result = garminEvaluationToSubjective(
        { rpe: null, feeling, notes: null },
        'ext-id',
        SESSION_TS,
        RECEIVED_AT,
      );
      expect(result?.mood).toBe(expectedMood);
    }
  });

  it('creates subjective with only rpe when feeling is null', () => {
    const result = garminEvaluationToSubjective(
      { rpe: 8, feeling: null, notes: null },
      'ext-id',
      SESSION_TS,
      RECEIVED_AT,
    );
    expect(result?.rpe).toBe(8);
    expect(result?.mood).toBeUndefined();
  });
});
