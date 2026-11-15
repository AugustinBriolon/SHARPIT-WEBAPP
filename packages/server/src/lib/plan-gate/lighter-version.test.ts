import { describe, expect, it } from 'vitest';
import type { GateContext } from '@sharpit/app/lib/plan-gate/types';
import { evaluatePlan } from './evaluate-plan';
import { lighterProposal, offerSessions } from './lighter-version';
import { baseContext, baseProposal, decisionState, physicalHealthData } from './test-fixtures';

type Condition = NonNullable<GateContext['physicalHealth']>['conditions'][number];

const pain = (overrides: Partial<Condition> = {}): Condition => ({
  conditionId: 'cond_1',
  label: 'Douleur genou',
  bodyRegion: 'Genou',
  side: 'LEFT',
  type: 'PAIN',
  affectsTraining: true,
  severity: 4,
  status: 'ACTIVE',
  trend: 'STABLE',
  confidence: 0.8,
  functionalCapacity: 'LIMITED',
  estimatedRecoveryDays: null,
  evidenceObservationIds: [],
  ...overrides,
});

// A confident decision, so the physical-health rule is the only one speaking.
const decision = decisionState();

const limitedByPain = baseContext({
  decision,
  physicalHealth: physicalHealthData({
    aggregateTrainingCapacity: 'LIMITED',
    conditions: [pain()],
  }),
});

const threshold = baseProposal({
  date: '2026-07-17',
  intensity: 'THRESHOLD',
  title: 'Seuil 3 × 10 min',
  load: 80,
  rationale: 'Qualité de la semaine.',
});
const easy = baseProposal({ date: '2026-07-19', intensity: 'ENDURANCE', title: 'Footing' });

describe('lighterProposal', () => {
  it('turns a rejected threshold session into endurance, with the rule’s reason', () => {
    const [result] = evaluatePlan(limitedByPain, [threshold]).sessions;

    expect(lighterProposal(result!)).toMatchObject({
      type: 'RUN',
      date: '2026-07-17',
      intensity: 'ENDURANCE',
      load: 48,
      title: 'Course · Endurance',
      endurancePrescription: null,
      rationale: expect.stringContaining('Capacité limitée par une condition physique active'),
    });
  });

  it('offers nothing for a session that passed', () => {
    const [result] = evaluatePlan(limitedByPain, [easy]).sessions;
    expect(lighterProposal(result!)).toBeNull();
  });

  it('offers nothing when the alternative is another kind of session', () => {
    const unable = baseContext({
      decision,
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'UNABLE',
        conditions: [pain({ severity: 4, functionalCapacity: 'UNABLE' })],
      }),
    });
    const [result] = evaluatePlan(unable, [threshold]).sessions;

    expect(result!.status).toBe('REJECTED');
    expect(lighterProposal(result!)).toBeNull();
  });
});

describe('offerSessions', () => {
  it('returns the gate untouched when nothing was rejected', () => {
    const context = baseContext({ decision });
    const gate = evaluatePlan(context, [easy]);
    const result = offerSessions(context, gate);

    expect(result.gate).toBe(gate);
    expect(result.offered).toEqual([{ index: 0, proposal: easy, lightened: false }]);
  });

  it('keeps a rejected session as its lighter version, gated again', () => {
    const gate = evaluatePlan(limitedByPain, [threshold, easy]);
    const { offered, gate: offeredGate } = offerSessions(limitedByPain, gate);

    expect(offered.map((session) => [session.index, session.lightened])).toEqual([
      [0, true],
      [1, false],
    ]);
    expect(offered[0]!.proposal.intensity).toBe('ENDURANCE');
    expect(offeredGate.sessions).toHaveLength(2);
    expect(offeredGate.sessions.every((session) => session.status !== 'REJECTED')).toBe(true);
  });

  it('drops a rejection that has no lighter version', () => {
    const unable = baseContext({
      decision,
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'UNABLE',
        conditions: [pain({ functionalCapacity: 'UNABLE' })],
      }),
    });
    const gate = evaluatePlan(unable, [threshold]);

    expect(offerSessions(unable, gate)).toMatchObject({ offered: [], gate: { sessions: [] } });
  });
});

describe('offerSessions under several rejecting rules', () => {
  it('drops a lighter version the Gate rejects again', () => {
    // No decision state: the low-confidence rule offers endurance first, which an athlete
    // unable to train must still not be given.
    const unable = baseContext({
      physicalHealth: physicalHealthData({
        aggregateTrainingCapacity: 'UNABLE',
        conditions: [pain({ functionalCapacity: 'UNABLE' })],
      }),
    });
    const gate = evaluatePlan(unable, [threshold]);

    expect(lighterProposal(gate.sessions[0]!)?.intensity).toBe('ENDURANCE');
    expect(offerSessions(unable, gate).offered).toEqual([]);
  });
});
