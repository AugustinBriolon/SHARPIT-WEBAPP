/**
 * REASONING ENGINE v1 — Unit Tests
 *
 * Tests the pure scoring and model functions in isolation.
 * No database, no infrastructure, no mocks needed.
 *
 * Test strategy:
 *   - Direction mapping for each model state (recovery / fatigue / adaptation)
 *   - Consistency computation (ALIGNED / PARTIALLY_ALIGNED / CONFLICTING)
 *   - Verdict synthesis with safety-first ordering
 *   - Conflict detection (CAPACITY_CONFLICT)
 *   - Opportunity detection (LOAD_INCREASE, RACE_READINESS)
 *   - Full model: determinism, cold start (null models), overreaching safety
 */

import { describe, it, expect } from 'vitest';
import {
  mapRecoveryDirection,
  mapFatigueDirection,
  mapAdaptationDirection,
  computeConsistency,
  arbitrateModelConflict,
  synthesizeVerdict,
  detectConflicts,
  detectOpportunities,
} from '../scoring';
import { runReasoningModel } from '../model';
import type { RecoveryState, FatigueState, AdaptationState } from '../../../digital-twin/types';
import type { ReasoningModelInput } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRecovery(overrides: Partial<RecoveryState> = {}): RecoveryState {
  return {
    readinessScore: 75,
    readinessCategory: 'ADEQUATE',
    dimensions: {
      autonomic: { score: 75, status: 'NORMAL', available: true },
      sleep: { score: 70, status: 'adequate', available: true },
      subjective: { score: 65, status: 'NORMAL', available: true },
      loadContext: { score: 60, status: 'ELEVATED', available: true },
    },
    primaryLimitingFactor: 'loadContext',
    estimatedTimeToFullRecovery: null,
    overreachingRisk: 'LOW',
    illnessRisk: 'LOW',
    dissonanceDetected: false,
    confidence: 0.85,
    dataCompleteness: 'FULL',
    modelId: 'recovery-synthesis-v1',
    computedAt: new Date('2026-07-02'),
    trainingDayId: '2026-07-02',
    ...overrides,
  };
}

function makeFatigue(overrides: Partial<FatigueState> = {}): FatigueState {
  return {
    fatigueIndex: 25,
    fatigueLevel: 'FUNCTIONAL_LOW',
    fatigueType: 'LOAD_DOMINANT',
    dimensions: {
      load: { score: 30, status: 'moderate', available: true },
      neuromuscular: { score: 20, status: 'low', available: true },
      metabolic: { score: 15, status: 'low', available: true },
      cumulative: { score: 10, status: 'low', available: true },
      psychological: { score: 8, status: 'low', available: true },
    },
    trajectory: 'STABLE',
    consecutiveAccumulationDays: 0,
    dominantDimension: 'LOAD',
    primaryLimitingFactor: null,
    functionalOverreachingRisk: 'LOW',
    estimatedTimeToFresh: null,
    performanceImpairmentEstimate: 5,
    trainingCapacity: 'FULL',
    confidence: 0.8,
    dataCompleteness: 'FULL',
    modelId: 'fatigue-v1',
    computedAt: new Date('2026-07-02'),
    trainingDayId: '2026-07-02',
    ...overrides,
  };
}

function makeAdaptation(overrides: Partial<AdaptationState> = {}): AdaptationState {
  return {
    adaptationIndex: 65,
    adaptationStatus: 'MAINTAINING',
    adaptationTrend: 'STABLE',
    dimensions: {
      loadProgression: { score: 65, status: 'adequate', available: true },
      neuromuscularEfficiency: { score: 68, status: 'good', available: true },
      autonomicAdaptation: { score: 62, status: 'normal', available: true },
      recoveryQuality: { score: 70, status: 'good', available: true },
    },
    limitingFactor: null,
    estimatedAdaptationPeak: null,
    plateauRisk: false,
    overreachingWithoutAdaptationDetected: false,
    confidence: 0.8,
    dataCompleteness: 'FULL',
    modelId: 'adaptation-v1',
    computedAt: new Date('2026-07-02'),
    trainingDayId: '2026-07-02',
    ...overrides,
  };
}

