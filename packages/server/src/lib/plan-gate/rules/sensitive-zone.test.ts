import { describe, expect, it } from 'vitest';
import { sensitiveZoneRule } from './sensitive-zone';
import { baseContext, baseProposal, physicalHealthData } from '../test-fixtures';
import type { GateContext } from '@sharpit/app/lib/plan-gate/types';

/** The coach declares what each movement does; the rule judges the declaration. */
const UPPER_LEGS_EXERCISE = {
  exercise: 'Squat',
  intent: 'STRENGTH',
  pattern: 'SQUAT',
  sets: 3,
  reps: 12,
};
const SHOULDER_EXERCISE = {
  exercise: 'Élévation latérale',
  intent: 'STRENGTH',
  pattern: 'SHOULDER_ABDUCTION',
  sets: 3,
  reps: 12,
};
/** Prehab on the injured zone — mobility, not load. */
const UPPER_LEGS_STRETCH = {
  exercise: 'Étirement ischio-jambiers',
  intent: 'MOBILITY',
  pattern: null,
  sets: 2,
  reps: 0,
};

type Condition = NonNullable<GateContext['physicalHealth']>['conditions'][number];

function condition(overrides: Partial<Condition> = {}): Condition {
  return {
    conditionId: 'c1',
    label: 'Nerf sciatique',
    bodyRegion: 'Ischio',
    side: 'LEFT',
    type: 'PAIN',
    affectsTraining: true,
    severity: 3,
    status: 'ACTIVE',
    trend: 'STABLE',
    confidence: 0.8,
    functionalCapacity: 'REDUCED',
    estimatedRecoveryDays: null,
    evidenceObservationIds: [],
    ...overrides,
  } as Condition;
}

function contextWith(conditions: Condition[]): GateContext {
  return baseContext({ physicalHealth: physicalHealthData({ conditions }) });
}

function strengthProposal(sets: Array<Record<string, unknown>>) {
  return baseProposal({
    type: 'STRENGTH',
    intensity: 'RECOVERY',
    strengthPrescription: { sets } as NonNullable<
      ReturnType<typeof baseProposal>['strengthPrescription']
    >,
  });
}

describe('sensitiveZoneRule', () => {
  it('warns when an exercise loads a zone the athlete protects', () => {
    const findings = sensitiveZoneRule(
      contextWith([condition()]),
      strengthProposal([UPPER_LEGS_EXERCISE]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleCode).toBe('SENSITIVE_ZONE_LOADED');
    expect(findings[0]?.severity).toBe('WARNING');
    expect(findings[0]?.rationale).toContain('Nerf sciatique');
    expect(findings[0]?.rationale).toContain('Squat');
  });

  it('never flags mobility work on the injured zone — that is the treatment', () => {
    expect(
      sensitiveZoneRule(contextWith([condition()]), strengthProposal([UPPER_LEGS_STRETCH])),
    ).toEqual([]);
  });

  it('leaves an exercise on another body group alone', () => {
    expect(
      sensitiveZoneRule(contextWith([condition()]), strengthProposal([SHOULDER_EXERCISE])),
    ).toEqual([]);
  });

  it('says nothing about posture or mobility work — they are not a load restriction', () => {
    const posture = condition({
      type: 'POSTURE_ISSUE',
      label: 'Bassin rétroversé',
      bodyRegion: 'Bassin',
    });

    expect(
      sensitiveZoneRule(contextWith([posture]), strengthProposal([UPPER_LEGS_EXERCISE])),
    ).toEqual([]);
  });

  it('ignores a condition the athlete declared harmless for training', () => {
    expect(
      sensitiveZoneRule(
        contextWith([condition({ affectsTraining: false })]),
        strengthProposal([UPPER_LEGS_EXERCISE]),
      ),
    ).toEqual([]);
  });

  it('flags an endurance sport that loads the protected zone', () => {
    const findings = sensitiveZoneRule(contextWith([condition()]), baseProposal({ type: 'RUN' }));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rationale).toContain('Ce sport sollicite');
    expect(findings[0]?.rationale).toContain('Nerf sciatique (gauche, sévérité 3/10)');
  });

  it('leaves a sport that loads elsewhere alone', () => {
    expect(sensitiveZoneRule(contextWith([condition()]), baseProposal({ type: 'SWIM' }))).toEqual(
      [],
    );
  });

  it('says nothing about a strength session carrying no prescription', () => {
    expect(
      sensitiveZoneRule(contextWith([condition()]), baseProposal({ type: 'STRENGTH' })),
    ).toEqual([]);
  });

  it('names the worst zone first', () => {
    const findings = sensitiveZoneRule(
      contextWith([
        condition({ conditionId: 'c1', label: 'Gêne légère', severity: 1 }),
        condition({ conditionId: 'c2', label: 'Tendinite', severity: 8 }),
      ]),
      baseProposal({ type: 'RUN' }),
    );
    const rationale = findings[0]?.rationale ?? '';

    expect(rationale.indexOf('Tendinite')).toBeLessThan(rationale.indexOf('Gêne légère'));
  });

  it('stays quiet for an athlete with nothing to protect', () => {
    expect(sensitiveZoneRule(baseContext(), strengthProposal([UPPER_LEGS_EXERCISE]))).toEqual([]);
  });
});

describe('sensitiveZoneRule — declared zones (ADR-068)', () => {
  const declared = (overrides: Record<string, unknown> = {}) => ({
    title: 'Tendon du biceps fémoral',
    bodyPart: 'Genou',
    side: 'NA',
    category: 'PAIN',
    status: 'ACTIVE',
    severity: 4,
    affectsTraining: true,
    ...overrides,
  });
  const run = baseProposal({ type: 'RUN' });

  it('reads the declaration over the snapshot', () => {
    const context = {
      ...contextWith([condition({ bodyRegion: 'Épaule', label: 'Coiffe' })]),
      trainingZones: [declared()],
    };
    const [finding] = sensitiveZoneRule(context, run);
    expect(finding?.rationale).toContain('Tendon du biceps fémoral');
  });

  it('no longer flags a zone under watch or silent at 0/10', () => {
    for (const zone of [
      declared({ status: 'MONITORING', severity: 2 }),
      declared({ severity: 0 }),
    ]) {
      expect(sensitiveZoneRule({ ...contextWith([]), trainingZones: [zone] }, run)).toEqual([]);
    }
  });

  it('still flags a zone under watch that limits training', () => {
    const zone = declared({ status: 'MONITORING', severity: 1, functionalImpact: 'LIMITING' });
    expect(sensitiveZoneRule({ ...contextWith([]), trainingZones: [zone] }, run)).toHaveLength(1);
  });
});
