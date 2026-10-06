import { describe, expect, it } from 'vitest';
import { decisionCompatibilityRule } from './decision-compatibility';
import { baseContext, baseProposal, decisionState } from '../test-fixtures';

describe('decisionCompatibilityRule', () => {
  it('rejects a high-intensity proposal when the verdict is RECOVER', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ intensity: 'THRESHOLD' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_INTENSITY_CONFLICT');
    expect(findings[0]?.severity).toBe('REJECTED');
    expect(findings[0]?.saferAlternative?.intensity).toBe('ENDURANCE');
  });

  it('rejects TEMPO under RECOVER (aligned with Plan intensity-gate)', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ intensity: 'TEMPO' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings.some((f) => f.ruleCode === 'DECISION_INTENSITY_CONFLICT')).toBe(true);
    expect(findings.some((f) => f.severity === 'REJECTED')).toBe(true);
  });

  it('rejects TEMPO under CAUTION', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'CAUTION' }) });
    const proposal = baseProposal({ intensity: 'TEMPO' });

    expect(
      decisionCompatibilityRule(context, proposal).some(
        (f) => f.ruleCode === 'DECISION_INTENSITY_CONFLICT',
      ),
    ).toBe(true);
  });

  it('rejects a high-intensity proposal when the verdict is CAUTION', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'CAUTION' }) });
    const proposal = baseProposal({ intensity: 'VO2MAX' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings.some((f) => f.ruleCode === 'DECISION_INTENSITY_CONFLICT')).toBe(true);
  });

  it('accepts an endurance session when the verdict is RECOVER', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ intensity: 'ENDURANCE' });

    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('rejects when decision is missing (insufficient data is not a decision)', () => {
    const context = baseContext({ decision: null });
    const proposal = baseProposal({ intensity: 'THRESHOLD' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_INSUFFICIENT_DATA');
    expect(findings[0]?.severity).toBe('REJECTED');
  });

  it('rejects when confidence tier is INSUFFICIENT', () => {
    const context = baseContext({
      decision: decisionState({ confidenceTier: 'INSUFFICIENT', overallVerdict: 'TRAIN_HARD' }),
    });
    const proposal = baseProposal({ intensity: 'RACE' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_INSUFFICIENT_DATA');
    expect(findings[0]?.severity).toBe('REJECTED');
  });

  it('rejects when confidence tier is LOW', () => {
    const context = baseContext({
      decision: decisionState({ confidenceTier: 'LOW', overallVerdict: 'TRAIN_HARD' }),
    });
    const proposal = baseProposal({ intensity: 'ENDURANCE' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('DECISION_LOW_CONFIDENCE');
    expect(findings[0]?.severity).toBe('REJECTED');
    expect(findings[0]?.evidenceRefs).toContain('decision.confidenceTier');
  });

  it('does not reject an endurance session on MEDIUM confidence under RECOVER', () => {
    const context = baseContext({
      decision: decisionState({ confidenceTier: 'MEDIUM', overallVerdict: 'RECOVER' }),
    });
    const proposal = baseProposal({ intensity: 'ENDURANCE' });

    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('rejects any non-recovery session when fatigue capacity is REST_ONLY', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'REST_ONLY',
    });
    const proposal = baseProposal({ intensity: 'ENDURANCE' });

    const findings = decisionCompatibilityRule(context, proposal);

    expect(findings.some((f) => f.ruleCode === 'FATIGUE_REST_ONLY')).toBe(true);
  });

  it('allows a recovery session when fatigue capacity is REST_ONLY', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'REST_ONLY',
    });
    const proposal = baseProposal({ intensity: 'RECOVERY' });

    expect(decisionCompatibilityRule(context, proposal)).toEqual([]);
  });

  it('rejects high-intensity sessions when fatigue capacity is LIGHT_ONLY', () => {
    const context = baseContext({
      decision: decisionState(),
      fatigueTrainingCapacity: 'LIGHT_ONLY',
    });
    const proposal = baseProposal({ intensity: 'VO2MAX' });

    expect(
      decisionCompatibilityRule(context, proposal).some((f) => f.ruleCode === 'FATIGUE_LIGHT_ONLY'),
    ).toBe(true);
  });

  it('preserves the original proposal untouched — only saferAlternative differs', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ intensity: 'THRESHOLD' });

    decisionCompatibilityRule(context, proposal);

    expect(proposal.intensity).toBe('THRESHOLD');
  });
});
