/**
 * ADAPTATION MODEL v1 — Unit Tests
 *
 * Tests the pure scoring and model functions in isolation.
 * No database, no infrastructure, no mocks needed.
 *
 * Test strategy:
 *   - Dimension scoring boundary tests (all 4 dimensions)
 *   - Full model with representative physiological scenarios
 *   - Edge cases: cold start, overreaching without adaptation, plateau detection
 *   - Determinism: identical inputs always produce identical outputs
 *
 * Expected values are computed analytically against the lerp implementation:
 *   lerp(min, max, rangeMin, value) = min + Math.max(0, Math.min(max-min, value-rangeMin))
 */

import { describe, it, expect } from 'vitest';
import {
  scoreLoadProgression,
  scoreNeuromuscularEfficiency,
  scoreAutonomicAdaptation,
  scoreRecoveryQuality,
  computeAdaptationTrend,
  classifyAdaptationStatus,
} from '../scoring';
import { runAdaptationModel } from '../model';
import type {
  LoadFeatureSet,
  RecoveryFeatureSet,
  SessionFeatureSet,
  DayFeatures,
} from '../../../features/types';
import type { AdaptationModelContext } from '../types';
import type { RecoveryState, FatigueState } from '../../../digital-twin/types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeLoad(overrides: Partial<LoadFeatureSet> = {}): LoadFeatureSet {
  return {
    trainingDayId: '2026-07-02',
    acuteLoad: 280,
    chronicLoad: 60,
    acwr: 1.05,
    weeklyLoad: 280,
    loadMonotony: 1.4,
    loadStrain: 392,
    trainingFrequency: 5,
    restDayCount: 2,
    acuteChronicLoadTrend: 0.05,
    acuteLoadRun: 280,
    acuteLoadBike: 0,
    chronicLoadRun: 60,
    chronicLoadBike: 0,
    confidence: 0.9,
    algorithmId: 'load-features-v1',
    sourceObsIds: [],
    ...overrides,
  };
}

