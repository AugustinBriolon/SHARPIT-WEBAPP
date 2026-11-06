import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOBILITY_HOLD_SEC,
  formatStrengthPrescriptionSummary,
  normalizeCoachStrengthPrescription,
  presentStrengthPrescription,
  shapeStrengthSet,
  type StrengthPrescriptionSet,
} from '@sharpit/app/lib/planned-session/strength/strength-prescription';

function set(overrides: Partial<StrengthPrescriptionSet>): StrengthPrescriptionSet {
  return { exercise: 'Pompe', sets: 3, reps: 10, order: 0, ...overrides };
}

describe('shapeStrengthSet', () => {
  it('reads a one-rep 0 kg hip flexor stretch as a hold done on each side', () => {
    const shaped = shapeStrengthSet(
      set({
        exercise: 'Étirement du fléchisseur de hanche',
        intent: 'MOBILITY',
        reps: 1,
        weightKg: 0,
      }),
    );
    expect(shaped).toMatchObject({
      reps: 0,
      durationSec: DEFAULT_MOBILITY_HOLD_SEC,
      weightKg: null,
      perSide: true,
    });
  });

  it('knows the stretch by the taxonomy when the coach declared nothing', () => {
    const shaped = shapeStrengthSet(
      set({ exercise: 'Étirement fléchisseur de la hanche en fente', reps: 0 }),
    );
    expect(shaped.perSide).toBe(true);
    expect(shaped.durationSec).toBe(DEFAULT_MOBILITY_HOLD_SEC);
  });

  it('keeps a hold length and a mobility count the coach gave', () => {
    expect(
      shapeStrengthSet(set({ intent: 'MOBILITY', reps: 0, durationSec: 45 })).durationSec,
    ).toBe(45);
    const counted = shapeStrengthSet(set({ intent: 'MOBILITY', reps: 8 }));
    expect(counted.reps).toBe(8);
    expect(counted.durationSec).toBeUndefined();
  });

  it('drops a 0 kg load but keeps a real one', () => {
    expect(shapeStrengthSet(set({ weightKg: 0 })).weightKg).toBeNull();
    expect(shapeStrengthSet(set({ exercise: 'Squat barre', weightKg: 60 })).weightKg).toBe(60);
  });

  it('knows the stretch under the plural name athletes use', () => {
    expect(
      shapeStrengthSet(set({ exercise: 'Étirement des fléchisseurs de la hanche', reps: 0 }))
        .perSide,
    ).toBe(true);
  });

  it('lets the coach decide a side over the taxonomy', () => {
    expect(
      shapeStrengthSet(set({ exercise: 'Étirement du fléchisseur de hanche', perSide: false }))
        .perSide,
    ).toBe(false);
  });
});

describe('shaped on the way in and out', () => {
  it('normalizes a coach set and says it in the summary', () => {
    const prescription = normalizeCoachStrengthPrescription({
      sets: [
        {
          exercise: 'Étirement du fléchisseur de hanche',
          intent: 'MOBILITY',
          sets: 3,
          reps: 1,
          weightKg: 0,
        },
      ],
    });
    expect(prescription?.sets[0]).toMatchObject({
      reps: 0,
      durationSec: 30,
      perSide: true,
      weightKg: null,
    });
    expect(formatStrengthPrescriptionSummary(prescription!)).toBe(
      'Étirement du fléchisseur de hanche 3×30s par côté',
    );
  });

  it('fixes a row written before, and leaves an unreadable one as stored', () => {
    const stored = {
      version: 1,
      sets: [
        {
          exercise: 'Étirement du fléchisseur de hanche',
          intent: 'MOBILITY',
          sets: 3,
          reps: 1,
          weightKg: 0,
          order: 0,
        },
      ],
    };
    expect(presentStrengthPrescription(stored)).toMatchObject({
      sets: [{ reps: 0, perSide: true, weightKg: null }],
    });
    expect(presentStrengthPrescription({ legacy: true })).toEqual({ legacy: true });
    expect(presentStrengthPrescription(null)).toBeNull();
  });
});
