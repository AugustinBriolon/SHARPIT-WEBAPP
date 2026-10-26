import { describe, expect, it } from 'vitest';
import {
  athleteThresholds,
  buildPlannedSessionSteps,
  type PlannedSessionForSteps,
} from './session-steps';

const thresholds = {
  runThresholdPaceSecPerKm: 240,
  swimCssSecPer100m: 100,
  ftpW: 260,
  lthr: 165,
  maxHr: 190,
};

function session(overrides: Partial<PlannedSessionForSteps>): PlannedSessionForSteps {
  return {
    type: 'RUN',
    durationMin: 60,
    intensity: 'ENDURANCE',
    ...overrides,
  } as PlannedSessionForSteps;
}

describe('buildPlannedSessionSteps', () => {
  it('derives a breakdown for a session with no stored structure', () => {
    // Duration and intensity imply a shape, so an unstructured endurance session still
    // reads as something to do rather than as a blank.
    const result = buildPlannedSessionSteps(session({}), thresholds);

    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.derived).toBe(true);
  });

  it('carries the warm-up and stretches, with the zones the athlete declared (ADR-114)', () => {
    const result = buildPlannedSessionSteps(session({}), thresholds, {
      zones: [{ bodyRegion: 'Sciatique' }],
    });

    expect(result.routines?.warmup.moves.length).toBeGreaterThan(0);
    expect(result.routines?.cooldown.moves.map((m) => m.name)).toContain(
      'Glissements du nerf sciatique, allongé',
    );
  });

  it('reads a stored structure rather than deriving one', () => {
    const result = buildPlannedSessionSteps(
      session({
        endurancePrescription: {
          version: 1,
          sport: 'RUN',
          blocks: [
            {
              kind: 'step',
              step: {
                kind: 'warmup',
                duration: { type: 'time', seconds: 600 },
                target: { metric: 'none' },
              },
            },
          ],
        },
      }),
      thresholds,
    );

    expect(result.derived).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].label).toBe('Échauffement');
    expect(result.steps[0].detail).toBe('10 min');
  });

  it('carries the repeat count of a group onto each of its steps', () => {
    const result = buildPlannedSessionSteps(
      session({
        endurancePrescription: {
          version: 1,
          sport: 'RUN',
          blocks: [
            {
              kind: 'step',
              step: {
                kind: 'warmup',
                duration: { type: 'time', seconds: 600 },
                target: { metric: 'none' },
              },
            },
            {
              kind: 'repeat',
              iterations: 4,
              steps: [
                {
                  kind: 'interval',
                  duration: { type: 'time', seconds: 180 },
                  target: { metric: 'none' },
                },
                {
                  kind: 'recovery',
                  duration: { type: 'time', seconds: 90 },
                  target: { metric: 'none' },
                },
              ],
            },
          ],
        },
      }),
      thresholds,
    );

    const [warmup, ...set] = result.steps;
    expect(set).toHaveLength(2);
    expect(set.every((step) => step.repeat === 4)).toBe(true);
    // The block and its recovery repeat together: one group, apart from the warm-up.
    expect(set[0].group).toBe(set[1].group);
    expect(warmup.group).not.toBe(set[0].group);
  });

  it('names the stroke beside the kind for a pool session', () => {
    const result = buildPlannedSessionSteps(
      session({
        type: 'SWIM',
        endurancePrescription: {
          version: 1,
          sport: 'SWIM',
          poolLengthM: 25,
          blocks: [
            {
              kind: 'step',
              step: {
                kind: 'interval',
                duration: { type: 'distance', meters: 400 },
                target: { metric: 'none' },
                stroke: 'drill',
              },
            },
          ],
        },
      }),
      thresholds,
    );

    expect(result.steps[0].label).toBe('Bloc · Éducatif');
    expect(result.steps[0].detail).toBe('400 m');
  });

  it('lists strength sets in their declared order', () => {
    const result = buildPlannedSessionSteps(
      session({
        type: 'STRENGTH',
        strengthPrescription: {
          version: 1,
          sets: [
            { exercise: 'Fentes', sets: 3, reps: 12, order: 1 },
            { exercise: 'Squat', sets: 4, reps: 8, weightKg: 60, order: 0 },
          ],
        },
      }),
      thresholds,
    );

    expect(result.steps.map((step) => step.label)).toEqual(['Squat', 'Fentes']);
    expect(result.steps[0].detail).toBe('4 × 8');
    expect(result.steps[0].target).toBe('60 kg');
  });

  it('reads a timed strength set as a duration rather than as zero reps', () => {
    const result = buildPlannedSessionSteps(
      session({
        type: 'STRENGTH',
        strengthPrescription: {
          version: 1,
          sets: [{ exercise: 'Gainage', sets: 3, reps: 0, durationSec: 45, order: 0 }],
        },
      }),
      thresholds,
    );

    expect(result.steps[0].detail).toBe('3 × 45 s');
  });

  it('never claims a strength session was derived', () => {
    // Duration and intensity imply nothing about which exercises to do.
    const result = buildPlannedSessionSteps(session({ type: 'STRENGTH' }), thresholds);

    expect(result).toEqual({ steps: [], derived: false, warnings: [] });
  });
});

describe('athleteThresholds', () => {
  it('keeps only the references a target is resolved against', () => {
    expect(
      athleteThresholds({
        runThresholdPaceSecPerKm: 245,
        swimCssSecPer100m: null,
        ftpW: 260,
        lthr: 168,
        maxHr: null,
        firstName: 'Zoé',
      } as never),
    ).toEqual({
      runThresholdPaceSecPerKm: 245,
      swimCssSecPer100m: null,
      ftpW: 260,
      lthr: 168,
      maxHr: null,
    });
  });

  it('leaves every target unresolved without a profile', () => {
    expect(Object.values(athleteThresholds(null)).every((value) => value === null)).toBe(true);
  });
});
