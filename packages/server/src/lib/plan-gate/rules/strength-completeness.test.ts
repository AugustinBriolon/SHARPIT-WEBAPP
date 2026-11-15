import { describe, expect, it } from 'vitest';
import { strengthCompletenessRule } from './strength-completeness';
import { baseContext, baseProposal } from '../test-fixtures';

const context = baseContext();

function strengthProposal(exerciseCount: number, durationMin = 45) {
  return baseProposal({
    type: 'STRENGTH',
    durationMin,
    strengthPrescription: {
      sets: Array.from({ length: exerciseCount }, (_, index) => ({
        exercise: `Exercice ${index + 1}`,
        intent: 'STRENGTH' as const,
        pattern: 'SQUAT' as const,
        sets: 3,
        reps: 12,
      })),
    },
  });
}

describe('strengthCompletenessRule', () => {
  it('warns on the prehab session that filled half its slot', () => {
    const findings = strengthCompletenessRule(context, strengthProposal(4));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('STRENGTH_SESSION_UNDERFILLED');
    expect(findings[0]?.severity).toBe('WARNING');
    expect(findings[0]?.rationale).toContain('sous-remplie');
  });

  it('accepts a prescription that fills the planned duration', () => {
    expect(strengthCompletenessRule(context, strengthProposal(10))).toEqual([]);
  });

  it('warns when the prescription overflows the slot', () => {
    const findings = strengthCompletenessRule(context, strengthProposal(14, 30));
    expect(findings[0]?.ruleCode).toBe('STRENGTH_SESSION_OVERFILLED');
  });

  it('warns when a strength session carries no exercises at all', () => {
    const findings = strengthCompletenessRule(
      context,
      baseProposal({ type: 'STRENGTH', strengthPrescription: null }),
    );
    expect(findings[0]?.ruleCode).toBe('STRENGTH_PRESCRIPTION_MISSING');
  });

  it('ignores endurance sessions', () => {
    expect(strengthCompletenessRule(context, baseProposal({ type: 'RUN' }))).toEqual([]);
  });

  it('never blocks a plan — warnings only', () => {
    const findings = [
      ...strengthCompletenessRule(context, strengthProposal(3)),
      ...strengthCompletenessRule(context, baseProposal({ type: 'STRENGTH' })),
    ];
    expect(findings.every((f) => f.severity === 'WARNING')).toBe(true);
  });
});

describe('a mobility session trains range, it is not a joint warm-up', () => {
  const mobility = (sets: Array<{ sets: number; reps: number; durationSec?: number }>) =>
    baseProposal({
      type: 'STRENGTH',
      durationMin: 25,
      strengthPrescription: {
        sets: sets.map((set, index) => ({
          exercise: `Mobilité ${index + 1}`,
          intent: 'MOBILITY' as const,
          pattern: null,
          ...set,
        })),
      },
    });
  const circles = { sets: 1, reps: 10 };
  const heldAtEndRange = { sets: 2, reps: 0, durationSec: 60 };

  it('flags a session of circles and swings', () => {
    const findings = strengthCompletenessRule(
      context,
      mobility([
        circles,
        circles,
        circles,
        circles,
        circles,
        { sets: 1, reps: 0, durationSec: 30 },
      ]),
    );
    expect(findings[0]?.ruleCode).toBe('MOBILITY_SESSION_IS_WARMUP');
  });

  it('accepts two preparation moves followed by held range work', () => {
    const findings = strengthCompletenessRule(
      context,
      mobility([circles, circles, heldAtEndRange, heldAtEndRange, heldAtEndRange, heldAtEndRange]),
    );
    expect(findings.map((finding) => finding.ruleCode)).not.toContain('MOBILITY_SESSION_IS_WARMUP');
  });

  it('says nothing of a strength session that opens with a warm-up', () => {
    const findings = strengthCompletenessRule(context, strengthProposal(10));
    expect(findings).toEqual([]);
  });
});
