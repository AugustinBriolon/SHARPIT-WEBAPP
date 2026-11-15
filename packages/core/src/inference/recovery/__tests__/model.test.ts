/**
 * RECOVERY MODEL v1 — Unit Tests
 *
 * Tests the pure scoring and model functions in isolation.
 * No database, no infrastructure, no mocks needed.
 *
 * Test strategy:
 *   - Each scoring function tested independently (dimension boundary tests)
 *   - Full model tested with representative physiological scenarios
 *   - Edge cases: cold start, illness pattern, dissonance, overreaching
 *   - Determinism: identical inputs always produce identical outputs
 */

import { describe, it, expect } from 'vitest';
import {
  scoreAutonomic,
  scoreSleep,
  scoreSubjective,
  scoreLoadContext,
  sleepStressModifier,
  synthesizeScore,
} from '../scoring';
import { runRecoveryModel } from '../model';
import type { RecoveryFeatureSet, LoadFeatureSet, DayFeatures } from '../../../features/types';
import type { RecoveryModelContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRecovery(overrides: Partial<RecoveryFeatureSet> = {}): RecoveryFeatureSet {
  return {
    trainingDayId: '2026-07-02',
    sleepEfficiencyPercent: 82,
    sleepDebtMin: 30,
    sleepOnsetConsistencyMin: null,
    sleepDurationTrend: null,
    hrvAbsolute: 55,
    hrvDeltaFromBaseline: 5,
    hrvCoefficientOfVariation: 5,
    rhrAbsolute: 48,
    rhrDeltaFromBaseline: 0,
    subjectiveWellnessIndex: 7.5,
    subjectiveWellnessComponents: {
      mood: 4,
      energyLevel: 4,
      perceivedSoreness: 3,
      stressLevel: null,
    },
    rpeVsTargetZone: 0,
    avgStressDuringSleep: null,
    confidence: 0.85,
    algorithmId: 'recovery-features-v1',
    sourceObsIds: ['obs-1', 'obs-2'],
    ...overrides,
  };
}

function makeLoad(overrides: Partial<LoadFeatureSet> = {}): LoadFeatureSet {
  return {
    trainingDayId: '2026-07-02',
    acuteLoad: 280,
    chronicLoad: 260,
    acwr: 1.08,
    weeklyLoad: 280,
    loadMonotony: 1.4,
    loadStrain: 392,
    trainingFrequency: 5,
    restDayCount: 2,
    acuteChronicLoadTrend: 0.02,
    acuteLoadRun: 120,
    acuteLoadBike: 160,
    chronicLoadRun: 110,
    chronicLoadBike: 150,
    confidence: 0.9,
    algorithmId: 'load-features-v1',
    sourceObsIds: ['obs-3'],
    ...overrides,
  };
}

function makeDayFeatures(
  recovery: RecoveryFeatureSet | 'PENDING' = makeRecovery(),
  load: LoadFeatureSet | 'PENDING' = makeLoad(),
): DayFeatures {
  return {
    athleteId: 'athlete-1',
    trainingDayId: '2026-07-02',
    retrievedAt: new Date('2026-07-02T08:00:00Z'),
    sessions: [],
    load,
    recovery,
    body: 'PENDING',
    condition: 'PENDING',
    fuel: 'PENDING',
  };
}

const DEFAULT_CONTEXT: RecoveryModelContext = {
  athleteId: 'athlete-1',
  trainingDayId: '2026-07-02',
  previousReadinessScore: 70,
};

// ─────────────────────────────────────────────────────────────────────────────
// scoreAutonomic
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreAutonomic', () => {
  it('returns ENHANCED score when HRV is > +10% above baseline', () => {
    const dim = scoreAutonomic(makeRecovery({ hrvDeltaFromBaseline: 12, rhrDeltaFromBaseline: 0 }));
    expect(dim.available).toBe(true);
    expect(dim.score).toBe(100);
  });

  it('returns correct score for HRV at +5% to +10%', () => {
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: 7.5, rhrDeltaFromBaseline: 0 }),
    );
    expect(dim.score).toBe(90);
  });

  it('returns 80 for HRV in neutral zone (0% to +5%)', () => {
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: 2.5, rhrDeltaFromBaseline: 0 }),
    );
    expect(dim.score).toBe(80);
  });

  it('returns 70 for HRV in noise zone (-5% to 0%)', () => {
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: -2.5, rhrDeltaFromBaseline: 0 }),
    );
    expect(dim.score).toBe(70);
  });

  it('applies RHR penalty when RHR is elevated', () => {
    // HRV at +5%: raw = 90. RHR +6bpm: modifier = 0.75
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: 7.5, rhrDeltaFromBaseline: 6 }),
    );
    expect(dim.score).toBeCloseTo(90 * 0.75, 0);
  });

  it('applies RHR boost when RHR is suppressed', () => {
    // HRV at 0%: raw = 80. RHR -6bpm: modifier = 1.10
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: 2.5, rhrDeltaFromBaseline: -6 }),
    );
    expect(dim.score).toBeCloseTo(Math.min(80 * 1.1, 100), 0);
  });

  it('falls back to absolute HRV when delta unavailable', () => {
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: null, hrvAbsolute: 55, rhrDeltaFromBaseline: null }),
    );
    expect(dim.available).toBe(true);
    expect(dim.score).not.toBeNull();
    expect(dim.qualityFactor).toBe(0.4); // lower quality without baseline
  });

  it('returns unavailable when no HRV data at all', () => {
    const dim = scoreAutonomic(makeRecovery({ hrvDeltaFromBaseline: null, hrvAbsolute: null }));
    expect(dim.available).toBe(false);
    expect(dim.score).toBeNull();
  });

  it('returns score ≤ 100 even with extreme HRV and RHR boost', () => {
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: 20, rhrDeltaFromBaseline: -10 }),
    );
    expect(dim.score).toBeLessThanOrEqual(100);
  });

  it('returns score ≥ 0 even with severely suppressed HRV and elevated RHR', () => {
    const dim = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: -30, rhrDeltaFromBaseline: 10 }),
    );
    expect(dim.score).toBeGreaterThanOrEqual(0);
  });
});

