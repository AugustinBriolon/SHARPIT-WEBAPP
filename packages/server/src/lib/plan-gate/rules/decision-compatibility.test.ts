import { describe, expect, it } from 'vitest';
import { decisionCompatibilityRule } from './decision-compatibility';
import { baseContext, baseProposal, decisionState } from '../test-fixtures';

/** The context's own day: the verdict and the fatigue capacity only speak for it. */
const TODAY = '2026-07-15';
const LATER = '2026-07-17';

describe('decisionCompatibilityRule', () => {
  it('rejects a high-intensity proposal when the verdict is RECOVER', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ date: TODAY, intensity: 'THRESHOLD' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_INTENSITY_CONFLICT');
    expect(findings[0]?.severity).toBe('REJECTED');
    expect(findings[0]?.saferAlternative?.intensity).toBe('ENDURANCE');
  });

  it('rejects TEMPO under RECOVER (aligned with Plan intensity-gate)', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ date: TODAY, intensity: 'TEMPO' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings.some((f) => f.ruleCode === 'DECISION_INTENSITY_CONFLICT')).toBe(true);
    expect(findings.some((f) => f.severity === 'REJECTED')).toBe(true);
  });

  it('rejects TEMPO under CAUTION', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'CAUTION' }) });
    const proposal = baseProposal({ date: TODAY, intensity: 'TEMPO' });

    expect(
      decisionCompatibilityRule(context, proposal).some(
        (f) => f.ruleCode === 'DECISION_INTENSITY_CONFLICT',
      ),
    ).toBe(true);
  });

  it('rejects a high-intensity proposal when the verdict is CAUTION', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'CAUTION' }) });
    const proposal = baseProposal({ date: TODAY, intensity: 'VO2MAX' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings.some((f) => f.ruleCode === 'DECISION_INTENSITY_CONFLICT')).toBe(true);
  });

  it('accepts an endurance session when the verdict is RECOVER', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ date: TODAY, intensity: 'ENDURANCE' });

    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('rejects a hard session when decision is missing (insufficient data is not a decision)', () => {
    const context = baseContext({ decision: null });
    const proposal = baseProposal({ date: TODAY, intensity: 'THRESHOLD' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_INSUFFICIENT_DATA');
    expect(findings[0]?.severity).toBe('REJECTED');
  });

  it('rejects a race when confidence tier is INSUFFICIENT', () => {
    const context = baseContext({
      decision: decisionState({ confidenceTier: 'INSUFFICIENT', overallVerdict: 'TRAIN_HARD' }),
    });
    const proposal = baseProposal({ date: TODAY, intensity: 'RACE' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_INSUFFICIENT_DATA');
    expect(findings[0]?.severity).toBe('REJECTED');
  });

  it('rejects a hard session when confidence tier is LOW, offering endurance', () => {
    const context = baseContext({
      decision: decisionState({ confidenceTier: 'LOW', overallVerdict: 'TRAIN_HARD' }),
    });
    const proposal = baseProposal({ date: TODAY, intensity: 'THRESHOLD' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_LOW_CONFIDENCE');
    expect(findings[0]?.severity).toBe('REJECTED');
    expect(findings[0]?.saferAlternative?.intensity).toBe('ENDURANCE');
    expect(findings[0]?.evidenceRefs).toContain('decision.confidenceTier');
  });

  // A new account has no nights or history yet: its first week must not be rejected whole.
  it.each([
    ['LOW', 'DECISION_LOW_CONFIDENCE'],
    ['INSUFFICIENT', 'DECISION_INSUFFICIENT_DATA'],
  ] as const)(
    'only warns on easy, endurance and strength sessions when confidence is %s',
    (confidenceTier, ruleCode) => {
      const context = baseContext({ decision: decisionState({ confidenceTier }) });
      for (const proposal of [
        baseProposal({ date: TODAY, intensity: 'ENDURANCE' }),
        baseProposal({ date: TODAY, intensity: 'RECOVERY' }),
        baseProposal({ date: TODAY, type: 'STRENGTH', intensity: null }),
      ]) {
        const findings = decisionCompatibilityRule(context, proposal);
        expect(findings).toHaveLength(1);
        expect(findings[0]?.ruleCode).toBe(ruleCode);
        expect(findings[0]?.severity).toBe('WARNING');
      }
    },
  );

  it('only warns on a strength session when there is no decision yet', () => {
    const context = baseContext({ decision: null });
    const findings = decisionCompatibilityRule(
      context,
      baseProposal({ date: TODAY, type: 'STRENGTH', intensity: null }),
    );

    expect(findings[0]?.severity).toBe('WARNING');
  });

  it('does not reject an endurance session on MEDIUM confidence under RECOVER', () => {
    const context = baseContext({
      decision: decisionState({ confidenceTier: 'MEDIUM', overallVerdict: 'RECOVER' }),
    });
    const proposal = baseProposal({ date: TODAY, intensity: 'ENDURANCE' });

    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('rejects any non-recovery session when fatigue capacity is REST_ONLY', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'REST_ONLY',
    });
    const proposal = baseProposal({ date: TODAY, intensity: 'ENDURANCE' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings.some((f) => f.ruleCode === 'FATIGUE_REST_ONLY')).toBe(true);
  });

  it('allows a recovery session when fatigue capacity is REST_ONLY', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'REST_ONLY',
    });
    const proposal = baseProposal({ date: TODAY, intensity: 'RECOVERY' });

    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('rejects high-intensity sessions when fatigue capacity is LIGHT_ONLY', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'LIGHT_ONLY',
    });
    const proposal = baseProposal({ date: TODAY, intensity: 'VO2MAX' });

    expect(
      decisionCompatibilityRule(context, proposal).some((f) => f.ruleCode === 'FATIGUE_LIGHT_ONLY'),
    ).toBe(true);
  });

  it('preserves the original proposal untouched — only saferAlternative differs', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ date: TODAY, intensity: 'THRESHOLD' });

    decisionCompatibilityRule(context, proposal);

    expect(proposal.intensity).toBe('THRESHOLD');
  });

  it('leaves a later day’s hard session alone, whatever today’s verdict', () => {
    for (const overallVerdict of ['RECOVER', 'CAUTION'] as const) {
      const context = baseContext({ decision: decisionState({ overallVerdict }) });
      const proposal = baseProposal({ date: LATER, intensity: 'THRESHOLD' });
      expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
    }
  });

  it('leaves a later day’s session alone when today’s fatigue allows rest only', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'REST_ONLY',
    });
    const proposal = baseProposal({ date: LATER, intensity: 'VO2MAX' });
    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('still withholds a later day’s hard session when the body cannot be read at all', () => {
    for (const decision of [null, decisionState({ confidenceTier: 'LOW' })]) {
      const findings = decisionCompatibilityRule(
        baseContext({ decision }),
        baseProposal({ date: LATER, intensity: 'THRESHOLD' }),
      );
      expect(findings.map((finding) => finding.severity)).toEqual(['REJECTED']);
    }
  });
});
