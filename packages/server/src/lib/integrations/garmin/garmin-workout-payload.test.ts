import { describe, expect, it } from 'vitest';
import type { EndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import type { AthleteThresholds } from '@sharpit/app/lib/planned-session/endurance/endurance-targets';
import { buildGarminWorkoutPayload } from './garmin-workout-payload';

const THRESHOLDS: AthleteThresholds = {
  runThresholdPaceSecPerKm: 240,
  swimCssSecPer100m: 100,
  ftpW: 250,
  lthr: 165,
  maxHr: 190,
};

const NO_THRESHOLDS: AthleteThresholds = {
  runThresholdPaceSecPerKm: null,
  swimCssSecPer100m: null,
  ftpW: null,
  lthr: null,
  maxHr: null,
};

/** 15 min warm-up · 5 × (800 m threshold / 2 min recovery) · 10 min cool-down. */
const RUN_INTERVALS: EndurancePrescription = {
  version: 1,
  sport: 'RUN',
  blocks: [
    {
      kind: 'step',
      step: {
        kind: 'warmup',
        duration: { type: 'time', seconds: 900 },
        target: { metric: 'pace', pctMin: 75, pctMax: 82.5 },
      },
    },
    {
      kind: 'repeat',
      iterations: 5,
      steps: [
        {
          kind: 'interval',
          duration: { type: 'distance', meters: 800 },
          target: { metric: 'pace', pctMin: 97.5, pctMax: 102.5 },
        },
        { kind: 'recovery', duration: { type: 'time', seconds: 120 }, target: { metric: 'none' } },
      ],
    },
    {
      kind: 'step',
      step: { kind: 'cooldown', duration: { type: 'lap' }, target: { metric: 'none' } },
    },
  ],
};

type Step = Record<string, unknown> & { steps?: Step[] };

function steps(payload: Record<string, unknown>): Step[] {
  return (payload.segments as Array<{ steps: Step[] }>)[0].steps;
}

describe('buildGarminWorkoutPayload', () => {
  it('builds a single-sport V2 workout with one repeat group, in step order', () => {
    const { payload, stepCount } = buildGarminWorkoutPayload({
      workoutName: 'Seuil 5x800',
      description: 'Garde les récups actives',
      prescription: RUN_INTERVALS,
      thresholds: THRESHOLDS,
    });

    expect(payload).toMatchObject({
      workoutName: 'Seuil 5x800',
      description: 'Garde les récups actives',
      sport: 'RUNNING',
      workoutProvider: 'SharpIt',
      workoutSourceId: 'SharpIt',
      isSessionTransitionEnabled: false,
      poolLength: null,
    });
    const [warmup, repeat, cooldown] = steps(payload);
    expect(warmup).toMatchObject({
      type: 'WorkoutStep',
      stepOrder: 1,
      intensity: 'WARMUP',
      durationType: 'TIME',
      durationValue: 900,
      targetType: 'PACE',
    });
    expect(repeat).toMatchObject({
      type: 'WorkoutRepeatStep',
      stepOrder: 2,
      repeatType: 'REPEAT_UNTIL_STEPS_CMPLT',
      repeatValue: 5,
    });
    expect(repeat.steps?.map((step) => step.stepOrder)).toEqual([3, 4]);
    expect(repeat.steps?.[0]).toMatchObject({
      intensity: 'INTERVAL',
      durationType: 'DISTANCE',
      durationValue: 800,
      durationValueType: 'METER',
    });
    expect(repeat.steps?.[1]).toMatchObject({ intensity: 'RECOVERY', targetType: 'OPEN' });
    expect(cooldown).toMatchObject({ stepOrder: 5, durationType: 'OPEN', durationValue: null });
    expect(stepCount).toBe(5);
  });

  it('resolves a pace band to an ascending speed range in m/s against today’s threshold', () => {
    const { payload } = buildGarminWorkoutPayload({
      workoutName: 'Seuil',
      prescription: RUN_INTERVALS,
      thresholds: THRESHOLDS,
    });
    const interval = steps(payload)[1].steps?.[0] as Step;
    const low = interval.targetValueLow as number;
    const high = interval.targetValueHigh as number;
    // 4:00/km threshold = 4.17 m/s; the band sits around it, slower bound first.
    expect(low).toBeLessThan(high);
    expect(low).toBeLessThan(1000 / 240);
    expect(high).toBeGreaterThan(1000 / 240);
  });

  it('sends an unresolvable target open and says why', () => {
    const { payload, warnings } = buildGarminWorkoutPayload({
      workoutName: 'Seuil',
      prescription: RUN_INTERVALS,
      thresholds: NO_THRESHOLDS,
    });
    expect(steps(payload)[0]).toMatchObject({ targetType: 'OPEN' });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('carries a bike power band in watts', () => {
    const { payload } = buildGarminWorkoutPayload({
      workoutName: 'Sweet spot',
      prescription: {
        version: 1,
        sport: 'BIKE',
        blocks: [
          {
            kind: 'step',
            step: {
              kind: 'interval',
              duration: { type: 'time', seconds: 1200 },
              target: { metric: 'power', pctMin: 88, pctMax: 94 },
            },
          },
        ],
      },
      thresholds: THRESHOLDS,
    });
    expect(payload.sport).toBe('CYCLING');
    expect(steps(payload)[0]).toMatchObject({
      targetType: 'POWER',
      targetValueLow: 220,
      targetValueHigh: 235,
    });
  });

  it('puts a pool pace on the secondary target, rests at the wall, and keeps the pool unit', () => {
    const { payload } = buildGarminWorkoutPayload({
      workoutName: 'Natation',
      prescription: {
        version: 1,
        sport: 'SWIM',
        poolLengthM: 25,
        blocks: [
          {
            kind: 'repeat',
            iterations: 4,
            steps: [
              {
                kind: 'interval',
                duration: { type: 'distance', meters: 100 },
                target: { metric: 'pace', pctMin: 95, pctMax: 100 },
                stroke: 'free',
              },
              { kind: 'rest', duration: { type: 'time', seconds: 20 }, target: { metric: 'none' } },
            ],
          },
        ],
      },
      thresholds: THRESHOLDS,
    });

    expect(payload).toMatchObject({
      sport: 'LAP_SWIMMING',
      poolLength: 25,
      poolLengthUnit: 'METER',
    });
    const [swim, rest] = steps(payload)[0].steps as Step[];
    expect(swim).toMatchObject({
      targetType: null,
      secondaryTargetType: 'PACE_ZONE',
      strokeType: 'FREESTYLE',
    });
    expect(swim.secondaryTargetValueLow as number).toBeLessThan(
      swim.secondaryTargetValueHigh as number,
    );
    expect(rest).toMatchObject({
      intensity: 'REST',
      durationType: 'FIXED_REST',
      durationValue: 20,
    });
  });

  it('drops a heart-rate target in the pool, where Garmin takes none, and says so', () => {
    const { payload, warnings } = buildGarminWorkoutPayload({
      workoutName: 'Natation',
      prescription: {
        version: 1,
        sport: 'SWIM',
        blocks: [
          {
            kind: 'step',
            step: {
              kind: 'interval',
              duration: { type: 'distance', meters: 400 },
              target: { metric: 'hr', hrRef: 'lthr', pctMin: 85, pctMax: 90 },
            },
          },
        ],
      },
      thresholds: THRESHOLDS,
    });
    expect(steps(payload)[0]).toMatchObject({ targetType: null });
    expect(steps(payload)[0]).not.toHaveProperty('secondaryTargetType');
    expect(warnings.some((warning) => warning.includes('natation'))).toBe(true);
  });
});
