import { describe, expect, it } from 'vitest';
import {
  auditStrengthPrescription,
  estimateStrengthPrescriptionMinutes,
  formatStrengthSessionRules,
  planStrengthSessionShape,
  STRENGTH_BLOCKS,
} from '@sharpit/server/lib/planned-session/strength/strength-session-template';

describe('planStrengthSessionShape', () => {
  it('scales the exercise budget with the session duration', () => {
    expect(planStrengthSessionShape(30).minExercises).toBeGreaterThanOrEqual(5);
    expect(planStrengthSessionShape(45).minExercises).toBeGreaterThanOrEqual(8);
    expect(planStrengthSessionShape(60).maxExercises).toBeGreaterThanOrEqual(
      planStrengthSessionShape(45).maxExercises,
    );
  });

  it('covers every block, within the exercise budget', () => {
    for (const duration of [35, 45, 60, 75]) {
      const shape = planStrengthSessionShape(duration);
      expect(shape.blocks.map((b) => b.role)).toEqual(STRENGTH_BLOCKS.map((b) => b.role));
      const total = shape.blocks.reduce((sum, block) => sum + block.targetExercises, 0);
      expect(total, `${duration} min`).toBeGreaterThanOrEqual(shape.minExercises);
      expect(total, `${duration} min`).toBeLessThanOrEqual(shape.maxExercises);
    }
  });

  it('drops the block structure for a short mobility filler', () => {
    expect(planStrengthSessionShape(20).blocks).toEqual([]);
  });

  it('falls back to a default duration when none is planned', () => {
    expect(planStrengthSessionShape(null).durationMin).toBe(45);
  });
});

describe('estimateStrengthPrescriptionMinutes', () => {
  it('counts work, rest and transitions', () => {
    // 3×12 @3s = 36s work + 45s lap rest, ×3 sets, +30s transition
    expect(estimateStrengthPrescriptionMinutes([{ sets: 3, reps: 12 }])).toBe(5);
  });

  it('uses the prescribed hold time for isometrics', () => {
    expect(
      estimateStrengthPrescriptionMinutes([
        { sets: 3, reps: 0, durationSec: 40, restMode: 'time', restSec: 20 },
      ]),
    ).toBe(4);
  });
});

describe('auditStrengthPrescription', () => {
  const shortSession = {
    durationMin: 45,
    prescription: {
      sets: [
        {
          exercise: 'Massage piriforme',
          intent: 'MOBILITY' as const,
          pattern: null,
          sets: 1,
          reps: 1,
        },
        {
          exercise: 'Nerve flossing',
          intent: 'MOBILITY' as const,
          pattern: null,
          sets: 3,
          reps: 15,
        },
        {
          exercise: 'Pont fessier',
          intent: 'STRENGTH' as const,
          pattern: 'HIP_EXTENSION' as const,
          sets: 3,
          reps: 15,
        },
        {
          exercise: 'Clamshell',
          intent: 'STRENGTH' as const,
          pattern: 'HIP_ABDUCTION' as const,
          sets: 3,
          reps: 15,
        },
      ],
    },
  };

  it('flags the under-filled session that shipped as 20 minutes of work', () => {
    const audit = auditStrengthPrescription(shortSession);
    expect(audit?.verdict).toBe('too_short');
    expect(audit?.message).toContain('sous-remplie');
  });

  it('accepts a prescription that fills the planned duration', () => {
    const sets = Array.from({ length: 13 }, (_, index) => ({
      exercise: `Exercice ${index + 1}`,
      intent: 'STRENGTH' as const,
      pattern: 'SQUAT' as const,
      sets: 3,
      reps: 12,
    }));
    const audit = auditStrengthPrescription({ durationMin: 60, prescription: { sets } });
    expect(audit?.verdict).toBe('ok');
  });

  it('flags a prescription far longer than the slot', () => {
    const sets = Array.from({ length: 14 }, (_, index) => ({
      exercise: `Exercice ${index + 1}`,
      intent: 'STRENGTH' as const,
      pattern: 'SQUAT' as const,
      sets: 4,
      reps: 15,
    }));
    const audit = auditStrengthPrescription({ durationMin: 30, prescription: { sets } });
    expect(audit?.verdict).toBe('too_long');
  });

  it('returns nothing without a prescription', () => {
    expect(auditStrengthPrescription({ durationMin: 45, prescription: null })).toBeNull();
  });
});

describe('formatStrengthSessionRules', () => {
  it('names every block for the coach prompt', () => {
    const rules = formatStrengthSessionRules();
    for (const block of STRENGTH_BLOCKS) {
      expect(rules).toContain(block.label);
    }
    expect(rules).toContain('searchWatchExercises');
  });

  // A muscle-up goal got clamshells and psoas stretches: prehab is for a declared zone only.
  it('ties the session to the goal and keeps prehab to declared sensitive zones', () => {
    const rules = formatStrengthSessionRules();
    expect(rules).toContain("Chaque exercice sert l'objectif déclaré");
    expect(rules).toContain('seulement pour une zone sensible déclarée');
  });
});