function makeRecovery(overrides: Partial<RecoveryFeatureSet> = {}): RecoveryFeatureSet {
  return {
    trainingDayId: '2026-07-02',
    sleepEfficiencyPercent: null,
    sleepDebtMin: null,
    sleepOnsetConsistencyMin: null,
    sleepDurationTrend: null,
    hrvAbsolute: null,
    hrvDeltaFromBaseline: null,
    hrvCoefficientOfVariation: null,
    rhrAbsolute: null,
    rhrDeltaFromBaseline: null,
    subjectiveWellnessIndex: null,
    subjectiveWellnessComponents: null,
    rpeVsTargetZone: null,
    avgStressDuringSleep: null,
    confidence: 0.85,
    algorithmId: 'recovery-features-v1',
    sourceObsIds: [],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionFeatureSet> = {}): SessionFeatureSet {
  return {
    sessionObsId: 'sess-1',
    trainingDayId: '2026-07-02',
    sportType: 'RUN',
    durationSec: 3600,
    tssScore: 280,
    tssMethod: 'PACE_BASED',
    intensityFactor: 0.78,
    aerobicLoadFactor: 0.8,
    anaerobicLoadFactor: 0.2,
    timeInZones: null,
    hrDriftPercent: null,
    mechanicalLoad: null,
    elevationStressScore: null,
    efficiencyFactor: null,
    paceVariabilityIndex: null,
    subjectiveRpe: null,
    fosterSessionLoad: null,
    sourceProvidedTss: null,
    confidence: 0.85,
    algorithmId: 'session-features-v1',
    sourceObsIds: [],
    ...overrides,
  };
}

function makeFeatures(overrides: Partial<DayFeatures> = {}): DayFeatures {
  return {
    athleteId: 'test-athlete',
    trainingDayId: '2026-07-02',
    retrievedAt: new Date('2026-07-02'),
    load: makeLoad(),
    recovery: makeRecovery({ hrvDeltaFromBaseline: 8, rhrDeltaFromBaseline: -3 }),
    sessions: [makeSession({ hrDriftPercent: 2.0, intensityFactor: 0.78 })],
    body: 'PENDING',
    condition: 'PENDING',
    fuel: 'PENDING',
    ...overrides,
  };
}

function makeRecoveryState(overrides: Partial<RecoveryState> = {}): RecoveryState {
  return {
    readinessScore: 80,
    readinessCategory: 'ADEQUATE',
    dimensions: {
      autonomic: { score: 80, status: 'NORMAL', available: true },
      sleep: { score: 70, status: 'adequate', available: true },
      subjective: { score: 75, status: 'NORMAL', available: true },
      loadContext: { score: 65, status: 'ELEVATED', available: true },
    },
    primaryLimitingFactor: null,
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

function makeFatigueState(overrides: Partial<FatigueState> = {}): FatigueState {
  return {
    fatigueIndex: 30,
    fatigueLevel: 'FUNCTIONAL_LOW',
    fatigueType: 'LOAD_DOMINANT',
    dimensions: {
      load: { score: 30, available: true, status: 'score=30' },
      neuromuscular: { score: 25, available: true, status: 'score=25' },
      metabolic: { score: 20, available: true, status: 'score=20' },
      cumulative: { score: 15, available: true, status: 'score=15' },
      psychological: { score: 10, available: true, status: 'score=10' },
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

function makeContext(overrides: Partial<AdaptationModelContext> = {}): AdaptationModelContext {
  return {
    trainingDayId: '2026-07-02',
    athleteId: 'test-athlete',
    recoveryState: makeRecoveryState(),
    fatigueState: makeFatigueState(),
    recentAdaptationHistory: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// scoreLoadProgression
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreLoadProgression', () => {
  it('returns unavailable when PENDING', () => {
    const result = scoreLoadProgression('PENDING');
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });

  it('scores detraining zone (chronicLoad < 20)', () => {
    // chronicLoad=5 on the 0–20 scale of the detraining zone → 5
    const result = scoreLoadProgression(
      makeLoad({ chronicLoad: 5, acwr: 0.7, acuteChronicLoadTrend: -0.05 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(5);
  });

  it('scores progressive overload zone (trend > 0.02, ACWR 0.8–1.3)', () => {
    // trend=0.10, acwr=1.05
    // trendBonus = min((0.10-0.02)/0.08, 1.0)*25 = min(1.0,1.0)*25 = 25
    // acwrBonus = 5 (acwr in 0.95-1.15)
    // score = min(75+25+5, 100) = 100
    const result = scoreLoadProgression(
      makeLoad({ acuteChronicLoadTrend: 0.1, acwr: 1.05, chronicLoad: 60 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(100);
  });

  it('scores excessive ACWR (acwr > 1.5)', () => {
    // acwr=2.0, halfway between 1.5 (30) and 2.5 (0) → 15
    const result = scoreLoadProgression(
      makeLoad({ acwr: 2.0, chronicLoad: 60, acuteChronicLoadTrend: 0.01 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(15);
  });

  it('scores maintaining zone (trend ≈ 0, ACWR 0.7–1.3)', () => {
    // trend=0 >= 0 → score=60, clamped to [45,70] → 60
    const result = scoreLoadProgression(
      makeLoad({ acwr: 1.0, acuteChronicLoadTrend: 0.0, chronicLoad: 60 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(60);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreNeuromuscularEfficiency
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreNeuromuscularEfficiency', () => {
  it('returns unavailable when no sessions have hrDriftPercent', () => {
    const result = scoreNeuromuscularEfficiency([makeSession({ hrDriftPercent: null })]);
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });

  it('returns unavailable for empty session array', () => {
    const result = scoreNeuromuscularEfficiency([]);
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });

  it('scores low drift (drift < 3) — adapting well', () => {
    // drift=1.0 → lerp(80,100,0, 3-1=2): clamped=min(20,2)=2 → 80+2=82
    const result = scoreNeuromuscularEfficiency([makeSession({ hrDriftPercent: 1.0 })]);
    expect(result.available).toBe(true);
    expect(result.score).toBe(93);
  });

  it('scores moderate drift (3 < drift ≤ 8) — normal fatigue', () => {
    // drift=6.0 → lerp(50,80,3, 8-(6-3)=5): clamped=min(30, 5-3=2)=2 → 50+2=52
    const result = scoreNeuromuscularEfficiency([makeSession({ hrDriftPercent: 6.0 })]);
    expect(result.available).toBe(true);
    expect(result.score).toBe(62);
  });

  it('scores high drift (drift > 10) — cardiovascular strain', () => {
    // drift=15 → max(0, 40-(15-10)*3) = max(0,25) = 25
    const result = scoreNeuromuscularEfficiency([makeSession({ hrDriftPercent: 15.0 })]);
    expect(result.available).toBe(true);
    expect(result.score).toBe(25);
  });

  it('adds IF bonus when mean intensityFactor > 0.85', () => {
    // drift=1.0 → base=82, IF=0.90>0.85 → +10 → 92
    const result = scoreNeuromuscularEfficiency([
      makeSession({ hrDriftPercent: 1.0, intensityFactor: 0.9 }),
    ]);
    expect(result.available).toBe(true);
    expect(result.score).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreAutonomicAdaptation
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreAutonomicAdaptation', () => {
  it('returns unavailable when PENDING', () => {
    const result = scoreAutonomicAdaptation('PENDING');
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });

  it('returns unavailable when HRV and RHR both null', () => {
    const result = scoreAutonomicAdaptation(
      makeRecovery({ hrvDeltaFromBaseline: null, rhrDeltaFromBaseline: null }),
    );
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });

  it('scores full autonomic adaptation (HRV > +5%, RHR < -2)', () => {
    // hrv=10, rhr=-3 → both non-null, hrv>5 && rhr<-2
    // hrvBonus = min((10-5)/10, 1.0)*20 = 0.5*20 = 10
    // score = min(80+10, 100) = 90
    const result = scoreAutonomicAdaptation(
      makeRecovery({ hrvDeltaFromBaseline: 10, rhrDeltaFromBaseline: -3 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(90);
  });

  it('scores stable autonomic (HRV in [-5, +5])', () => {
    // hrv=0, rhr=1 → both non-null, hrv in [-5,5]
    // lerp(50,70,-5, 0+5): clamped=min(20, 5-(-5)=10)=10 → 50+10=60
    const result = scoreAutonomicAdaptation(
      makeRecovery({ hrvDeltaFromBaseline: 0, rhrDeltaFromBaseline: 1 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(60);
  });

  it('scores autonomic stress (HRV < -10)', () => {
    // hrv=-15, rhr=5 → both non-null, hrv<-10
    // score = max(0, 30+(-15+10)*2) = max(0, 30-10) = 20
    const result = scoreAutonomicAdaptation(
      makeRecovery({ hrvDeltaFromBaseline: -15, rhrDeltaFromBaseline: 5 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(20);
  });

  it('applies partial penalty when only HRV is available', () => {
    // hrv=10, rhr=null → partial, hrv>5 → score=70, partial → 70-20=50
    const result = scoreAutonomicAdaptation(
      makeRecovery({ hrvDeltaFromBaseline: 10, rhrDeltaFromBaseline: null }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(50);
  });

  it('applies partial penalty when only RHR is available', () => {
    // hrv=null, rhr=-3 → partial, rhr<-2 → score=65, partial → 65-20=45
    const result = scoreAutonomicAdaptation(
      makeRecovery({ hrvDeltaFromBaseline: null, rhrDeltaFromBaseline: -3 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(45);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreRecoveryQuality
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreRecoveryQuality', () => {
  it('returns unavailable when both states are null', () => {
    const result = scoreRecoveryQuality(null, null);
    expect(result.available).toBe(false);
    expect(result.score).toBeNull();
  });

  it('scores REST_ONLY capacity', () => {
    // capacity=REST_ONLY, readiness=80 → min(30, 80*0.3)=min(30,24)=24
    const result = scoreRecoveryQuality(
      makeRecoveryState({ readinessScore: 80 }),
      makeFatigueState({ trainingCapacity: 'REST_ONLY' }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(24);
  });

  it('scores full capacity with good readiness — rises with readiness', () => {
    // readiness=90, FULL: 80 at 75, 100 at 100 → 92
    // clamped = min(20, 15-75=-60) → max(0,-60)=0 → score=80
    // Note: this is a known quirk of the lerp parameterisation in the implementation.
    const result = scoreRecoveryQuality(
      makeRecoveryState({ readinessScore: 90 }),
      makeFatigueState({ trainingCapacity: 'FULL' }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(92);
  });

  it('scores moderate readiness (50–74, not REST_ONLY) — follows readiness', () => {
    // readiness=70, REDUCED: 50 at 50, 75 at 75 → 70
    // clamped = min(25, 20-50=-30) → max(0,-30)=0 → score=50
    const result = scoreRecoveryQuality(
      makeRecoveryState({ readinessScore: 70 }),
      makeFatigueState({ trainingCapacity: 'REDUCED' }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(70);
  });

  it('scores low readiness (< 50)', () => {
    // readiness=30: 20 at 0, 50 at 50 → 38
    const result = scoreRecoveryQuality(
      makeRecoveryState({ readinessScore: 30 }),
      makeFatigueState({ trainingCapacity: 'REDUCED' }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(38);
  });

  it('penalises excessive accumulation days (> 7)', () => {
    // Same as REST_ONLY case above (score=24) but accumulationDays=10 → max(0,24-20)=4
    const result = scoreRecoveryQuality(
      makeRecoveryState({ readinessScore: 80 }),
      makeFatigueState({ trainingCapacity: 'REST_ONLY', consecutiveAccumulationDays: 10 }),
    );
    expect(result.available).toBe(true);
    expect(result.score).toBe(4);
  });

  it('returns default when readiness is null', () => {
    // readiness=null, FULL → score=65
    const result = scoreRecoveryQuality(null, makeFatigueState({ trainingCapacity: 'FULL' }));
    expect(result.available).toBe(true);
    expect(result.score).toBe(65);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAdaptationTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAdaptationTrend', () => {
  it('returns STABLE for fewer than 7 entries', () => {
    expect(computeAdaptationTrend([70, 72, 75])).toBe('STABLE');
  });

  it('returns IMPROVING for consistently rising history', () => {
    // Strictly rising over 10 entries → slope > 1.0
    const rising = [90, 88, 85, 83, 80, 77, 75, 72, 70, 68];
    expect(computeAdaptationTrend(rising)).toBe('IMPROVING');
  });

  it('returns DECLINING for consistently falling history', () => {
    // Most-recent-first: declining means recent values lower → index 0 < index N-1
    const falling = [40, 45, 50, 55, 60, 65, 70, 75, 80, 85];
    expect(computeAdaptationTrend(falling)).toBe('DECLINING');
  });

  it('returns STABLE for flat history', () => {
    const flat = [60, 60, 60, 60, 60, 60, 60, 60];
    expect(computeAdaptationTrend(flat)).toBe('STABLE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyAdaptationStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyAdaptationStatus', () => {
  it('classifies 70+ as POSITIVELY_ADAPTING', () => {
    expect(classifyAdaptationStatus(70)).toBe('POSITIVELY_ADAPTING');
    expect(classifyAdaptationStatus(100)).toBe('POSITIVELY_ADAPTING');
  });

  it('classifies 50–69 as MAINTAINING', () => {
    expect(classifyAdaptationStatus(50)).toBe('MAINTAINING');
    expect(classifyAdaptationStatus(69)).toBe('MAINTAINING');
  });

  it('classifies 30–49 as PLATEAUING', () => {
    expect(classifyAdaptationStatus(30)).toBe('PLATEAUING');
    expect(classifyAdaptationStatus(49)).toBe('PLATEAUING');
  });

  it('classifies 15–29 as MALADAPTING', () => {
    expect(classifyAdaptationStatus(15)).toBe('MALADAPTING');
    expect(classifyAdaptationStatus(29)).toBe('MALADAPTING');
  });

  it('classifies 0–14 as DETRAINING', () => {
    expect(classifyAdaptationStatus(0)).toBe('DETRAINING');
    expect(classifyAdaptationStatus(14)).toBe('DETRAINING');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runAdaptationModel — integration
// ─────────────────────────────────────────────────────────────────────────────

describe('runAdaptationModel', () => {
  it('is deterministic — same inputs produce identical outputs', () => {
    const features = makeFeatures();
    const context = makeContext();
    const r1 = runAdaptationModel(features, context);
    const r2 = runAdaptationModel(features, context);

    expect(r1.adaptationState.adaptationIndex).toBe(r2.adaptationState.adaptationIndex);
    expect(r1.adaptationState.adaptationStatus).toBe(r2.adaptationState.adaptationStatus);
    expect(r1.adaptationState.confidence).toBe(r2.adaptationState.confidence);
    expect(r1.decision.verdict).toBe(r2.decision.verdict);
  });

  it('returns INSUFFICIENT_DATA on cold start (all features unavailable)', () => {
    const features: DayFeatures = {
      trainingDayId: '2026-07-02',
      athleteId: 'test-athlete',
      retrievedAt: new Date('2026-07-02'),
      load: 'PENDING',
      recovery: 'PENDING',
      sessions: [],
      body: 'PENDING',
      condition: 'PENDING',
      fuel: 'PENDING',
    };
    const context: AdaptationModelContext = {
      trainingDayId: '2026-07-02',
      athleteId: 'test-athlete',
      recoveryState: null,
      fatigueState: null,
      recentAdaptationHistory: [],
    };

    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.adaptationStatus).toBe('INSUFFICIENT_DATA');
    expect(result.adaptationState.adaptationIndex).toBeNull();
    expect(result.adaptationState.confidence).toBeLessThan(0.3);
    expect(result.decision.verdict).toBe('INSUFFICIENT_DATA');
  });

  it('caps confidence at 0.50 when history < 7 entries', () => {
    const features = makeFeatures();
    const context = makeContext({ recentAdaptationHistory: [75, 72, 70] });
    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.confidence).toBeLessThanOrEqual(0.5);
  });

  it('detects overreaching without adaptation', () => {
    // fatigueIndex=75 > 70, ANS score low (hrv=-15,rhr=5 → score=20 < 40)
    // RQ low (REST_ONLY, readiness=80 → score=24 < 40) → flag fires
    const features = makeFeatures({
      recovery: makeRecovery({ hrvDeltaFromBaseline: -15, rhrDeltaFromBaseline: 5 }),
    });
    const context = makeContext({
      fatigueState: makeFatigueState({
        fatigueIndex: 75,
        trainingCapacity: 'REST_ONLY',
      }),
      recoveryState: makeRecoveryState({ readinessScore: 80 }),
    });

    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.overreachingWithoutAdaptationDetected).toBe(true);
    expect(result.decision.verdict).toBe('REDUCE_LOAD');
    expect(result.decision.loadMultiplier).toBe(0.8);
  });

  it('does NOT flag overreaching when fatigueIndex ≤ 70 (strict threshold)', () => {
    const features = makeFeatures({
      recovery: makeRecovery({ hrvDeltaFromBaseline: -15, rhrDeltaFromBaseline: 5 }),
    });
    const context = makeContext({
      fatigueState: makeFatigueState({ fatigueIndex: 70, trainingCapacity: 'REST_ONLY' }),
      recoveryState: makeRecoveryState({ readinessScore: 80 }),
    });

    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.overreachingWithoutAdaptationDetected).toBe(false);
  });

  it('detects plateau risk when conditions align', () => {
    // Need: status=PLATEAUING, loadProgression.score > 60, history ≥ 14, variance < 3
    //
    // Analytically verified scenario:
    //   LP: chronicLoad=60, trend=0.03, acwr=1.2 → progressive overload
    //       trendBonus=min((0.03-0.02)/0.08,1)*25=3.125, acwrBonus=0 (1.2>1.15)
    //       score=round(78.125)=78 > 60 ✓
    //   NM: drift=20% → max(0,40-(20-10)*3)=10
    //   ANS: hrv=-12, rhr=5 → hrv<-10 → max(0,30+(-12+10)*2)=26
    //   RQ: REST_ONLY, readiness=80 → min(30,24)=24
    //   index = 0.30*78 + 0.25*10 + 0.25*26 + 0.20*24 = 23.4+2.5+6.5+4.8 = 37 → PLATEAUING ✓

    const features = makeFeatures({
      load: makeLoad({ chronicLoad: 60, acuteChronicLoadTrend: 0.03, acwr: 1.2 }),
      recovery: makeRecovery({ hrvDeltaFromBaseline: -12, rhrDeltaFromBaseline: 5 }),
      sessions: [makeSession({ hrDriftPercent: 20.0, intensityFactor: 0.7 })],
    });
    const context = makeContext({
      fatigueState: makeFatigueState({ trainingCapacity: 'REST_ONLY' }),
      recoveryState: makeRecoveryState({ readinessScore: 80 }),
      recentAdaptationHistory: Array.from({ length: 14 }, () => 37),
    });

    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.adaptationStatus).toBe('PLATEAUING');
    expect(result.adaptationState.plateauRisk).toBe(true);
    expect(result.decision.verdict).toBe('INCREASE_LOAD');
  });

  it('does NOT detect plateau when history has variation ≥ 3', () => {
    const features = makeFeatures({
      load: makeLoad({ chronicLoad: 60, acuteChronicLoadTrend: 0.03, acwr: 1.2 }),
      recovery: makeRecovery({ hrvDeltaFromBaseline: -12, rhrDeltaFromBaseline: 5 }),
      sessions: [makeSession({ hrDriftPercent: 20.0, intensityFactor: 0.7 })],
    });
    // History varies from 34 to 40 → range=6 ≥ 3 → no plateau
    const history = [34, 35, 36, 37, 38, 39, 40, 38, 37, 36, 35, 34, 34, 34];
    const context = makeContext({
      fatigueState: makeFatigueState({ trainingCapacity: 'REST_ONLY' }),
      recoveryState: makeRecoveryState({ readinessScore: 80 }),
      recentAdaptationHistory: history,
    });

    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.plateauRisk).toBe(false);
  });

  it('produces POSITIVELY_ADAPTING + SUSTAIN for progressive overload with full recovery', () => {
    const features = makeFeatures({
      load: makeLoad({ chronicLoad: 60, acuteChronicLoadTrend: 0.1, acwr: 1.05 }),
      recovery: makeRecovery({ hrvDeltaFromBaseline: 10, rhrDeltaFromBaseline: -3 }),
      sessions: [makeSession({ hrDriftPercent: 1.5, intensityFactor: 0.9 })],
    });
    const context = makeContext({
      fatigueState: makeFatigueState({ trainingCapacity: 'FULL' }),
      recoveryState: makeRecoveryState({ readinessScore: 80 }),
      recentAdaptationHistory: Array.from({ length: 14 }, (_, i) => 70 + i),
    });

    const result = runAdaptationModel(features, context);
    expect(result.adaptationState.adaptationStatus).toBe('POSITIVELY_ADAPTING');
    expect(result.decision.verdict).toBe('SUSTAIN');
    expect(result.decision.loadMultiplier).toBe(1.0);
  });
});

describe('adaptation — scores follow their inputs (audit pass 3)', () => {
  it('a lower heart-rate drift never scores lower', () => {
    let previous = Infinity;
    for (let drift = 0; drift <= 14; drift += 0.5) {
      const { score } = scoreNeuromuscularEfficiency([makeSession({ hrDriftPercent: drift })]);
      expect(score!).toBeLessThanOrEqual(previous);
      previous = score!;
    }
  });

  it('a higher HRV never scores lower at a flat resting pulse', () => {
    let previous = -Infinity;
    for (let hrv = -20; hrv <= 20; hrv += 1) {
      const { score } = scoreAutonomicAdaptation(
        makeRecovery({ hrvDeltaFromBaseline: hrv, rhrDeltaFromBaseline: 0 }),
      );
      expect(score!).toBeGreaterThanOrEqual(previous);
      previous = score!;
    }
  });
});
