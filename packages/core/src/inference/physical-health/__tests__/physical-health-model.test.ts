import { describe, expect, it } from 'vitest';
import { runPhysicalHealthModel } from '../model';
import { inferConditionState, inferTrend } from '../scoring';
import type { ConditionInferenceInput } from '../types';

const ref = new Date('2026-07-10T12:00:00Z');

function makeCondition(overrides: Partial<ConditionInferenceInput> = {}): ConditionInferenceInput {
  return {
    id: 'c1',
    label: 'Achille droit',
    bodyRegion: 'Achille',
    side: 'RIGHT',
    type: 'PAIN',
    affectsTraining: true,
    startedAt: new Date('2026-06-01'),
    resolvedAt: null,
    recurrenceCount: 0,
    observations: [],
    functionalCapacities: [],
    episodes: [
      {
        id: 'e1',
        episodeNumber: 1,
        status: 'ACTIVE',
        startedAt: new Date('2026-06-01'),
        resolvedAt: null,
      },
    ],
    ...overrides,
  };
}

describe('inferConditionState', () => {
  it('uses time-decayed severity, not a simple average', () => {
    const condition = makeCondition({
      observations: [
        {
          id: 'o1',
          observedAt: new Date('2026-07-09'),
          symptomPresent: true,
          severityReported: 8,
          functionalImpact: 'LIMITING',
          context: 'MANUAL',
        },
        {
          id: 'o2',
          observedAt: new Date('2026-07-01'),
          symptomPresent: true,
          severityReported: 3,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
      ],
    });

    const result = inferConditionState(condition, ref, ref);
    // The latest reading is the worst: a flare rules the day it is reported.
    expect(result.severity).toBe(8);
    expect(result.evidenceObservationIds.length).toBeGreaterThan(0);
  });

  it('relief has to last: an older flare still weighs on a calmer reading', () => {
    const condition = makeCondition({
      observations: [
        {
          id: 'o1',
          observedAt: new Date('2026-07-09'),
          symptomPresent: true,
          severityReported: 3,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
        {
          id: 'o2',
          observedAt: new Date('2026-07-05'),
          symptomPresent: true,
          severityReported: 8,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
      ],
    });
    const result = inferConditionState(condition, ref, ref);
    expect(result.severity).toBeGreaterThan(3);
    expect(result.severity).toBeLessThan(8);
  });

  it('counts readings at 0: three calm days after a 6 no longer read 6', () => {
    const condition = makeCondition({
      observations: [
        {
          id: 'o1',
          observedAt: new Date('2026-07-09'),
          symptomPresent: false,
          severityReported: 0,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
        {
          id: 'o2',
          observedAt: new Date('2026-07-08'),
          symptomPresent: false,
          severityReported: 0,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
        {
          id: 'o3',
          observedAt: new Date('2026-07-07'),
          symptomPresent: false,
          severityReported: 0,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
        {
          id: 'o4',
          observedAt: new Date('2026-07-02'),
          symptomPresent: true,
          severityReported: 6,
          functionalImpact: 'MILD',
          context: 'MANUAL',
        },
      ],
    });
    const result = inferConditionState(condition, ref, ref);
    expect(result.severity).toBeLessThan(2);
  });

  it('treats severity 0 as asymptomatic evidence, not resolution', () => {
    const condition = makeCondition({
      observations: [
        {
          id: 'o1',
          observedAt: new Date('2026-07-09'),
          symptomPresent: false,
          severityReported: 0,
          functionalImpact: 'NONE',
          context: 'AFTER_SESSION',
        },
      ],
      functionalCapacities: [
        {
          id: 'fc1',
          observationId: 'o1',
          assessedAt: new Date('2026-07-09'),
          painSeverity: 0,
          trainingCapacity: 'FULL',
        },
      ],
    });

    const result = inferConditionState(condition, ref, ref);
    expect(result.severity).toBe(0);
    expect(result.functionalCapacity).toBe('FULL');
    expect(result.status).not.toBe('RESOLVED');
  });

  it('separates low pain from limited training capacity', () => {
    const condition = makeCondition({
      observations: [
        {
          id: 'o1',
          observedAt: new Date('2026-07-09'),
          symptomPresent: true,
          severityReported: 2,
          functionalImpact: 'LIMITING',
          context: 'MANUAL',
        },
      ],
      functionalCapacities: [
        {
          id: 'fc1',
          observationId: 'o1',
          assessedAt: new Date('2026-07-09'),
          painSeverity: 2,
          trainingCapacity: 'UNABLE',
        },
      ],
    });

    const result = inferConditionState(condition, ref, ref);
    expect(result.severity).toBeLessThanOrEqual(3);
    expect(result.functionalCapacity).toBe('UNABLE');
  });

  it('detects recurrence after resolved episode', () => {
    const condition = makeCondition({
      resolvedAt: new Date('2026-06-20'),
      recurrenceCount: 0,
      episodes: [
        {
          id: 'e1',
          episodeNumber: 1,
          status: 'RESOLVED',
          startedAt: new Date('2026-06-01'),
          resolvedAt: new Date('2026-06-20'),
        },
      ],
      observations: [
        {
          id: 'o1',
          observedAt: new Date('2026-07-09'),
          symptomPresent: true,
          severityReported: 5,
          functionalImpact: 'MODERATE',
          context: 'MANUAL',
        },
      ],
    });

    const result = inferConditionState(condition, ref, ref);
    expect(result.status).toBe('RECURRENT');
    // The relapse is counted once, where it is declared, not on each inference.
    expect(result.update.recurrenceCount).toBe(0);
  });
});

describe('runPhysicalHealthModel', () => {
  it('produces aggregate state with confidence and evidence', () => {
    const output = runPhysicalHealthModel({
      athleteId: 'a1',
      trainingDayId: '2026-07-10',
      referenceAt: ref,
      conditions: [
        makeCondition({
          observations: [
            {
              id: 'o1',
              observedAt: new Date('2026-07-09'),
              symptomPresent: true,
              severityReported: 6,
              functionalImpact: 'MODERATE',
              context: 'MANUAL',
            },
            {
              id: 'o2',
              observedAt: new Date('2026-07-07'),
              symptomPresent: true,
              severityReported: 7,
              functionalImpact: 'LIMITING',
              context: 'MANUAL',
            },
            {
              id: 'o3',
              observedAt: new Date('2026-07-05'),
              symptomPresent: true,
              severityReported: 8,
              functionalImpact: 'LIMITING',
              context: 'MANUAL',
            },
          ],
        }),
      ],
    });

    expect(output.physicalHealthState.modelId).toBe('physical-health-v1');
    expect(output.physicalHealthState.activeConditionCount).toBe(1);
    expect(output.physicalHealthState.confidence).toBeGreaterThan(0);
    expect(output.conditionUpdates).toHaveLength(1);
    expect(output.decision.verdict).not.toBe('INSUFFICIENT_DATA');
  });

  it('returns CLEAR when no active conditions', () => {
    const output = runPhysicalHealthModel({
      athleteId: 'a1',
      trainingDayId: '2026-07-10',
      referenceAt: ref,
      conditions: [],
    });

    expect(output.decision.verdict).toBe('CLEAR');
    expect(output.physicalHealthState.aggregateTrainingCapacity).toBe('FULL');
  });
});

describe('inferTrend', () => {
  it('classifies improving trend from decreasing severities', () => {
    const observations = [
      {
        id: '1',
        observedAt: new Date('2026-07-01'),
        symptomPresent: true,
        severityReported: 8,
        functionalImpact: null,
        context: 'MANUAL',
      },
      {
        id: '2',
        observedAt: new Date('2026-07-05'),
        symptomPresent: true,
        severityReported: 5,
        functionalImpact: null,
        context: 'MANUAL',
      },
      {
        id: '3',
        observedAt: new Date('2026-07-09'),
        symptomPresent: true,
        severityReported: 2,
        functionalImpact: null,
        context: 'MANUAL',
      },
    ];

    expect(inferTrend(observations, ref)).toBe('IMPROVING');
  });
});