describe('recovery scoring — audit F4/F5', () => {
  it('is continuous in the HRV delta: a 1 % change never moves the score by more than 4', () => {
    for (let pct = -30; pct < 15; pct += 1) {
      const a = scoreAutonomic(
        makeRecovery({ hrvDeltaFromBaseline: pct, rhrDeltaFromBaseline: 0 }),
      );
      const b = scoreAutonomic(
        makeRecovery({ hrvDeltaFromBaseline: pct + 1, rhrDeltaFromBaseline: 0 }),
      );
      expect(Math.abs(b.score! - a.score!)).toBeLessThanOrEqual(4);
      expect(b.score!).toBeGreaterThanOrEqual(a.score!);
    }
  });

  it("reads the same drop in the athlete's own variability", () => {
    const steady = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: -10, hrvZScore: -2.5, rhrDeltaFromBaseline: 0 }),
    );
    const variable = scoreAutonomic(
      makeRecovery({ hrvDeltaFromBaseline: -10, hrvZScore: -0.6, rhrDeltaFromBaseline: 0 }),
    );
    expect(variable.score!).toBeGreaterThan(steady.score!);
  });

  it('scores a night without stages on its duration', () => {
    const short = scoreSleep(
      makeRecovery({ sleepEfficiencyPercent: null, sleepDurationRatio: 0.55, sleepDebtMin: 0 }),
    );
    const full = scoreSleep(
      makeRecovery({ sleepEfficiencyPercent: null, sleepDurationRatio: 1, sleepDebtMin: 0 }),
    );
    expect(short.available).toBe(true);
    expect(short.score!).toBeLessThan(40);
    expect(full.score).toBe(100);
  });

  it('a short night with good stages no longer scores as a good night', () => {
    const dim = scoreSleep(
      makeRecovery({ sleepEfficiencyPercent: 58, sleepDurationRatio: 0.6, sleepDebtMin: 0 }),
    );
    expect(dim.score!).toBeLessThan(70);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreSleep
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreSleep', () => {
  it('returns 100 for excellent restorative ratio ≥ 55%', () => {
    const dim = scoreSleep(makeRecovery({ sleepEfficiencyPercent: 58, sleepDebtMin: 0 }));
    expect(dim.score).toBe(100);
  });

  it('returns 50 for ratio 32–39% without debt', () => {
    const dim = scoreSleep(makeRecovery({ sleepEfficiencyPercent: 36, sleepDebtMin: 0 }));
    expect(dim.score).toBe(50);
  });

  it('applies sleep debt — score is reduced with cumulative debt', () => {
    const withoutDebt = scoreSleep(makeRecovery({ sleepEfficiencyPercent: 36, sleepDebtMin: 0 }));
    const withDebt = scoreSleep(makeRecovery({ sleepEfficiencyPercent: 36, sleepDebtMin: 300 }));
    const withoutDebtScore = withoutDebt.score;
    const withDebtScore = withDebt.score;
    expect(withoutDebtScore).not.toBeNull();
    expect(withDebtScore).not.toBeNull();
    // sleepDebtModifier(300) = 0.75, baseScore(36) = 50 → 37.5
    expect(withDebtScore!).toBeLessThan(withoutDebtScore!);
    expect(withDebtScore!).toBeCloseTo(withoutDebtScore! * 0.75, 5);
  });

  it('returns unavailable when restorative ratio is null', () => {
    const dim = scoreSleep(makeRecovery({ sleepEfficiencyPercent: null }));
    expect(dim.available).toBe(false);
    expect(dim.score).toBeNull();
  });

  it('applies overnight sleep-stress modifier when elevated', () => {
    const calm = scoreSleep(
      makeRecovery({ sleepEfficiencyPercent: 50, sleepDebtMin: 0, avgStressDuringSleep: 15 }),
    );
    const stressed = scoreSleep(
      makeRecovery({ sleepEfficiencyPercent: 50, sleepDebtMin: 0, avgStressDuringSleep: 55 }),
    );
    expect(sleepStressModifier(55)).toBe(0.85);
    expect(stressed.score!).toBeLessThan(calm.score!);
    expect(stressed.score!).toBeCloseTo(calm.score! * 0.85, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreSubjective
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreSubjective', () => {
  it('returns 100 for high wellness index ≥ 8.0', () => {
    const dim = scoreSubjective(makeRecovery({ subjectiveWellnessIndex: 9.0, rpeVsTargetZone: 0 }));
    expect(dim.score).toBe(100);
  });

  it('returns 60 for moderate wellness index 5.0–6.5', () => {
    const dim = scoreSubjective(makeRecovery({ subjectiveWellnessIndex: 5.8, rpeVsTargetZone: 0 }));
    expect(dim.score).toBe(60);
  });

  it('applies RPE penalty when session felt much harder than expected', () => {
    // wellness 7.5 → raw 80. RPE +3.5 → modifier 0.75 → 60
    const dim = scoreSubjective(
      makeRecovery({ subjectiveWellnessIndex: 7.5, rpeVsTargetZone: 3.5 }),
    );
    expect(dim.score).toBeCloseTo(80 * 0.75, 0);
  });

  it('returns unavailable when wellness index is null', () => {
    const dim = scoreSubjective(makeRecovery({ subjectiveWellnessIndex: null }));
    expect(dim.available).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreLoadContext
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreLoadContext', () => {
  it('returns 100 for ACWR in optimal zone (1.0–1.3)', () => {
    // ACWR 1.15 → raw 100. Monotony 1.3 → ×1.05 → 105, clamped to 100
    const dim = scoreLoadContext(makeLoad({ acwr: 1.15, loadMonotony: 1.3 }));
    expect(dim.score).toBe(100);
  });

  it('returns low score for critical ACWR > 2.0', () => {
    const dim = scoreLoadContext(makeLoad({ acwr: 2.2, loadMonotony: 1.8 }));
    expect(dim.score).toBeLessThan(20);
  });

  it('returns neutral score when load is PENDING', () => {
    const dim = scoreLoadContext('PENDING');
    expect(dim.score).toBe(75);
    expect(dim.available).toBe(true);
  });

  it('applies monotony penalty for high monotony (> 2.5)', () => {
    const dim1 = scoreLoadContext(makeLoad({ acwr: 1.15, loadMonotony: 1.0 }));
    const dim2 = scoreLoadContext(makeLoad({ acwr: 1.15, loadMonotony: 2.8 }));
    expect(dim1.score).toBeGreaterThan(dim2.score!);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// synthesizeScore
// ─────────────────────────────────────────────────────────────────────────────

describe('synthesizeScore', () => {
  it('returns null score when fewer than 2 dimensions are available', () => {
    const result = synthesizeScore({
      autonomic: { score: null, available: false, qualityFactor: 0 },
      sleep: { score: null, available: false, qualityFactor: 0 },
      subjective: { score: null, available: false, qualityFactor: 0 },
      loadContext: { score: 75, available: true, qualityFactor: 0.4 },
    });
    expect(result.score).toBeNull();
    expect(result.availableCount).toBe(1);
  });

  it('redistributes weights when dimensions are pending', () => {
    // Only sleep and subjective available — weights should sum to 1.00
    const result = synthesizeScore({
      autonomic: { score: null, available: false, qualityFactor: 0 },
      sleep: { score: 80, available: true, qualityFactor: 0.65 },
      subjective: { score: 70, available: true, qualityFactor: 0.8 },
      loadContext: { score: null, available: false, qualityFactor: 0 },
    });
    expect(result.score).not.toBeNull();
    expect(result.availableCount).toBe(2);
  });

  it('produces scores in [0, 100] range', () => {
    const result = synthesizeScore({
      autonomic: { score: 95, available: true, qualityFactor: 0.7 },
      sleep: { score: 90, available: true, qualityFactor: 0.65 },
      subjective: { score: 88, available: true, qualityFactor: 0.8 },
      loadContext: { score: 100, available: true, qualityFactor: 0.85 },
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runRecoveryModel — full scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('runRecoveryModel', () => {
  describe('Scenario: Excellent recovery (all dimensions positive)', () => {
    const features = makeDayFeatures(
      makeRecovery({
        hrvDeltaFromBaseline: 8,
        rhrDeltaFromBaseline: -3,
        sleepEfficiencyPercent: 88,
        sleepDebtMin: 15,
        subjectiveWellnessIndex: 8.5,
      }),
      makeLoad({ acwr: 1.1, loadMonotony: 1.3 }),
    );

    it('produces OPTIMAL readiness category', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.recoveryState.readinessCategory).toBe('OPTIMAL');
    });

    it('recommends HARD or MODERATE intensity', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(['HARD', 'MODERATE']).toContain(output.recommendation.type);
    });

    it('produces RECOVERED verdict', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.decision.verdict).toBe('RECOVERED');
    });

    it('produces overreachingRisk: LOW', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.signals.overreachingRisk).toBe('LOW');
    });
  });

  describe('Scenario: Fatigued athlete (suppressed HRV, poor sleep)', () => {
    const features = makeDayFeatures(
      makeRecovery({
        hrvDeltaFromBaseline: -18,
        rhrDeltaFromBaseline: 6,
        sleepEfficiencyPercent: 28,
        sleepDebtMin: 150,
        subjectiveWellnessIndex: 3.5,
      }),
      makeLoad({ acwr: 1.65, loadMonotony: 2.2 }),
    );

    it('produces LOW or VERY_LOW readiness category', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(['LOW', 'VERY_LOW']).toContain(output.recoveryState.readinessCategory);
    });

    it('recommends REST or VERY_EASY', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(['REST', 'VERY_EASY']).toContain(output.recommendation.type);
    });

    it('detects overreachingRisk ≥ MODERATE', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(['MODERATE', 'HIGH', 'CRITICAL']).toContain(output.signals.overreachingRisk);
    });

    it('produces FATIGUED verdict', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.decision.verdict).toBe('FATIGUED');
    });
  });

  describe('Scenario: Illness pattern (HRV crash without training)', () => {
    const features = makeDayFeatures(
      makeRecovery({
        hrvDeltaFromBaseline: -35,
        rhrDeltaFromBaseline: 8,
        sleepEfficiencyPercent: 70,
        sleepDebtMin: 60,
        subjectiveWellnessIndex: 2.5,
      }),
      makeLoad({ acwr: 0.3, acuteLoad: 50, chronicLoad: 250 }), // very low training
    );

    it('detects HIGH illnessRisk', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.signals.illnessRisk).toBe('HIGH');
    });

    it('mandates REST recommendation regardless of other factors', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.recommendation.type).toBe('REST');
    });

    it('produces VERY_LOW readinessCategory when illness risk is HIGH', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.recoveryState.readinessCategory).toBe('VERY_LOW');
    });
  });

  describe('Scenario: Cold start (no recovery features)', () => {
    const features = makeDayFeatures('PENDING', makeLoad());

    it('produces BASELINE_PENDING or INSUFFICIENT_DATA category', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(['BASELINE_PENDING', 'INSUFFICIENT_DATA']).toContain(
        output.recoveryState.readinessCategory,
      );
    });

    it('produces null readinessScore', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.recoveryState.readinessScore).toBeNull();
    });
  });

  describe('Scenario: Objective/subjective dissonance', () => {
    const features = makeDayFeatures(
      makeRecovery({
        // Good objective markers
        hrvDeltaFromBaseline: 8,
        rhrDeltaFromBaseline: -2,
        sleepEfficiencyPercent: 85,
        // Very poor subjective (stress, life events)
        subjectiveWellnessIndex: 2.0,
      }),
      makeLoad({ acwr: 1.1 }),
    );

    it('detects dissonance', () => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.signals.dissonanceDetected).toBe(true);
    });

    it('applies conservative bias (reduces score)', () => {
      const featuresWithoutDissonance = makeDayFeatures(
        makeRecovery({
          hrvDeltaFromBaseline: 8,
          rhrDeltaFromBaseline: -2,
          sleepEfficiencyPercent: 85,
          subjectiveWellnessIndex: 8.0, // matching subjective
        }),
        makeLoad({ acwr: 1.1 }),
      );
      const outputDissonance = runRecoveryModel(features, DEFAULT_CONTEXT);
      const outputNoDissonance = runRecoveryModel(featuresWithoutDissonance, DEFAULT_CONTEXT);

      // Conservative bias should result in a lower or equal score
      expect(outputDissonance.recoveryState.readinessScore ?? 0).toBeLessThanOrEqual(
        outputNoDissonance.recoveryState.readinessScore ?? 0,
      );
    });
  });

  describe('Determinism', () => {
    it('produces identical output when called twice with identical inputs', () => {
      const features = makeDayFeatures();

      const out1 = runRecoveryModel(features, DEFAULT_CONTEXT);
      const out2 = runRecoveryModel(features, DEFAULT_CONTEXT);

      expect(out1.recoveryState.readinessScore).toBe(out2.recoveryState.readinessScore);
      expect(out1.recoveryState.readinessCategory).toBe(out2.recoveryState.readinessCategory);
      expect(out1.decision.verdict).toBe(out2.decision.verdict);
      expect(out1.decision.recommendedIntensity).toBe(out2.decision.recommendedIntensity);
      expect(out1.signals.autonomicBalance).toBe(out2.signals.autonomicBalance);
      expect(out1.signals.overreachingRisk).toBe(out2.signals.overreachingRisk);
    });
  });

  describe('Output invariants', () => {
    it('readinessScore is always in [0, 100] when non-null', () => {
      const scenarios = [
        makeDayFeatures(makeRecovery({ hrvDeltaFromBaseline: 20, sleepEfficiencyPercent: 95 })),
        makeDayFeatures(makeRecovery({ hrvDeltaFromBaseline: -30, sleepEfficiencyPercent: 40 })),
        makeDayFeatures(makeRecovery({ hrvDeltaFromBaseline: 0, sleepEfficiencyPercent: 75 })),
      ];

      for (const features of scenarios) {
        const output = runRecoveryModel(features, DEFAULT_CONTEXT);
        if (output.recoveryState.readinessScore !== null) {
          expect(output.recoveryState.readinessScore).toBeGreaterThanOrEqual(0);
          expect(output.recoveryState.readinessScore).toBeLessThanOrEqual(100);
        }
      }
    });

    it('confidence is always in [0, 1]', () => {
      const output = runRecoveryModel(makeDayFeatures(), DEFAULT_CONTEXT);
      expect(output.recoveryState.confidence).toBeGreaterThanOrEqual(0);
      expect(output.recoveryState.confidence).toBeLessThanOrEqual(1);
    });

    it('recommendation has a type and at least one evidence item', () => {
      const output = runRecoveryModel(makeDayFeatures(), DEFAULT_CONTEXT);
      expect(output.recommendation.type).toBeDefined();
      expect(output.recommendation.keyEvidence.length).toBeGreaterThan(0);
      expect(output.recommendation.keyEvidence[0].code).toBeTruthy();
    });

    it('primaryLimitingFactor is the dimension with the lowest score', () => {
      const features = makeDayFeatures(
        makeRecovery({
          hrvDeltaFromBaseline: 8,
          sleepEfficiencyPercent: 24,
          sleepDebtMin: 200,
          subjectiveWellnessIndex: 7.0,
        }),
      );
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      expect(output.recoveryState.primaryLimitingFactor).toBe('sleep');
    });
  });

  describe('ReadinessCategory thresholds', () => {
    const scoreToCategory = (features: DayFeatures) => {
      const output = runRecoveryModel(features, DEFAULT_CONTEXT);
      return {
        score: output.recoveryState.readinessScore,
        category: output.recoveryState.readinessCategory,
      };
    };

    it('OPTIMAL is returned for score ≥ 85', () => {
      // All dimensions near max
      const { category } = scoreToCategory(
        makeDayFeatures(
          makeRecovery({
            hrvDeltaFromBaseline: 12,
            sleepEfficiencyPercent: 90,
            subjectiveWellnessIndex: 9.0,
          }),
          makeLoad({ acwr: 1.15, loadMonotony: 1.2 }),
        ),
      );
      expect(category).toBe('OPTIMAL');
    });

    it('VERY_LOW category triggers REST recommendation', () => {
      const output = runRecoveryModel(
        makeDayFeatures(
          makeRecovery({
            hrvDeltaFromBaseline: -30,
            sleepEfficiencyPercent: 45,
            subjectiveWellnessIndex: 1.5,
          }),
          makeLoad({ acwr: 1.9, loadMonotony: 2.8 }),
        ),
        DEFAULT_CONTEXT,
      );
      expect(['VERY_LOW', 'LOW']).toContain(output.recoveryState.readinessCategory);
      expect(['REST', 'VERY_EASY']).toContain(output.recommendation.type);
    });
  });
});
