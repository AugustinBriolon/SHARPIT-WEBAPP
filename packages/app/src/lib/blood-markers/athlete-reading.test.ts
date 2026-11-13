import { describe, expect, it } from 'vitest';
import { athleteReading, type TrainingBeforeSample } from './athlete-reading';
import type { BloodMarkerResult } from './catalog';

// Invented figures only (ADR-128).
const r = (
  markerKey: BloodMarkerResult['markerKey'],
  value: number,
  refLow: number | null,
  refHigh: number | null,
): BloodMarkerResult => ({ markerKey, value, unit: '', refLow, refHigh });

const rested: TrainingBeforeSample = {
  sessionsInWeek: 0,
  strengthInWeek: 0,
  sessionsInFourWeeks: 2,
};
const training: TrainingBeforeSample = {
  sessionsInWeek: 4,
  strengthInWeek: 1,
  sessionsInFourWeeks: 16,
};

const keys = (results: BloodMarkerResult[], context: TrainingBeforeSample) =>
  athleteReading(results, context).map((finding) => `${finding.key}:${finding.tone}`);

describe('athleteReading', () => {
  it('says nothing about results that sit in range', () => {
    expect(athleteReading([r('ast', 22, null, 50), r('ferritin', 90, 30, 400)], training)).toEqual(
      [],
    );
  });

  it('ties raised transaminases to training in the week before, and notes a normal GGT', () => {
    const [finding] = athleteReading(
      [r('ast', 70, null, 50), r('alt', 40, null, 50), r('ggt', 15, null, 60)],
      training,
    );
    expect(finding?.key).toBe('transaminases_after_training');
    expect(finding?.markerKeys).toEqual(['ast']);
    expect(finding?.text).toContain('4 séance(s), dont du renforcement,');
    expect(finding?.text).toContain('GGT est dans l’intervalle');
    expect(finding?.source).toContain('Pettersson');
  });

  it('sends raised transaminases without recent training to the doctor', () => {
    expect(keys([r('alt', 80, null, 50)], rested)).toEqual([
      'transaminases_without_training:doctor',
    ]);
  });

  it('flags ferritin under 35 even inside the lab range, and anaemia as a doctor matter', () => {
    expect(keys([r('ferritin', 32, 30, 400)], training)).toEqual([
      'ferritin_low_for_athlete:context',
    ]);
    expect(keys([r('ferritin', 35, 30, 400)], training)).toEqual([]);
    expect(keys([r('ferritin', 18, 30, 400), r('hemoglobin', 12.1, 13.4, 16.7)], training)).toEqual(
      ['ferritin_low_for_athlete:doctor'],
    );
  });

  it('reads a mild white cell drop as training only for a regularly trained athlete', () => {
    const mild = [r('neutrophils', 1.6, 1.8, 6.8)];
    expect(keys(mild, training)).toEqual(['neutrophils_low_trained:context']);
    expect(keys(mild, rested)).toEqual(['neutrophils_low_trained:doctor']);
    expect(athleteReading(mild, rested)[0]?.text).toContain(
      'sans entraînement régulier enregistré',
    );
    expect(keys([r('neutrophils', 1.0, 1.8, 6.8)], training)).toEqual([
      'neutrophils_low_trained:doctor',
    ]);
  });

  it('puts creatinine in its muscular context, and lists doctor findings first', () => {
    expect(keys([r('creatinine', 13, 6.7, 11.7), r('alt', 80, null, 50)], rested)).toEqual([
      'transaminases_without_training:doctor',
      'creatinine_muscle_mass:context',
    ]);
    expect(keys([r('egfr', 85, null, null)], rested)).toEqual(['creatinine_muscle_mass:context']);
  });
});
