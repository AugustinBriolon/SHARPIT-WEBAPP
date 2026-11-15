import { describe, expect, it } from 'vitest';
import type { GateContext } from '@sharpit/app/lib/plan-gate/types';
import { physicalHealthRule } from './physical-health';
import { baseContext, baseProposal, physicalHealthData } from '../test-fixtures';

describe('physicalHealthRule', () => {
  it('rejects any proposal when trainingBlockedByCondition is true', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({ trainingBlockedByCondition: true }),
    });

    const findings = physicalHealthRule(context, baseProposal({ intensity: 'RECOVERY' }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('PHYSICAL_HEALTH_BLOCKED');
    expect(findings[0]?.severity).toBe('REJECTED');
  });

  it('rejects any proposal when aggregate capacity is UNABLE', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({ aggregateTrainingCapacity: 'UNABLE' }),
    });

    const findings = physicalHealthRule(context, baseProposal());

    expect(findings.some((f) => f.ruleCode === 'PHYSICAL_HEALTH_UNABLE')).toBe(true);
    expect(findings[0]?.saferAlternative?.intensity).toBe('RECOVERY');
  });

  it('rejects high-intensity proposals when capacity is LIMITED, but allows endurance', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({ aggregateTrainingCapacity: 'LIMITED' }),
    });

    const rejected = physicalHealthRule(context, baseProposal({ intensity: 'THRESHOLD' }));
    const allowed = physicalHealthRule(context, baseProposal({ intensity: 'ENDURANCE' }));

    expect(rejected.some((f) => f.ruleCode === 'PHYSICAL_HEALTH_LIMITED')).toBe(true);
    expect(allowed).toEqual([]);
  });

  it('requires confirmation (not rejection) for high intensity when capacity is REDUCED', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({ aggregateTrainingCapacity: 'REDUCED' }),
    });

    const findings = physicalHealthRule(context, baseProposal({ intensity: 'VO2MAX' }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('REQUIRES_CONFIRMATION');
  });

  // The prod case behind this rule: one posture note at 4/10 withheld every tempo and threshold
  // session for four months.
  const condition = (
    overrides: Partial<NonNullable<GateContext['physicalHealth']>['conditions'][number]>,
  ) => ({
    conditionId: 'cond_1',
    label: 'Pied en canard',
    bodyRegion: 'Pied',
    side: 'BILATERAL' as const,
    type: 'POSTURE_ISSUE',
    affectsTraining: true,
    severity: 4,
    status: 'NEW' as const,
    trend: 'UNKNOWN' as const,
    confidence: 0.43,
    functionalCapacity: 'LIMITED' as const,
    estimatedRecoveryDays: null,
    evidenceObservationIds: [],
    ...overrides,
  });

  it('lets high intensity through when only a posture or mobility condition limits capacity', () => {
    for (const type of ['POSTURE_ISSUE', 'MOBILITY_LIMITATION']) {
      const context = baseContext({
        physicalHealth: physicalHealthData({
          aggregateTrainingCapacity: 'LIMITED',
          conditions: [condition({ type })],
        }),
      });
      expect(physicalHealthRule(context, baseProposal({ intensity: 'THRESHOLD' }))).toEqual([]);
    }
  });

  it('never blocks training on a posture condition, however severe', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'LIMITED',
        trainingBlockedByCondition: true,
        conditions: [condition({ severity: 6 })],
      }),
    });
    expect(physicalHealthRule(context, baseProposal({ intensity: 'ENDURANCE' }))).toEqual([]);
  });

  it('still rejects high intensity when a pain limits capacity beside a posture condition', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'LIMITED',
        conditions: [condition({}), condition({ conditionId: 'cond_2', type: 'PAIN' })],
      }),
    });
    const findings = physicalHealthRule(context, baseProposal({ intensity: 'THRESHOLD' }));
    expect(findings.map((finding) => finding.ruleCode)).toEqual(['PHYSICAL_HEALTH_LIMITED']);
  });

  it('asks for confirmation when the only real pain leaves capacity reduced', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'LIMITED',
        conditions: [
          condition({}),
          condition({
            conditionId: 'cond_2',
            type: 'PAIN',
            severity: 2,
            functionalCapacity: 'REDUCED',
          }),
        ],
      }),
    });
    const findings = physicalHealthRule(context, baseProposal({ intensity: 'THRESHOLD' }));
    expect(findings.map((finding) => finding.ruleCode)).toEqual(['PHYSICAL_HEALTH_REDUCED']);
  });

  it('ignores a resolved pain', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'LIMITED',
        conditions: [condition({ type: 'PAIN', status: 'RESOLVED' })],
      }),
    });
    expect(physicalHealthRule(context, baseProposal({ intensity: 'THRESHOLD' }))).toEqual([]);
  });

  it('is silent when no physical-health data exists', () => {
    const context = baseContext({ physicalHealth: null });
    expect(physicalHealthRule(context, baseProposal({ intensity: 'RACE' }))).toEqual([]);
  });

  it('is silent when capacity is FULL', () => {
    const context = baseContext({
      physicalHealth: physicalHealthData({ aggregateTrainingCapacity: 'FULL' }),
    });
    expect(physicalHealthRule(context, baseProposal({ intensity: 'RACE' }))).toEqual([]);
  });
});
