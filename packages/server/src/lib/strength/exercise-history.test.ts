import { describe, expect, it } from 'vitest';
import { exerciseKey, summarizeExerciseHistory, type StrengthSetRow } from './exercise-history';

function row(overrides: Partial<StrengthSetRow>): StrengthSetRow {
  return {
    exercise: 'Développé couché',
    exerciseCatalogId: null,
    sets: 3,
    reps: 8,
    weightKg: 60,
    durationSec: null,
    notes: null,
    date: new Date('2026-11-01T10:00:00Z'),
    ...overrides,
  };
}

describe('summarizeExerciseHistory', () => {
  it('reads one exercise under its accents, case and spacing', () => {
    expect(exerciseKey('  Développé   Couché ')).toBe('developpe couche');
    const [bench, ...rest] = summarizeExerciseHistory([
      row({}),
      row({ exercise: 'developpe couche', date: new Date('2026-11-08T10:00:00Z'), weightKg: 55 }),
    ]);
    expect(rest).toHaveLength(0);
    expect(bench?.name).toBe('developpe couche');
    expect(bench?.sessions).toBe(2);
  });

  it('keeps the last session and the best load with its repetitions', () => {
    const [bench] = summarizeExerciseHistory([
      row({ date: new Date('2026-10-01T10:00:00Z'), weightKg: 70, reps: 5 }),
      row({ date: new Date('2026-11-08T10:00:00Z'), weightKg: 62.5, reps: 8, sets: 4 }),
    ]);
    expect(bench?.last).toEqual({
      date: '2026-11-08',
      sets: 4,
      reps: 8,
      weightKg: 62.5,
      durationSec: null,
    });
    expect(bench?.best).toEqual({ weightKg: 70, reps: 5, durationSec: null });
  });

  it('keeps the longest hold of a timed exercise and no load for it', () => {
    const [plank] = summarizeExerciseHistory([
      row({ exercise: 'Gainage', reps: 0, weightKg: null, durationSec: 45 }),
      row({
        exercise: 'Gainage',
        reps: 0,
        weightKg: null,
        durationSec: 60,
        date: new Date('2026-10-20T10:00:00Z'),
        notes: 'Zone travaillée : Tronc',
      }),
    ]);
    expect(plank?.last.durationSec).toBe(45);
    expect(plank?.best).toEqual({ weightKg: null, reps: null, durationSec: 60 });
    expect(plank?.note).toBe('Zone travaillée : Tronc');
  });

  it('lists the exercise done most recently first and skips unnamed sets', () => {
    const names = summarizeExerciseHistory([
      row({ exercise: 'Squat', date: new Date('2026-09-01T10:00:00Z') }),
      row({ exercise: '   ' }),
      row({ exercise: 'Tractions', date: new Date('2026-11-10T10:00:00Z') }),
    ]).map((exercise) => exercise.name);
    expect(names).toEqual(['Tractions', 'Squat']);
  });
});
