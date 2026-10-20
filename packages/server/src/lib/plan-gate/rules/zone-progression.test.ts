import { describe, expect, it } from 'vitest';
import { zoneRampRule, zoneReturnIntensityRule } from './zone-progression';
import { baseContext, baseProposal } from '../test-fixtures';
import type { GateContext } from '@sharpit/app/lib/plan-gate/types';

function knee(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Tendinite rotulienne',
    bodyPart: 'Genou',
    side: 'RIGHT',
    category: 'PAIN',
    status: 'MONITORING',
    severity: 2,
    affectsTraining: true,
    resolvedAt: null,
    ...overrides,
  };
}

function withZones(zones: Array<Record<string, unknown>>, extra: Partial<GateContext> = {}) {
  return baseContext({ trainingZones: zones, ...extra });
}

const boxJump = { exercise: 'Box jump', intent: 'PLYOMETRIC', pattern: 'SQUAT', sets: 3, reps: 6 };
const squat = { exercise: 'Squat', intent: 'STRENGTH', pattern: 'SQUAT', sets: 3, reps: 10 };

function strength(sets: Array<Record<string, unknown>>) {
  return baseProposal({
    type: 'STRENGTH',
    intensity: 'ENDURANCE',
    strengthPrescription: { sets } as never,
  });
}

describe('zoneReturnIntensityRule', () => {
  it('warns on jumps over a knee coming back, not on a controlled squat', () => {
    const [finding] = zoneReturnIntensityRule(withZones([knee()]), strength([boxJump, squat]));
    expect(finding?.ruleCode).toBe('RETURNING_ZONE_PLYOMETRICS');
    expect(finding?.rationale).toContain('Box jump');
    expect(finding?.rationale).not.toContain('Squat,');
    expect(zoneReturnIntensityRule(withZones([knee()]), strength([squat]))).toEqual([]);
  });

  it('warns on a VO2max run over a returning knee, not on an endurance run', () => {
    const context = withZones([knee()]);
    const [finding] = zoneReturnIntensityRule(
      context,
      baseProposal({ type: 'RUN', intensity: 'VO2MAX' }),
    );
    expect(finding?.ruleCode).toBe('RETURNING_ZONE_PEAK_INTENSITY');
    expect(zoneReturnIntensityRule(context, baseProposal({ type: 'RUN' }))).toEqual([]);
  });

  it('watches a pain resolved three weeks ago, not one resolved three months ago', () => {
    const recent = knee({ status: 'RESOLVED', resolvedAt: new Date('2026-06-24') });
    const old = knee({ status: 'RESOLVED', resolvedAt: new Date('2026-04-01') });
    const vo2 = baseProposal({ type: 'RUN', intensity: 'VO2MAX' });
    expect(zoneReturnIntensityRule(withZones([recent]), vo2)).toHaveLength(1);
    expect(zoneReturnIntensityRule(withZones([old]), vo2)).toEqual([]);
  });

  it('leaves a protected zone to the sensitive-zone rule', () => {
    const vo2 = baseProposal({ type: 'RUN', intensity: 'VO2MAX' });
    expect(
      zoneReturnIntensityRule(withZones([knee({ status: 'ACTIVE', severity: 6 })]), vo2),
    ).toEqual([]);
  });
});

describe('zoneRampRule', () => {
  // Week of 6 July: 7 × 30 TSS = 210. Proposals land in the week of 13 July.
  const previousWeek = Array.from({ length: 7 }, (_, i) => ({
    load: 30,
    date: new Date(`2026-07-${String(6 + i).padStart(2, '0')}T12:00:00Z`),
  }));

  it('warns when the week climbs more than 10 % with a returning zone', () => {
    const context = withZones([knee()], { dailyTrainingStress: previousWeek });
    const proposals = [
      baseProposal({ date: '2026-07-14', load: 120 }),
      baseProposal({ date: '2026-07-16', load: 120 }),
    ];
    const [finding] = zoneRampRule(context, proposals);
    expect(finding?.ruleCode).toBe('RETURNING_ZONE_RAMP');
    expect(finding?.rationale).toContain('240 TSS prévus contre 210');
  });

  it('is silent within the cap, or with no zone coming back', () => {
    const proposals = [baseProposal({ date: '2026-07-14', load: 220 })];
    expect(
      zoneRampRule(withZones([knee()], { dailyTrainingStress: previousWeek }), proposals),
    ).toEqual([]);
    const heavy = [baseProposal({ date: '2026-07-14', load: 400 })];
    expect(zoneRampRule(withZones([], { dailyTrainingStress: previousWeek }), heavy)).toEqual([]);
  });

  it('ignores a week whose sessions never touch the zone', () => {
    const shoulderOnly = [baseProposal({ date: '2026-07-14', type: 'SWIM', load: 400 })];
    expect(
      zoneRampRule(withZones([knee()], { dailyTrainingStress: previousWeek }), shoulderOnly),
    ).toEqual([]);
  });
});
