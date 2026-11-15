/**
 * SCIENTIFIC VALIDATION SUITE — Recovery Model v1
 *
 * ════════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * This suite validates that the Recovery Model produces PHYSIOLOGICALLY
 * CORRECT outputs, not merely that the code executes without errors.
 *
 * These tests are REGRESSION tests for scientific correctness.
 * A future model change that silently breaks physiological behavior
 * while all unit tests pass MUST fail here.
 *
 * Distinction from model.test.ts:
 *   model.test.ts   → boundary values, edge cases, algorithmic invariants
 *   THIS FILE       → realistic athlete histories, expected outcomes derived
 *                     from sports science literature, multi-dimension assertions
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SCORING REFERENCE (used to compute expected values)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Autonomic dimension (HRV + RHR):
 *   HRV delta → raw:  > +10% → 100 | +5–10% → 90 | 0–5% → 80 | -5–0% → 70
 *                     -10–-5% → 55 | -15–-10% → 40 | -25–-15% → 25 | < -25% → 10
 *   RHR modifier:     > +7 bpm → 0.65 | > +5 → 0.75 | > +3 → 0.85
 *                     > -2 → 1.00 | > -5 → 1.05 | ≤ -5 → 1.10
 *
 * Sleep dimension (restorative ratio = deep+REM / total):
 *   Ratio → raw:      ≥ 55% → 100 | ≥ 45% → 85 | ≥ 40% → 70 | ≥ 32% → 50
 *                     ≥ 25% → 35 | < 25% → 20
 *   Debt modifier:    ≤ 30min → 1.00 | ≤ 90min → 0.95 | ≤ 150min → 0.90
 *                     ≤ 210min → 0.85 | ≤ 300min → 0.75 | ≤ 420min → 0.65 | > 420min → 0.55
 *
 * Subjective dimension:
 *   Wellness → raw:   ≥ 8.0 → 100 | ≥ 6.5 → 80 | ≥ 5.0 → 60 | ≥ 3.5 → 40
 *                     ≥ 2.0 → 20 | < 2.0 → 10
 *
 * Load context dimension:
 *   ACWR → raw:       null → 75 | < 0.8 → 70 | ≤ 1.0 → 85 | ≤ 1.3 → 100
 *                     ≤ 1.5 → 65 | ≤ 1.8 → 40 | ≤ 2.0 → 20 | > 2.0 → 5
 *   Monotony modifier:< 1.5 → 1.05 | ≤ 2.0 → 1.00 | ≤ 2.5 → 0.90 | > 2.5 → 0.80
 *
 * Composite weights: autonomic 0.35 | sleep 0.30 | subjective 0.25 | loadContext 0.10
 *
 * ReadinessCategory:  OPTIMAL ≥ 85 | ADEQUATE 70–84 | REDUCED 50–69
 *                     LOW 30–49 | VERY_LOW < 30
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import { runRecoveryModel } from '../model';
import type { RecoveryFeatureSet, LoadFeatureSet, DayFeatures } from '../../../features/types';
import type { RecoveryModelContext } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared factories
// ─────────────────────────────────────────────────────────────────────────────

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
    subjectiveWellnessComponents: {
      mood: null,
      energyLevel: null,
      perceivedSoreness: null,
      stressLevel: null,
    },
    rpeVsTargetZone: null,
    avgStressDuringSleep: null,
    confidence: 0.85,
    algorithmId: 'recovery-features-v1',
    sourceObsIds: [],
    ...overrides,
  };
}

function makeLoad(overrides: Partial<LoadFeatureSet> = {}): LoadFeatureSet {
  return {
    trainingDayId: '2026-07-02',
    acuteLoad: 280,
    chronicLoad: 280,
    acwr: 1.0,
    weeklyLoad: 280,
    loadMonotony: null,
    loadStrain: null,
    trainingFrequency: 5,
    restDayCount: 2,
    acuteChronicLoadTrend: 0,
    acuteLoadRun: null,
    acuteLoadBike: null,
    chronicLoadRun: null,
    chronicLoadBike: null,
    confidence: 0.9,
    algorithmId: 'load-features-v1',
    sourceObsIds: [],
    ...overrides,
  };
}

function makeDay(
  recovery: RecoveryFeatureSet | 'PENDING',
  load: LoadFeatureSet | 'PENDING',
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

const CTX: RecoveryModelContext = {
  athleteId: 'athlete-1',
  trainingDayId: '2026-07-02',
  previousReadinessScore: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 1 — Acute Overload Followed by Rest Recommendation
//
// Physiological context:
//   Three consecutive hard training days have driven HRV below personal
//   baseline. The athlete is in the "performance decrement" phase of the
//   classic stimulus-fatigue-recovery-adaptation cycle.
//
// Expected behavior per SHARPIT spec:
//   • Autonomic dimension is the primary limiting factor
//   • Readiness falls in the LOW zone (30–49)
//   • Model recommends VERY_EASY — not REST (no illness pattern)
//   • Overreaching risk at MODERATE (two primary dims below threshold)
//
// Scientific rationale:
//   HRV suppression at -18% below personal baseline reliably indicates
//   incomplete autonomic recovery (Buchheit 2014, Plews et al. 2013).
//   Short-term sleep deficit (90 min over 7 days) amplifies fatigue.
//   ACWR = 1.65 places the athlete in the "elevated risk" zone per
//   Gabbett 2016, though this is contextual for endurance athletes.
//
// Literature:
//   Buchheit M. (2014). Monitoring training status with HR measures.
//   Front. Physiol. doi:10.3389/fphys.2014.00112
//   Plews DJ et al. (2013). Heart rate variability and training intensity.
//   Int J Sports Physiol Perform. 8(5):560-9.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 1 — Acute overload: three consecutive hard training days', () => {
  // HRV delta -18% → autonomicRaw = 25 × rhrModifier(+2 bpm = 1.00) = 25
  // restorative 38% → sleepRaw = 50 × debtModifier(90min = 0.95) = 48
  // wellness 4.5 → subjectiveRaw = 40
  // ACWR 1.65 → loadContextRaw = 40
  // composite = 25×0.35 + 48×0.30 + 40×0.25 + 40×0.10 = 37
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: -18,
    rhrDeltaFromBaseline: 2,
    sleepEfficiencyPercent: 38,
    sleepDebtMin: 90,
    subjectiveWellnessIndex: 4.5,
  });
  const load = makeLoad({ acuteLoad: 462, chronicLoad: 280, acwr: 1.65 });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score falls in the LOW zone (30–49)', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(30);
    expect(result.recoveryState.readinessScore!).toBeLessThan(50);
  });

  it('readiness category is LOW — incomplete autonomic recovery', () => {
    expect(result.recoveryState.readinessCategory).toBe('LOW');
  });

  it('recommends VERY_EASY — movement without further stress', () => {
    expect(result.recommendation.type).toBe('VERY_EASY');
  });

  it('verdict is FATIGUED — not yet overreached', () => {
    expect(result.decision.verdict).toBe('FATIGUED');
  });

  it('autonomic balance is SUPPRESSED — HRV is meaningfully below baseline', () => {
    expect(result.signals.autonomicBalance).toBe('SUPPRESSED');
  });

  it('overreaching risk is MODERATE — multiple primary dimensions compromised', () => {
    expect(result.signals.overreachingRisk).toBe('MODERATE');
  });

  it('illness risk is LOW — suppression has a training load explanation', () => {
    expect(result.signals.illnessRisk).toBe('LOW');
  });

  it('primary limiting factor is autonomic — HRV is the bottleneck', () => {
    expect(result.recoveryState.primaryLimitingFactor).toBe('autonomic');
  });

  it('time to full recovery is estimated as non-null positive value', () => {
    expect(result.recoveryState.estimatedTimeToFullRecovery).not.toBeNull();
    expect(result.recoveryState.estimatedTimeToFullRecovery!).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 2 — Progressive Overload with Successful Adaptation
//
// Physiological context:
//   Week 6 of a BASE phase. Load has been progressively increasing by ~8%
//   per week (within the "safe" progression range). HRV is slightly above
//   baseline — a hallmark of positive autonomic adaptation (HRV4Training
//   evidence suggests HRV trend elevation during managed progressive loading).
//
// Expected behavior:
//   • All four dimensions in NORMAL or above range
//   • Readiness in ADEQUATE zone (70–84)
//   • MODERATE training recommended — stimulus is appropriate
//   • No overreaching risk — the body is absorbing the load
//
// Scientific rationale:
//   Positive HRV trend (+3% above rolling baseline) during progressive
//   loading is a reliable indicator of adaptation (Plews et al. 2014,
//   "Managing training loads in cycling using HRV4Training").
//   ACWR = 1.15 is within the "optimal" zone per Hulin et al. 2017.
//
// Literature:
//   Hulin BT et al. (2017). The acute-to-chronic workload ratio predicts
//   injury. BJSM 50(4):231-6.
//   Plews DJ et al. (2014). Evaluating training adaptation with HRV.
//   Int J Sports Physiol Perform. 9(5):783-90.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 2 — Progressive overload: BASE phase week 6, successful adaptation', () => {
  // HRV delta +3% → autonomicRaw = 80 × rhrModifier(0 = 1.00) = 80
  // restorative 48% → sleepRaw = 85 × debtModifier(15min = 1.00) = 85
  // composite ≈ 80×0.35 + 85×0.30 + 80×0.25 + 100×0.10 = 84
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: 3,
    rhrDeltaFromBaseline: 0,
    sleepEfficiencyPercent: 48,
    sleepDebtMin: 15,
    subjectiveWellnessIndex: 7.0,
  });
  const load = makeLoad({ acuteLoad: 322, chronicLoad: 280, acwr: 1.15, loadMonotony: 1.6 });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score is in the ADEQUATE zone (70–84)', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(70);
    expect(result.recoveryState.readinessScore!).toBeLessThan(85);
  });

  it('readiness category is ADEQUATE — body is absorbing the training stimulus', () => {
    expect(result.recoveryState.readinessCategory).toBe('ADEQUATE');
  });

  it('recommends MODERATE — structured training is appropriate', () => {
    expect(result.recommendation.type).toBe('MODERATE');
  });

  it('verdict is PARTIALLY_RECOVERED — good adaptation, not peak freshness', () => {
    expect(result.decision.verdict).toBe('PARTIALLY_RECOVERED');
  });

  it('autonomic balance is NORMAL — HRV elevation confirms adaptation', () => {
    expect(result.signals.autonomicBalance).toBe('NORMAL');
  });

  it('overreaching risk is LOW — progressive load is well managed', () => {
    expect(result.signals.overreachingRisk).toBe('LOW');
  });

  it('dissonance is not detected — objective and subjective markers agree', () => {
    expect(result.signals.dissonanceDetected).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 3 — Sleep Deprivation with Reduced Readiness
//
// Physiological context:
//   5-day work sprint: the athlete averaged 6.5h/night instead of 8h.
//   HRV is nominally preserved (sleep deprivation initially spares
//   sympathovagal balance before cardiovascular markers degrade).
//   Subjective wellness is reduced but not critical.
//
// Expected behavior:
//   • Sleep is the PRIMARY limiting factor — not HRV
//   • Readiness in REDUCED zone (50–69)
//   • EASY session recommended — not REST
//   • The model isolates sleep as the bottleneck despite normal HRV
//
// Scientific rationale:
//   Cumulative sleep debt of ≥ 5h over 7 days corresponds to the
//   Van Dongen et al. 2003 protocol showing significant cognitive and
//   physical performance decrements. HRV may remain near baseline during
//   mild sleep restriction (Vanhelder & Radomski 1989), making sleep
//   metrics a distinct and essential recovery dimension.
//
// Literature:
//   Van Dongen HPA et al. (2003). The cumulative cost of additional
//   wakefulness. Sleep. 26(2):117-26.
//   Fullagar HH et al. (2015). Sleep and athletic performance.
//   Sports Med. 45(2):161-86.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 3 — Sleep deprivation: 5-night work sprint, 6.5h average', () => {
  // restorative 38% → sleepRaw = 50 × debtModifier(300min = 0.75) = 38
  // wellness 5.0 → subjectiveRaw = 60
  // ACWR 1.1 → loadContextRaw = 100
  // composite ≈ 70×0.35 + 25×0.30 + 60×0.25 + 100×0.10 = 57
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: 0,
    rhrDeltaFromBaseline: 1,
    sleepEfficiencyPercent: 38,
    sleepDebtMin: 300,
    subjectiveWellnessIndex: 5.0,
  });
  const load = makeLoad({ acuteLoad: 308, chronicLoad: 280, acwr: 1.1 });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score is in the REDUCED zone (50–69) — sleep debt suppresses readiness', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(50);
    expect(result.recoveryState.readinessScore!).toBeLessThan(70);
  });

  it('readiness category is REDUCED', () => {
    expect(result.recoveryState.readinessCategory).toBe('REDUCED');
  });

  it('sleep adequacy is SEVERELY_INSUFFICIENT — high cumulative debt', () => {
    expect(result.signals.sleepAdequacy).toBe('SEVERELY_INSUFFICIENT');
  });

  it('autonomic balance is NORMAL — HRV is preserved despite sleep restriction', () => {
    expect(result.signals.autonomicBalance).toBe('NORMAL');
  });

  it('primary limiting factor is SLEEP — not autonomic', () => {
    expect(result.recoveryState.primaryLimitingFactor).toBe('sleep');
  });

  it('recommends EASY — sleep debt reduces training benefit below MODERATE threshold', () => {
    expect(result.recommendation.type).toBe('EASY');
  });

  it('overreaching risk is LOW — single dimension compromised', () => {
    expect(result.signals.overreachingRisk).toBe('LOW');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 4 — HRV Suppression After High-Intensity Block
//
// Physiological context:
//   Morning after 3×20min VO2max intervals (RPE 8–9/10). HRV is suppressed
//   at -14% from personal baseline — a well-documented post-HIT response.
//   Sleep quality is preserved (hard sessions typically improve sleep depth).
//   Subjective feeling: "worked hard, but fine".
//
// Expected behavior:
//   • Autonomic dimension is the PRIMARY limiting factor
//   • Sleep dimension confirms it is NOT sleep-related
//   • Readiness REDUCED, recommend EASY session
//   • Model correctly distinguishes HRV suppression from sleep impairment
//
// Scientific rationale:
//   High-intensity training transiently suppresses parasympathetic HRV by
//   10–20% for 24–48h (Plews et al. 2013). Sleep quality typically improves
//   post-exercise (Driver & Taylor 2000). This scenario validates that the
//   model weights the correct dimension and does not confound the two.
//
// Literature:
//   Plews DJ et al. (2013). Diurnal HRV changes. IJSPP 8(5):560-9.
//   Driver HS & Taylor SR (2000). Exercise and sleep. Sleep Med Rev. 4(4):387-402.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 4 — Post high-intensity: HRV suppressed, sleep preserved', () => {
  // HRV delta -14% → autonomicRaw = 40 × rhrModifier(+4 bpm = 0.85) = 34
  // restorative 44% → sleepRaw = 85 × debtModifier(60min = 0.90) = 76
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: -14,
    rhrDeltaFromBaseline: 4,
    sleepEfficiencyPercent: 46,
    sleepDebtMin: 60,
    subjectiveWellnessIndex: 6.5,
    rpeVsTargetZone: 1.5,
  });
  const load = makeLoad({ acuteLoad: 378, chronicLoad: 280, acwr: 1.35 });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score is in the REDUCED zone (50–69)', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(50);
    expect(result.recoveryState.readinessScore!).toBeLessThan(70);
  });

  it('readiness category is REDUCED', () => {
    expect(result.recoveryState.readinessCategory).toBe('REDUCED');
  });

  it('autonomic balance is SUPPRESSED — HRV-specific post-HIT signal', () => {
    expect(result.signals.autonomicBalance).toBe('SUPPRESSED');
  });

  it('sleep adequacy is ADEQUATE — sleep is NOT the bottleneck', () => {
    expect(result.signals.sleepAdequacy).toBe('ADEQUATE');
  });

  it('primary limiting factor is AUTONOMIC — correctly identifies HRV as root cause', () => {
    expect(result.recoveryState.primaryLimitingFactor).toBe('autonomic');
  });

  it('recommends EASY — active aerobic work is appropriate, not intensity', () => {
    expect(result.recommendation.type).toBe('EASY');
  });

  it('overreaching risk remains LOW — single hard session, not a pattern', () => {
    expect(result.signals.overreachingRisk).toBe('LOW');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 5 — Illness Detection Without Preceding Training Load
//
// Physiological context:
//   Monday morning. The athlete has been tapering — 40% of normal training
//   volume. Despite low load, HRV has crashed by -35% overnight. This is
//   the classic "immune activation" pattern: the immune system competes
//   for parasympathetic resources, suppressing HRV independently of fatigue.
//
// Expected behavior:
//   • illnessRisk = HIGH (HRV crash > 30% AND acuteLoad < chronicLoad × 0.7)
//   • This OVERRIDES all other signals — mandatory REST regardless of
//     subjective wellness or load context
//   • verdict = OVERREACHED (illness decision pathway)
//   • readinessCategory = VERY_LOW (illness override caps readiness at 25)
//
// Scientific rationale:
//   The diagnostic signature of early illness is HRV suppression
//   disproportionate to training load (Garet et al. 2004).
//   An HRV drop > 30% without corresponding acute load is
//   physiologically inconsistent with fatigue — it suggests systemic
//   inflammatory or immune activation requiring rest, not training.
//   This is SHARPIT's core safety invariant.
//
// Literature:
//   Garet M et al. (2004). Individual interdependence between nocturnal
//   ANS activity and performance. Med Sci Sports Exerc. 36(8):1394-1404.
//   Plews DJ et al. (2013). HRV training monitoring. IJSPP 8(5):560-9.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 5 — Illness detection: HRV crash without training load explanation', () => {
  // HRV delta -35% → autonomicRaw = 10 × rhrModifier(+6 = 0.75) = 7.5
  // illnessRisk: -35 < -30 AND acuteLoad (180) < chronicLoad (330) × 0.7 (231) → HIGH
  // illness override: effectiveScore = min(computed, 25), effectiveCategory = VERY_LOW
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: -35,
    rhrDeltaFromBaseline: 6,
    sleepEfficiencyPercent: 70,
    sleepDebtMin: 60,
    subjectiveWellnessIndex: 5.0,
  });
  const load = makeLoad({
    acuteLoad: 180,
    chronicLoad: 330,
    acwr: 180 / 330, // ≈ 0.545 — low, taper load
  });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('illness risk is HIGH — HRV crash without training load explanation', () => {
    expect(result.signals.illnessRisk).toBe('HIGH');
  });

  it('readiness category is VERY_LOW — illness overrides all other signals', () => {
    expect(result.recoveryState.readinessCategory).toBe('VERY_LOW');
  });

  it('readiness score is capped at 25 by illness override', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeLessThanOrEqual(25);
  });

  it('verdict is OVERREACHED — illness pathway mandates this', () => {
    expect(result.decision.verdict).toBe('OVERREACHED');
  });

  it('recommends REST — unconditional, non-negotiable', () => {
    expect(result.recommendation.type).toBe('REST');
  });

  it('autonomic balance is CRITICALLY_SUPPRESSED — extreme HRV suppression', () => {
    expect(result.signals.autonomicBalance).toBe('CRITICALLY_SUPPRESSED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 6 — Taper Before Race
//
// Physiological context:
//   7 days before the target race. The athlete has completed a 3-week taper:
//   volume reduced to 40% of peak training, intensity maintained.
//   HRV is elevated above baseline — classic supercompensation marker.
//   Sleep quality excellent, subjective wellness at peak season high.
//   ACWR is deliberately low (0.65) — this is expected, not alarming.
//
// Expected behavior:
//   • Readiness OPTIMAL (≥ 85) — full supercompensation achieved
//   • HARD training recommended — this is the goal of taper
//   • Low ACWR does NOT prevent HARD recommendation (recovery is the criterion)
//   • overreachingRisk = LOW — all dimensions healthy
//
// Scientific rationale:
//   Taper-induced supercompensation improves neuromuscular function,
//   glycogen stores, and parasympathetic tone within 7–21 days (Mujika &
//   Padilla 2003). HRV elevation above personal baseline during taper
//   is a reliable indicator that the taper is working (Plews et al. 2014).
//   The model must correctly prioritize RECOVERY signals over LOAD signals
//   when they conflict.
//
// Literature:
//   Mujika I & Padilla S (2003). Scientific bases for pre-competition
//   tapering strategies. Med Sci Sports Exerc. 35(7):1182-7.
//   Plews DJ et al. (2014). HRV and training load during taper.
//   Int J Sports Physiol Perform. 9(5):783-90.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 6 — Taper before race: supercompensation achieved', () => {
  // HRV delta +8% → autonomicRaw = 90 × rhrModifier(-2 bpm = 1.05) = 94.5
  // sleep efficiency 87% → sleepRaw = 100 × debtModifier(-30min = 1.00) = 100
  // wellness 8.5 → subjectiveRaw = 100
  // ACWR 0.65 → loadContextRaw = 70 (deliberate undertrain)
  // composite = 94.5×0.35 + 100×0.30 + 100×0.25 + 70×0.10 = 95
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: 8,
    rhrDeltaFromBaseline: -2,
    sleepEfficiencyPercent: 87,
    sleepDebtMin: -30, // sleep surplus — athlete has been resting
    subjectiveWellnessIndex: 8.5,
  });
  const load = makeLoad({ acuteLoad: 112, chronicLoad: 280, acwr: 0.65 });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score is in the OPTIMAL zone (≥ 85) — supercompensation achieved', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(85);
  });

  it('readiness category is OPTIMAL', () => {
    expect(result.recoveryState.readinessCategory).toBe('OPTIMAL');
  });

  it('recommends HARD — peak readiness window, ideal for key session', () => {
    expect(result.recommendation.type).toBe('HARD');
  });

  it('verdict is RECOVERED — full recovery achieved', () => {
    expect(result.decision.verdict).toBe('RECOVERED');
  });

  it('autonomic balance is ENHANCED — HRV elevation confirms taper response', () => {
    expect(result.signals.autonomicBalance).toBe('ENHANCED');
  });

  it('overreaching risk is LOW — all dimensions healthy', () => {
    expect(result.signals.overreachingRisk).toBe('LOW');
  });

  it('low ACWR does NOT block HARD recommendation — recovery drives decision', () => {
    // This invariant validates that the model prioritizes recovery over load context.
    // Taper = deliberate detraining. Low ACWR is a feature, not a problem.
    expect(result.recommendation.type).toBe('HARD');
    expect(result.recoveryState.readinessCategory).toBe('OPTIMAL');
  });

  it('no time-to-full-recovery estimated — athlete is already recovered', () => {
    expect(result.recoveryState.estimatedTimeToFullRecovery).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 7 — Functional Overreaching
//
// Physiological context:
//   End of Week 3 of a 4-week BUILD block. The athlete has accumulated
//   physiological debt across ALL primary recovery dimensions simultaneously.
//   This is the expected "functional overreaching" state that precedes
//   supercompensation if followed by adequate rest.
//
// Expected behavior:
//   • overreachingRisk = HIGH (autonomic score < 30 AND sleep score < 40
//     simultaneously — multi-dimensional overreaching signature)
//   • illnessRisk = ELEVATED (HRV > 20% below baseline)
//   • readinessCategory = LOW
//   • intensity = VERY_EASY — not REST (illness risk is ELEVATED, not HIGH)
//
// Scientific rationale:
//   Functional overreaching (FOR) is defined as >2 weeks of performance
//   decrement with recovery in days-weeks (Meeusen et al. 2013).
//   Its hallmark is multi-dimensional suppression: HRV, sleep quality,
//   AND subjective wellness all degraded simultaneously.
//   High load monotony (>2.5) further impairs recovery by preventing
//   adequate parasympathetic rebound between sessions.
//
// Literature:
//   Meeusen R et al. (2013). Prevention, diagnosis, and treatment of the
//   overtraining syndrome. EJSS 13(1):1-24.
//   Foster C (1998). Monitoring training in athletes with reference to
//   overtraining syndrome. Med Sci Sports Exerc. 30(7):1164-8.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 7 — Functional overreaching: end of BUILD block week 3', () => {
  // HRV delta -20.5% → autonomicRaw ≈ 24 (the bands are linear between their centres) × rhrModifier(+4 = 0.85) ≈ 21.25
  // restorative 30% → sleepRaw = 35 × debtModifier(180min = 0.85) ≈ 30
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: -20.5,
    rhrDeltaFromBaseline: 4,
    sleepEfficiencyPercent: 30,
    sleepDebtMin: 180,
    subjectiveWellnessIndex: 5.0,
    rpeVsTargetZone: 2.5,
  });
  const load = makeLoad({
    acuteLoad: 476,
    chronicLoad: 280,
    acwr: 1.7,
    loadMonotony: 2.8,
    loadStrain: 476 * 2.8,
  });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score falls in LOW zone (30–49) — functional overreaching state', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(30);
    expect(result.recoveryState.readinessScore!).toBeLessThan(50);
  });

  it('readiness category is LOW', () => {
    expect(result.recoveryState.readinessCategory).toBe('LOW');
  });

  it('overreaching risk is HIGH — simultaneous autonomic and sleep suppression', () => {
    // Core overreaching signature: HRV score < 30 AND sleep score < 40
    expect(result.signals.overreachingRisk).toBe('HIGH');
  });

  it('illness risk is ELEVATED — HRV > 20% below baseline without illness trigger', () => {
    // ELEVATED (not HIGH) because acuteLoad is HIGH, explaining the HRV suppression
    expect(result.signals.illnessRisk).toBe('ELEVATED');
  });

  it('recommends VERY_EASY — moderate movement to maintain circulation, not rest', () => {
    // NOT REST because: illness risk = ELEVATED (not HIGH), category = LOW (not VERY_LOW)
    expect(result.recommendation.type).toBe('VERY_EASY');
  });

  it('verdict is FATIGUED — accumulated fatigue pattern', () => {
    expect(result.decision.verdict).toBe('FATIGUED');
  });

  it('autonomic balance is CRITICALLY_SUPPRESSED — deep HRV suppression', () => {
    // autonomicScore ≈ 21 < 25 threshold → CRITICALLY_SUPPRESSED
    expect(result.signals.autonomicBalance).toBe('CRITICALLY_SUPPRESSED');
  });

  it('primary limiting factor is AUTONOMIC — deepest suppression', () => {
    expect(result.recoveryState.primaryLimitingFactor).toBe('autonomic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 8 — Recovery After Complete Rest
//
// Physiological context:
//   Two full rest days after the functional overreaching state (Scenario 7).
//   The athlete slept 8h+ both nights, trained zero. HRV is recovering
//   toward baseline (-3% vs the -22% of two days ago).
//
// Expected behavior:
//   • Readiness in ADEQUATE zone (70–84) — recovering trajectory
//   • Transition from FATIGUED to PARTIALLY_RECOVERED
//   • overreachingRisk = LOW — multi-dimensional recovery
//   • Intensity = MODERATE — ready to resume structured training
//
// Scientific rationale:
//   48–72h of complete rest following functional overreaching is sufficient
//   to restore autonomic balance in most athletes (Meeusen et al. 2013,
//   Halson & Jeukendrup 2004). HRV typically returns toward baseline within
//   2 days of rest if the overreaching was functional (not non-functional).
//   This scenario validates the recovery arc — the model must respond
//   correctly to improving signals, not just degrading ones.
//
// Literature:
//   Halson SL & Jeukendrup AE (2004). Does overtraining exist?
//   Sports Med. 34(14):967-81.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 8 — Recovery after complete rest: 48h zero-load recovery block', () => {
  // HRV delta -3% → autonomicRaw = 70 × rhrModifier(0 = 1.00) = 70
  // sleep efficiency 83% → sleepRaw = 80 × debtModifier(60min = 0.90) = 72
  // wellness 7.0 → subjectiveRaw = 80
  // ACWR 0.85 → loadContextRaw = 85 (well-managed return)
  // composite = 70×0.35 + 72×0.30 + 80×0.25 + 85×0.10 = 74.6 → 75
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: -3,
    rhrDeltaFromBaseline: 0,
    sleepEfficiencyPercent: 83,
    sleepDebtMin: 60,
    subjectiveWellnessIndex: 7.0,
  });
  const load = makeLoad({ acuteLoad: 238, chronicLoad: 280, acwr: 0.85 });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score is in ADEQUATE zone (70–84) — recovery is underway', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(70);
    expect(result.recoveryState.readinessScore!).toBeLessThan(85);
  });

  it('readiness category is ADEQUATE — restored from LOW after rest', () => {
    expect(result.recoveryState.readinessCategory).toBe('ADEQUATE');
  });

  it('overreaching risk has resolved to LOW — rest worked', () => {
    expect(result.signals.overreachingRisk).toBe('LOW');
  });

  it('recommends MODERATE — resumed training load is appropriate', () => {
    expect(result.recommendation.type).toBe('MODERATE');
  });

  it('verdict is PARTIALLY_RECOVERED — not yet at peak but trainable', () => {
    expect(result.decision.verdict).toBe('PARTIALLY_RECOVERED');
  });

  it('autonomic balance is NORMAL — HRV has recovered to near-baseline', () => {
    // -3% delta → score 70 → NORMAL (≥ 65)
    expect(result.signals.autonomicBalance).toBe('NORMAL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 9 — Chronic High Load with Stable Adaptation
//
// Physiological context:
//   Week 10 of an elite athlete's pre-season block. Training volume is high
//   (CTL ~90 TSS/day equivalent). Despite the high absolute load, ACWR is
//   controlled at 1.05. HRV is slightly elevated above baseline — a marker
//   of aerobic adaptation and cardiovascular supercompensation.
//
// Expected behavior:
//   • Readiness OPTIMAL (≥ 85) despite high chronic load
//   • HARD session recommended — the athlete is adapted
//   • overreachingRisk = LOW — load is high but stable (ACWR safe)
//   • This validates that "high load" ≠ "overreaching" in the model
//
// Scientific rationale:
//   Athletes with high chronic training loads (CTL > 80 TSS/day) can
//   sustain readiness when load is stable. HRV elevation above personal
//   baseline is documented in highly fit athletes even at high absolute
//   training volumes (Flatt & Esco 2016). The model must not penalize
//   chronic high load — it must assess the RATIO and TREND, not
//   absolute volume.
//
// Literature:
//   Flatt AA & Esco MR (2016). Evaluating individual training adaptation
//   with smartphone HRV. JSCR 30(2):378-85.
//   Gabbett TJ (2016). The training-injury prevention paradox. BJSM 50(4):273-80.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 9 — Chronic high load: elite athlete, stable adaptation at high volume', () => {
  // HRV delta +6% → autonomicRaw = 90 × rhrModifier(-2 = 1.05) = 94.5 → ENHANCED (≥ 85)
  // NOTE: +5% would give raw=80 (pct > 0 branch) → score=84 → NORMAL. +6% uses pct > 5 branch (raw=90).
  // sleep efficiency 85% → sleepRaw = 100 × debtModifier(30min = 1.00) = 100
  // wellness 7.5 → subjectiveRaw = 80
  // ACWR 1.05 → loadContextRaw = 100
  // composite = 94.5×0.35 + 100×0.30 + 80×0.25 + 100×0.10 = 93
  const recovery = makeRecovery({
    hrvDeltaFromBaseline: 6,
    rhrDeltaFromBaseline: -2,
    sleepEfficiencyPercent: 85,
    sleepDebtMin: 30,
    subjectiveWellnessIndex: 7.5,
  });
  const load = makeLoad({
    acuteLoad: 630, // ~90 TSS/day × 7 days
    chronicLoad: 600, // high chronic load — well-trained athlete
    acwr: 1.05,
    loadMonotony: 1.4,
  });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('readiness score is in OPTIMAL zone (≥ 85) — adapted to high volume', () => {
    expect(result.recoveryState.readinessScore).not.toBeNull();
    expect(result.recoveryState.readinessScore!).toBeGreaterThanOrEqual(85);
  });

  it('readiness category is OPTIMAL despite high absolute training load', () => {
    expect(result.recoveryState.readinessCategory).toBe('OPTIMAL');
  });

  it('recommends HARD — adaptation is confirmed, quality training appropriate', () => {
    expect(result.recommendation.type).toBe('HARD');
  });

  it('overreaching risk is LOW — high load is stable and well-managed', () => {
    expect(result.signals.overreachingRisk).toBe('LOW');
  });

  it('autonomic balance is ENHANCED — HRV elevation above baseline confirms adaptation', () => {
    expect(result.signals.autonomicBalance).toBe('ENHANCED');
  });

  it('high chronic load does NOT trigger overreaching detection when ACWR is controlled', () => {
    // This invariant prevents the model from penalizing high-volume athletes
    // who are adapted. The key signal is ACWR + HRV trend, not absolute load.
    expect(result.signals.overreachingRisk).toBe('LOW');
    expect(result.recoveryState.readinessCategory).toBe('OPTIMAL');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO 10 — Beginner Athlete During Cold Start
//
// Physiological context:
//   Day 7 of using SHARPIT. Baseline is not yet established (HRV delta
//   unavailable — fewer than 7 prior data points). Only absolute HRV
//   (population-norm fallback), sleep data, and ACWR = null (chronic
//   load window not yet complete) are available.
//
// Expected behavior:
//   • Low confidence (< 0.30) — no personal baseline, low quality factors
//   • Model operates on population norms rather than personal delta
//   • Recommendation is conservative (EASY) to avoid injury risk
//   • No crash — the model handles missing data gracefully
//
// Scientific rationale:
//   Personal HRV baseline requires ≥ 7 consecutive days for reliable
//   delta computation (Plews et al. 2013). Until established, absolute
//   RMSSD is compared against population norms (~50ms for recreational
//   athletes), introducing higher uncertainty.
//   The system must communicate this uncertainty through low confidence
//   rather than fabricating precision. Honest uncertainty is preferable
//   to false precision.
//
// Literature:
//   Plews DJ et al. (2013). HRV monitoring. IJSPP 8(5):560-9.
//   SYSTEM_FLOW.md §Cold Start Problem — baseline maturity thresholds.
// ─────────────────────────────────────────────────────────────────────────────

describe('Scenario 10 — Cold start: beginner athlete, day 7, no baseline established', () => {
  // No HRV delta (baseline not established) → fallback path
  // hrvAbsolute = 48 ms (near population norm for recreational) → autonomicRaw = 55 (fallback)
  // restorative 36% → sleepRaw = 50 × debtModifier(150min = 0.90) = 45
  const recovery = makeRecovery({
    hrvAbsolute: 48,
    hrvDeltaFromBaseline: null, // no baseline established
    rhrDeltaFromBaseline: null,
    sleepEfficiencyPercent: 36,
    sleepDebtMin: 150,
    subjectiveWellnessIndex: null, // no subjective observation yet
  });
  const load = makeLoad({
    acuteLoad: 90,
    chronicLoad: 0,
    acwr: null, // chronic window not yet complete
    weeklyLoad: 90,
    loadMonotony: null,
    loadStrain: null,
  });
  const result = runRecoveryModel(makeDay(recovery, load), CTX);

  it('confidence is below 0.30 — no personal baseline, high measurement uncertainty', () => {
    expect(result.recoveryState.confidence).toBeLessThan(0.3);
  });

  it('model does not crash with missing delta, subjective, or ACWR', () => {
    // Graceful degradation — the model produces a result even with sparse inputs
    expect(result.recoveryState.readinessCategory).toBeDefined();
    expect(result.recommendation.type).toBeDefined();
    expect(result.recommendation.keyEvidence).toBeDefined();
  });

  it('recommendation is conservative — EASY or more conservative', () => {
    const conservativeIntensities = ['REST', 'VERY_EASY', 'EASY'];
    expect(conservativeIntensities).toContain(result.recommendation.type);
  });

  it('recommendation confidence is low — uncertainty is explicit', () => {
    expect(result.recommendation.confidence).toBeLessThan(0.3);
  });

  it('dissonance is not detected — insufficient data prevents false dissonance', () => {
    // Without subjective data, the dissonance check cannot fire
    expect(result.signals.dissonanceDetected).toBe(false);
  });

  it('illness risk is LOW — single absolute HRV reading cannot trigger illness detection', () => {
    // illnessRisk requires HRV DELTA (personal baseline comparison), not absolute HRV
    expect(result.signals.illnessRisk).toBe('LOW');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-SCENARIO INVARIANTS
//
// These tests verify behavioral invariants that MUST hold across all possible
// inputs — they are the scientific "never violate" rules of the system.
// ─────────────────────────────────────────────────────────────────────────────

describe('Cross-scenario invariants — physiological safety rules', () => {
  it('illness pattern (HRV crash + low load) ALWAYS mandates REST, regardless of subjective wellness', () => {
    // Even if the athlete subjectively feels fine, an HRV crash without
    // training load explanation must produce a REST recommendation.
    const recovery = makeRecovery({
      hrvDeltaFromBaseline: -35,
      rhrDeltaFromBaseline: 3,
      sleepEfficiencyPercent: 82,
      sleepDebtMin: 15,
      subjectiveWellnessIndex: 7.5, // feeling fine — but HRV says otherwise
    });
    const load = makeLoad({ acuteLoad: 80, chronicLoad: 350, acwr: 80 / 350 });
    const result = runRecoveryModel(makeDay(recovery, load), CTX);

    expect(result.signals.illnessRisk).toBe('HIGH');
    expect(result.recommendation.type).toBe('REST');
  });

  it('HRV elevation above baseline produces NORMAL or ENHANCED autonomic signal — never SUPPRESSED', () => {
    const recovery = makeRecovery({ hrvDeltaFromBaseline: 12, rhrDeltaFromBaseline: 0 });
    const load = makeLoad();
    const result = runRecoveryModel(makeDay(recovery, load), CTX);

    const positiveStates: string[] = ['NORMAL', 'ENHANCED'];
    expect(positiveStates).toContain(result.signals.autonomicBalance);
  });

  it('model is fully deterministic — identical inputs always produce identical scores', () => {
    const recovery = makeRecovery({
      hrvDeltaFromBaseline: -8,
      sleepEfficiencyPercent: 78,
      sleepDebtMin: 45,
      subjectiveWellnessIndex: 6.0,
    });
    const load = makeLoad({ acwr: 1.25 });
    const day = makeDay(recovery, load);

    const r1 = runRecoveryModel(day, CTX);
    const r2 = runRecoveryModel(day, CTX);

    expect(r1.recoveryState.readinessScore).toBe(r2.recoveryState.readinessScore);
    expect(r1.recoveryState.readinessCategory).toBe(r2.recoveryState.readinessCategory);
    expect(r1.recommendation.type).toBe(r2.recommendation.type);
    expect(r1.recoveryState.confidence).toBe(r2.recoveryState.confidence);
  });

  it('readiness score is always in [0, 100] when not null', () => {
    const extremeCases: RecoveryFeatureSet[] = [
      makeRecovery({
        hrvDeltaFromBaseline: -50,
        rhrDeltaFromBaseline: 15,
        sleepEfficiencyPercent: 20,
        sleepDebtMin: 600,
        subjectiveWellnessIndex: 1.0,
      }),
      makeRecovery({
        hrvDeltaFromBaseline: 30,
        rhrDeltaFromBaseline: -8,
        sleepEfficiencyPercent: 95,
        sleepDebtMin: -120,
        subjectiveWellnessIndex: 10,
      }),
    ];

    for (const recovery of extremeCases) {
      const result = runRecoveryModel(makeDay(recovery, makeLoad()), CTX);
      if (result.recoveryState.readinessScore !== null) {
        expect(result.recoveryState.readinessScore).toBeGreaterThanOrEqual(0);
        expect(result.recoveryState.readinessScore).toBeLessThanOrEqual(100);
      }
    }
  });

  it('confidence is always in [0, 1]', () => {
    const result = runRecoveryModel(
      makeDay(
        makeRecovery({
          hrvDeltaFromBaseline: 5,
          sleepEfficiencyPercent: 80,
          subjectiveWellnessIndex: 7.0,
        }),
        makeLoad(),
      ),
      CTX,
    );
    expect(result.recoveryState.confidence).toBeGreaterThanOrEqual(0);
    expect(result.recoveryState.confidence).toBeLessThanOrEqual(1);
  });
});
