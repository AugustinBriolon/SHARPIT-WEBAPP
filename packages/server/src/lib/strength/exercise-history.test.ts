import { describe, expect, it } from 'vitest';
import {
  attachAthleteNotes,
  exerciseKey,
  formatStrengthHistoryBlock,
  summarizeExerciseHistory,
  summarizeExerciseSessions,
  type StrengthSetRow,
} from './exercise-history';

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

describe('formatStrengthHistoryBlock', () => {
  it('says nothing when nothing was logged', () => {
    expect(formatStrengthHistoryBlock([])).toBe('');
  });

  it('gives the generator the last and best figures of each exercise', () => {
    const block = formatStrengthHistoryBlock(
      summarizeExerciseHistory([
        row({ weightKg: 70, reps: 5, date: new Date('2026-10-01T10:00:00Z') }),
        row({}),
        row({ exercise: 'Gainage', weightKg: null, reps: 1, durationSec: 45 }),
      ]),
    );
    expect(block).toContain('Développé couché : dernière fois 3×8 à 60 kg (2026-11-01)');
    expect(block).toContain('meilleur 5 rép. à 70 kg');
    expect(block).toContain('Gainage : dernière fois 3×45 s');
  });
});

describe('attachAthleteNotes', () => {
  it('puts a standing note on its exercise whatever the accents and case', () => {
    const history = attachAthleteNotes(
      summarizeExerciseHistory([row({}), row({ exercise: 'Gainage' })]),
      [{ exerciseKey: exerciseKey('DEVELOPPE couche'), note: 'Omoplates serrées' }],
    );
    expect(history.find((e) => e.name === 'Développé couché')?.athleteNote).toBe(
      'Omoplates serrées',
    );
    expect(history.find((e) => e.name === 'Gainage')?.athleteNote).toBeNull();
  });

  it('hands the note to the plan generator as athlete text', () => {
    const block = formatStrengthHistoryBlock(
      attachAthleteNotes(summarizeExerciseHistory([row({})]), [
        { exerciseKey: exerciseKey('Développé couché'), note: 'Épaule droite : pas sous 90°' },
      ]),
    );
    expect(block).toContain('consigne de l’athlète ⟦Épaule droite : pas sous 90°⟧');
  });
});

describe('summarizeExerciseSessions', () => {
  it('gathers one exercise by day, oldest first, with its best load and volume', () => {
    const sessions = summarizeExerciseSessions(
      [
        row({ date: new Date('2026-11-08T10:00:00Z'), weightKg: 65, sets: 1, reps: 5 }),
        row({ date: new Date('2026-11-08T10:00:00Z') }),
        row({ exercise: 'developpe COUCHE', date: new Date('2026-10-01T10:00:00Z'), weightKg: 55 }),
        row({ exercise: 'Squat', date: new Date('2026-11-01T10:00:00Z'), weightKg: 100 }),
      ],
      'Développé couché',
    );
    expect(sessions.map((s) => s.date)).toEqual(['2026-10-01', '2026-11-08']);
    expect(sessions[1].bestWeightKg).toBe(65);
    expect(sessions[1].volumeKg).toBe(65 * 5 + 3 * 8 * 60);
    expect(sessions[1].blocks).toHaveLength(2);
  });

  it('keeps the longest hold of a timed exercise and no load', () => {
    const [session] = summarizeExerciseSessions(
      [row({ exercise: 'Gainage', weightKg: null, reps: 1, durationSec: 45 })],
      'gainage',
    );
    expect(session.bestDurationSec).toBe(45);
    expect(session.bestWeightKg).toBeNull();
    expect(session.volumeKg).toBe(0);
  });
});