function makeInput(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningModelInput {
  return {
    trainingDayId: '2026-07-02',
    athleteId: 'test-athlete',
    athleteState: { recovery: r, fatigue: f, adaptation: a, reasoning: null, physicalHealth: null },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Direction mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('mapRecoveryDirection', () => {
  it('null → UNKNOWN', () => {
    expect(mapRecoveryDirection(null)).toBe('UNKNOWN');
  });

  it('OPTIMAL → TRAIN', () => {
    expect(mapRecoveryDirection(makeRecovery({ readinessCategory: 'OPTIMAL' }))).toBe('TRAIN');
  });

  it('ADEQUATE → TRAIN', () => {
    expect(mapRecoveryDirection(makeRecovery({ readinessCategory: 'ADEQUATE' }))).toBe('TRAIN');
  });

  it('LOW readiness → REST', () => {
    expect(
      mapRecoveryDirection(makeRecovery({ readinessCategory: 'LOW', overreachingRisk: 'HIGH' })),
    ).toBe('REST');
  });

  it('overreachingRisk HIGH + ADEQUATE → TRAIN (direction maps on readinessCategory, not risk)', () => {
    expect(
      mapRecoveryDirection(
        makeRecovery({ readinessCategory: 'ADEQUATE', overreachingRisk: 'HIGH' }),
      ),
    ).toBe('TRAIN');
  });
});

describe('mapFatigueDirection', () => {
  it('null → UNKNOWN', () => {
    expect(mapFatigueDirection(null)).toBe('UNKNOWN');
  });

  it('FRESH → TRAIN', () => {
    expect(
      mapFatigueDirection(makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL' })),
    ).toBe('TRAIN');
  });

  it('REST_ONLY capacity → REST', () => {
    expect(
      mapFatigueDirection(
        makeFatigue({ trainingCapacity: 'REST_ONLY', fatigueLevel: 'OVERREACHING_RISK' }),
      ),
    ).toBe('REST');
  });

  it('OVERREACHING_RISK level → REST', () => {
    expect(
      mapFatigueDirection(
        makeFatigue({ fatigueLevel: 'OVERREACHING_RISK', trainingCapacity: 'REDUCED' }),
      ),
    ).toBe('REST');
  });
});

describe('mapAdaptationDirection', () => {
  it('null → UNKNOWN', () => {
    expect(mapAdaptationDirection(null)).toBe('UNKNOWN');
  });

  it('POSITIVELY_ADAPTING → TRAIN', () => {
    expect(
      mapAdaptationDirection(makeAdaptation({ adaptationStatus: 'POSITIVELY_ADAPTING' })),
    ).toBe('TRAIN');
  });

  it('PLATEAUING → EASY', () => {
    expect(mapAdaptationDirection(makeAdaptation({ adaptationStatus: 'PLATEAUING' }))).toBe('EASY');
  });

  it('MALADAPTING → REST', () => {
    expect(mapAdaptationDirection(makeAdaptation({ adaptationStatus: 'MALADAPTING' }))).toBe(
      'REST',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Consistency computation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeConsistency', () => {
  it('all TRAIN → ALIGNED with score 100', () => {
    const result = computeConsistency({ recovery: 'TRAIN', fatigue: 'TRAIN', adaptation: 'TRAIN' });
    expect(result.consistency).toBe('ALIGNED');
    expect(result.score).toBe(100);
  });

  it('all REST → ALIGNED', () => {
    const result = computeConsistency({ recovery: 'REST', fatigue: 'REST', adaptation: 'REST' });
    expect(result.consistency).toBe('ALIGNED');
    expect(result.score).toBe(100);
  });

  it('TRAIN + REST + TRAIN → CONFLICTING (REST+TRAIN coexist regardless of counts)', () => {
    const result = computeConsistency({
      recovery: 'TRAIN',
      fatigue: 'REST',
      adaptation: 'TRAIN',
    });
    expect(result.consistency).toBe('CONFLICTING');
  });

  it('arbitrateModelConflict: fatigue TRAIN + adaptation REST → recovery wins when sleep limits', () => {
    const winner = arbitrateModelConflict(
      { recovery: 'EASY', fatigue: 'TRAIN', adaptation: 'REST' },
      'TRAIN_EASY',
      {
        system: 'RECOVERY',
        description: { code: 'recovery.rationale.sleepLimiting' },
        actionable: true,
      },
    );
    expect(winner).toBe('RECOVERY');
  });

  it('TRAIN + REST + REST → CONFLICTING or PARTIALLY_ALIGNED', () => {
    const result = computeConsistency({
      recovery: 'TRAIN',
      fatigue: 'REST',
      adaptation: 'REST',
    });
    expect(['PARTIALLY_ALIGNED', 'CONFLICTING']).toContain(result.consistency);
  });

  it('all UNKNOWN → INSUFFICIENT_DATA', () => {
    const result = computeConsistency({
      recovery: 'UNKNOWN',
      fatigue: 'UNKNOWN',
      adaptation: 'UNKNOWN',
    });
    expect(result.consistency).toBe('INSUFFICIENT_DATA');
    expect(result.score).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verdict synthesis
// ─────────────────────────────────────────────────────────────────────────────

describe('synthesizeVerdict', () => {
  it('OVERREACHING_RISK → RECOVER (safety-first)', () => {
    const verdict = synthesizeVerdict(
      makeRecovery({ readinessCategory: 'LOW' }),
      makeFatigue({ fatigueLevel: 'OVERREACHING_RISK', trainingCapacity: 'REST_ONLY' }),
      null,
      2,
    );
    expect(verdict).toBe('RECOVER');
  });

  it('REST_ONLY capacity → RECOVER', () => {
    const verdict = synthesizeVerdict(
      makeRecovery(),
      makeFatigue({ trainingCapacity: 'REST_ONLY' }),
      null,
      2,
    );
    expect(verdict).toBe('RECOVER');
  });

  it('all green, OPTIMAL recovery, FRESH fatigue, POSITIVELY_ADAPTING → TRAIN_HARD', () => {
    const verdict = synthesizeVerdict(
      makeRecovery({ readinessCategory: 'OPTIMAL', readinessScore: 90 }),
      makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL' }),
      makeAdaptation({ adaptationStatus: 'POSITIVELY_ADAPTING' }),
      3,
    );
    expect(verdict).toBe('TRAIN_HARD');
  });

  it('< 2 models → INSUFFICIENT_DATA', () => {
    const verdict = synthesizeVerdict(null, null, null, 0);
    expect(verdict).toBe('INSUFFICIENT_DATA');
  });

  it('ADEQUATE recovery + FULL fatigue + MAINTAINING → TRAIN_HARD', () => {
    const verdict = synthesizeVerdict(
      makeRecovery({ readinessCategory: 'ADEQUATE' }),
      makeFatigue({ fatigueLevel: 'FUNCTIONAL_LOW', trainingCapacity: 'FULL' }),
      makeAdaptation({ adaptationStatus: 'MAINTAINING' }),
      3,
    );
    expect(verdict).toBe('TRAIN_HARD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Conflict detection
// ─────────────────────────────────────────────────────────────────────────────

describe('detectConflicts', () => {
  it('ADEQUATE recovery + REST_ONLY fatigue → CAPACITY_CONFLICT', () => {
    const conflicts = detectConflicts(
      makeRecovery({ readinessCategory: 'ADEQUATE' }),
      makeFatigue({ trainingCapacity: 'REST_ONLY', fatigueLevel: 'NON_FUNCTIONAL_RISK' }),
      null,
    );
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((c) => c.type === 'CAPACITY_CONFLICT')).toBe(true);
  });

  it('no conflict when models agree', () => {
    const conflicts = detectConflicts(
      makeRecovery({ readinessCategory: 'OPTIMAL', overreachingRisk: 'LOW' }),
      makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL' }),
      makeAdaptation({ adaptationStatus: 'POSITIVELY_ADAPTING' }),
    );
    expect(conflicts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity detection
// ─────────────────────────────────────────────────────────────────────────────

describe('detectOpportunities', () => {
  it('PLATEAUING + ADEQUATE + FULL → LOAD_INCREASE opportunity', () => {
    const opportunities = detectOpportunities(
      makeRecovery({ readinessCategory: 'ADEQUATE' }),
      makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL' }),
      makeAdaptation({ adaptationStatus: 'PLATEAUING', plateauRisk: true }),
    );
    expect(opportunities.some((o) => o.type === 'LOAD_INCREASE')).toBe(true);
  });

  it('adaptation peak ≤ 7 days → RACE_READINESS opportunity', () => {
    const opportunities = detectOpportunities(
      makeRecovery({ readinessCategory: 'OPTIMAL' }),
      makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL' }),
      makeAdaptation({ adaptationStatus: 'POSITIVELY_ADAPTING', estimatedAdaptationPeak: 5 }),
    );
    expect(opportunities.some((o) => o.type === 'RACE_READINESS')).toBe(true);
  });

  it('overreaching → no LOAD_INCREASE or RACE_READINESS opportunities', () => {
    const opportunities = detectOpportunities(
      makeRecovery({ readinessCategory: 'LOW' }),
      makeFatigue({ fatigueLevel: 'OVERREACHING_RISK', trainingCapacity: 'REST_ONLY' }),
      makeAdaptation({ adaptationStatus: 'PLATEAUING' }),
    );
    expect(opportunities.some((o) => o.type === 'LOAD_INCREASE')).toBe(false);
    expect(opportunities.some((o) => o.type === 'RACE_READINESS')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full model
// ─────────────────────────────────────────────────────────────────────────────

describe('runReasoningModel', () => {
  it('is deterministic — identical inputs produce identical outputs', () => {
    const input = makeInput(makeRecovery(), makeFatigue(), makeAdaptation());
    const out1 = runReasoningModel(input);
    const out2 = runReasoningModel(input);
    expect(out1.reasoningState.overallVerdict).toBe(out2.reasoningState.overallVerdict);
    expect(out1.reasoningState.consistencyScore).toBe(out2.reasoningState.consistencyScore);
    expect(out1.reasoningState.confidence).toBeCloseTo(out2.reasoningState.confidence, 5);
  });

  it('cold start (all null) → INSUFFICIENT_DATA', () => {
    const output = runReasoningModel(makeInput(null, null, null));
    expect(output.reasoningState.overallVerdict).toBe('INSUFFICIENT_DATA');
    expect(output.reasoningState.physiologicalConsistency).toBe('INSUFFICIENT_DATA');
    expect(output.reasoningState.confidence).toBeLessThan(0.3);
  });

  it('single model (recovery only) → limited confidence', () => {
    const output = runReasoningModel(makeInput(makeRecovery(), null, null));
    expect(output.reasoningState.confidence).toBeLessThan(0.4);
  });

  it('all green → TRAIN_HARD with ALIGNED consistency', () => {
    const output = runReasoningModel(
      makeInput(
        makeRecovery({ readinessCategory: 'OPTIMAL', readinessScore: 90, overreachingRisk: 'LOW' }),
        makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL', fatigueIndex: 10 }),
        makeAdaptation({ adaptationStatus: 'POSITIVELY_ADAPTING', adaptationTrend: 'IMPROVING' }),
      ),
    );
    expect(output.reasoningState.overallVerdict).toBe('TRAIN_HARD');
    expect(output.reasoningState.physiologicalConsistency).toBe('ALIGNED');
    expect(output.reasoningState.consistencyScore).toBeGreaterThanOrEqual(90);
  });

  it('overreaching emergency → RECOVER (safety-critical)', () => {
    const output = runReasoningModel(
      makeInput(
        makeRecovery({
          readinessScore: 35,
          readinessCategory: 'LOW',
          overreachingRisk: 'HIGH',
          estimatedTimeToFullRecovery: 3,
        }),
        makeFatigue({
          fatigueIndex: 92,
          fatigueLevel: 'OVERREACHING_RISK',
          trainingCapacity: 'REST_ONLY',
          consecutiveAccumulationDays: 9,
          functionalOverreachingRisk: 'CRITICAL',
        }),
        makeAdaptation({ adaptationStatus: 'PLATEAUING' }),
      ),
    );
    expect(output.reasoningState.overallVerdict).toBe('RECOVER');
  });

  it('capacity conflict → detects CAPACITY_CONFLICT', () => {
    const output = runReasoningModel(
      makeInput(
        makeRecovery({ readinessCategory: 'ADEQUATE', readinessScore: 68 }),
        makeFatigue({
          fatigueLevel: 'NON_FUNCTIONAL_RISK',
          trainingCapacity: 'REST_ONLY',
          consecutiveAccumulationDays: 6,
          functionalOverreachingRisk: 'HIGH',
        }),
        makeAdaptation({ adaptationStatus: 'MAINTAINING' }),
      ),
    );
    expect(['RECOVER', 'CAUTION']).toContain(output.reasoningState.overallVerdict);
    expect(output.reasoningState.conflicts.length).toBeGreaterThan(0);
  });

  it('race readiness — adaptation peak ≤ 7 days → RACE_READY or TRAIN_HARD', () => {
    const output = runReasoningModel(
      makeInput(
        makeRecovery({ readinessScore: 92, readinessCategory: 'OPTIMAL', overreachingRisk: 'LOW' }),
        makeFatigue({ fatigueIndex: 10, fatigueLevel: 'FRESH', trainingCapacity: 'FULL' }),
        makeAdaptation({
          adaptationStatus: 'POSITIVELY_ADAPTING',
          adaptationTrend: 'IMPROVING',
          estimatedAdaptationPeak: 3,
          adaptationIndex: 82,
        }),
      ),
    );
    expect(['RACE_READY', 'TRAIN_HARD']).toContain(output.reasoningState.overallVerdict);
    expect(output.reasoningState.opportunities.some((o) => o.type === 'RACE_READINESS')).toBe(true);
  });

  it('evidence graph contributions sum to ~1', () => {
    const output = runReasoningModel(makeInput(makeRecovery(), makeFatigue(), makeAdaptation()));
    const { recoveryContribution, fatigueContribution, adaptationContribution } =
      output.reasoningState.evidenceGraph;
    const sum = recoveryContribution + fatigueContribution + adaptationContribution;
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThanOrEqual(1.05);
  });

  it('output has structured i18n codes (no NL explanation)', () => {
    // Use LOW readiness to guarantee at least one finding is produced
    const lowRecovery = makeRecovery({ readinessCategory: 'LOW', readinessScore: 40 });
    const output = runReasoningModel(makeInput(lowRecovery, makeFatigue(), makeAdaptation()));
    expect(output).not.toHaveProperty('explanation');
    expect(output.reasoningState.topAction).not.toBeNull();
    expect(output.reasoningState.topAction!.verbCode).toBeTruthy();
    expect(output.reasoningState.topAction!.focusCode).toBeTruthy();
    expect(output.reasoningState.keyFindings.length).toBeGreaterThan(0);
    expect(output.reasoningState.keyFindings[0].title.code).toBeTruthy();
    expect(output.reasoningState.keyFindings[0].evidenceItems.length).toBeGreaterThan(0);
    expect(output.reasoningState.keyFindings[0].evidenceItems[0].code).toBeTruthy();
  });
});

describe('reasoning — an athlete back from a break trains (audit pass 5)', () => {
  it('reads detraining as a reason to train, not to rest', () => {
    expect(mapAdaptationDirection(makeAdaptation({ adaptationStatus: 'DETRAINING' }))).toBe(
      'TRAIN',
    );
  });

  it('does not answer caution to a rested, fresh, detrained athlete', () => {
    const verdict = synthesizeVerdict(
      makeRecovery({ readinessCategory: 'OPTIMAL' }),
      makeFatigue({ fatigueLevel: 'FRESH', trainingCapacity: 'FULL' }),
      makeAdaptation({ adaptationStatus: 'DETRAINING' }),
      3,
    );
    expect(verdict).not.toBe('CAUTION');
    expect(verdict).not.toBe('RECOVER');
  });
});
