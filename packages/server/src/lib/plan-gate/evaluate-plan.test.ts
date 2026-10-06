import { describe, expect, it } from 'vitest';
import { evaluatePlan } from './evaluate-plan';
import { baseContext, baseProposal, decisionState, physicalHealthData } from './test-fixtures';

describe('evaluatePlan', () => {
  it('produces one GateSessionResult per proposal, in the same order', () => {
    const context = baseContext();
    const proposals = [
      baseProposal({ date: '2026-07-16' }),
      baseProposal({ date: '2026-07-17' }),
      baseProposal({ date: '2026-07-18' }),
    ];

    const result = evaluatePlan(context, proposals);

    expect(result.sessions).toHaveLength(3);
    expect(result.sessions.map((s) => s.proposal.date)).toEqual([
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ]);
  });

  it('is deterministic — identical context and proposals produce identical results', () => {
    const context = baseContext({
      decision: decisionState({ overallVerdict: 'RECOVER' }),
      physicalHealth: physicalHealthData({ aggregateTrainingCapacity: 'REDUCED' }),
    });
    const proposals = [baseProposal({ intensity: 'THRESHOLD' })];

    const first = evaluatePlan(context, proposals);
    const second = evaluatePlan(context, proposals);

    expect(first).toEqual(second);
  });

  it('marks a fully-passing proposal ACCEPTED with no findings', () => {
    const context = baseContext({ decision: decisionState() });
    const result = evaluatePlan(context, [baseProposal()]);

    expect(result.sessions[0]?.status).toBe('ACCEPTED');
    expect(result.sessions[0]?.findings).toEqual([]);
  });

  it('escalates status to the worst finding across all rules for a proposal', () => {
    // REJECTED (decision) + REQUIRES_CONFIRMATION (data-sufficiency) on the same proposal —
    // overall status must be REJECTED, and both findings must still be present.
    const context = baseContext({
      decision: decisionState({ overallVerdict: 'CAUTION' }),
      athleteProfile: { hasThresholds: false },
    });
    const result = evaluatePlan(context, [baseProposal({ intensity: 'THRESHOLD' })]);

    expect(result.sessions[0]?.status).toBe('REJECTED');
    const codes = result.sessions[0]?.findings.map((f) => f.ruleCode) ?? [];
    expect(codes).toContain('DECISION_INTENSITY_CONFLICT');
    expect(codes).toContain('MISSING_THRESHOLDS');
  });

  it('preserves the original proposal object on every result, never mutating it', () => {
    const context = baseContext({ decision: decisionState({ overallVerdict: 'RECOVER' }) });
    const proposal = baseProposal({ intensity: 'RACE', title: 'Original title' });

    const result = evaluatePlan(context, [proposal]);

    expect(result.sessions[0]?.proposal).toBe(proposal);
    expect(result.sessions[0]?.proposal.title).toBe('Original title');
    expect(result.sessions[0]?.saferAlternative).not.toBeNull();
    expect(result.sessions[0]?.saferAlternative?.title).toBe('Original title');
  });

  it('collects requiredAssumptions from data-sufficiency findings', () => {
    const context = baseContext({
      decision: decisionState(),
      athleteProfile: { hasThresholds: false },
    });
    const result = evaluatePlan(context, [baseProposal({ intensity: 'THRESHOLD' })]);

    expect(result.sessions[0]?.requiredAssumptions).toHaveLength(1);
  });

  it('rejects the whole batch when decision data is missing or low-confidence', () => {
    const context = baseContext({ decision: null });
    const proposals = [
      baseProposal({ intensity: 'ENDURANCE' }),
      baseProposal({ date: '2026-07-18', intensity: 'RECOVERY' }),
    ];

    const result = evaluatePlan(context, proposals);

    expect(result.sessions.every((s) => s.status === 'REJECTED')).toBe(true);
    expect(
      result.sessions.every((s) =>
        s.findings.some((f) => f.ruleCode === 'DECISION_INSUFFICIENT_DATA'),
      ),
    ).toBe(true);
  });

  it('produces plan-level findings independent of per-session findings', () => {
    const context = baseContext({
      planWeeks: [{ weekStart: new Date('2026-07-13T00:00:00Z'), phase: 'BUILD', targetLoad: 50 }],
    });
    const proposals = [baseProposal({ date: '2026-07-14', load: 200 })];

    const result = evaluatePlan(context, proposals);

    expect(result.planLevelFindings.some((f) => f.ruleCode === 'WEEKLY_LOAD_EXCEEDED')).toBe(true);
  });
});
