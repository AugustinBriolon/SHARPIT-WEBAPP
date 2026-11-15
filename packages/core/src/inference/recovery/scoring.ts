/**
 * RECOVERY MODEL v1 — Dimension Scoring
 *
 * Pure functions implementing the algorithmic specification from
 * RECOVERY_MODEL.md §5 (Algorithm Specification).
 *
 * Each function is deterministic and side-effect free.
 * All thresholds and multipliers are sourced from the specification
 * with the corresponding evidence level and citation.
 *
 * Function contracts:
 *   - Returns null when insufficient data (PENDING is treated as null)
 *   - Returns 0–100 for valid scores (integer after synthesis, float during computation)
 *   - Clamps output to [0, 100]
 */

import type { RecoveryFeatureSet, LoadFeatureSet } from '../../features/types';
import { isSet } from '@sharpit/shared/value';
import type { DimensionScore, ScoredDimensions } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 1 — Autonomic Score (HRV + RHR)
// RECOVERY_MODEL.md §5.1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map HRV delta from 14-day personal baseline to AutonomicRaw (0–100).
 *
 * Thresholds (Plews et al. 2013, Buchheit 2014):
 *   ±5% = noise. Meaningful suppression begins at -10–15%.
 */
const HRV_DELTA_KNOTS: ReadonlyArray<readonly [pct: number, raw: number]> = [
  [-27.5, 10],
  [-20, 25],
  [-12.5, 40],
  [-7.5, 55],
  [-2.5, 70],
  [2.5, 80],
  [7.5, 90],
  [10, 100],
];

/**
 * Linear between the bands' centres: as steps, −4.9 % scored 70 and −5.1 % scored 55,
 * so a fifth of a percent moved readiness by five points.
 */
function mapHrvDeltaToAutonomicRaw(pct: number): number {
  const [first] = HRV_DELTA_KNOTS;
  const last = HRV_DELTA_KNOTS[HRV_DELTA_KNOTS.length - 1];
  if (pct <= first[0]) {
    return first[1];
  }
  if (pct >= last[0]) {
    return last[1];
  }
  const upper = HRV_DELTA_KNOTS.findIndex(([knot]) => pct < knot);
  const [x0, y0] = HRV_DELTA_KNOTS[upper - 1];
  const [x1, y1] = HRV_DELTA_KNOTS[upper];
  return y0 + ((pct - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * One standard deviation of the athlete's own window reads as this many percent on
 * the bands above, which were drawn for a typical day-to-day variation.
 */
const HRV_PERCENT_PER_STANDARD_DEVIATION = 7.5;

/**
 * Fallback when HRV delta is unavailable: use absolute RMSSD with
 * population-level norms (less personalized → lower confidence).
 * Only used when baseline cannot be established.
 */
function mapHrvAbsoluteToAutonomicRaw(rmssd: number): number {
  if (rmssd >= 60) {
    return 80;
  } // above population norm for athletes
  if (rmssd >= 50) {
    return 70;
  } // near population norm
  if (rmssd >= 40) {
    return 55;
  } // below norm
  if (rmssd >= 30) {
    return 40;
  } // significantly below
  return 25; // very low — likely suppressed
}

/**
 * RHR modifier applied to AutonomicRaw.
 * Thresholds: Noakes 1991, Friel 2009 (practitioner consensus, Level 5).
 */
function rhrModifier(rhrDelta: number | null): number {
  if (rhrDelta === undefined || rhrDelta === null) {
    return 1.0;
  } // no data — no change
  if (rhrDelta > 7) {
    return 0.65;
  }
  if (rhrDelta > 5) {
    return 0.75;
  }
  if (rhrDelta > 3) {
    return 0.85;
  }
  if (rhrDelta > -2) {
    return 1.0;
  }
  if (rhrDelta > -5) {
    return 1.05;
  }
  return 1.1;
}

/**
 * Compute the Autonomic Dimension Score from HRV and RHR features.
 * Returns null when no HRV data is available.
 */
export function scoreAutonomic(features: RecoveryFeatureSet): DimensionScore {
  const { hrvDeltaFromBaseline, hrvZScore, hrvAbsolute, rhrDeltaFromBaseline } = features;

  if (isSet(hrvDeltaFromBaseline)) {
    // Primary path: against the athlete's own baseline, in their own variability when known
    const raw = mapHrvDeltaToAutonomicRaw(
      isSet(hrvZScore) ? hrvZScore * HRV_PERCENT_PER_STANDARD_DEVIATION : hrvDeltaFromBaseline,
    );
    const modifier = rhrModifier(rhrDeltaFromBaseline);
    const score = clamp(raw * modifier, 0, 100);
    return {
      score,
      available: true,
      qualityFactor: 0.7, // MEASURED_OPTICAL (Garmin overnight HRV)
    };
  }

  if (isSet(hrvAbsolute)) {
    // Fallback: population-level norms (less reliable — no personal baseline)
    const raw = mapHrvAbsoluteToAutonomicRaw(hrvAbsolute);
    const modifier = rhrModifier(rhrDeltaFromBaseline);
    const score = clamp(raw * modifier, 0, 100);
    return {
      score,
      available: true,
      qualityFactor: 0.4, // low quality — no baseline
    };
  }

  // No HRV data at all
  return { score: null, available: false, qualityFactor: 0.0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 2 — Sleep Score
// RECOVERY_MODEL.md §5.2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map restorative sleep ratio (deep + REM) / total × 100 to a raw score.
 * Norme adulte typique pour le ratio restaurateur : 40–55 %.
 */
export function mapRestorativeSleepRatioToRaw(ratioPercent: number): number {
  // Legacy mapping (used by scientific-validation + unit tests):
  // >= 55% → 100 | >= 45% → 85 | >= 40% → 70 | >= 32% → 50 | >= 25% → 35 | < 25% → 20
  if (ratioPercent >= 55) {
    return 100;
  }
  if (ratioPercent >= 45) {
    return 85;
  }
  if (ratioPercent >= 40) {
    return 70;
  }
  if (ratioPercent >= 32) {
    return 50;
  }
  if (ratioPercent >= 25) {
    return 35;
  }
  return 20;
}

/**
 * Debt modifier based on 7-day cumulative sleep debt.
 * Van Dongen et al. 2003: 6h/night × 14 days ≈ 24h total deprivation (Level 2).
 */
const SLEEP_DEBT_MODIFIERS: Array<{ maxMin: number; modifier: number }> = [
  { maxMin: 30, modifier: 1.0 },
  { maxMin: 90, modifier: 0.95 },
  { maxMin: 150, modifier: 0.9 },
  { maxMin: 210, modifier: 0.85 },
  { maxMin: 300, modifier: 0.75 },
  { maxMin: 420, modifier: 0.65 },
];

export function sleepDebtModifier(debtMinutes: number | null): number {
  if (!isSet(debtMinutes)) {
    return 1.0;
  }
  const tier = SLEEP_DEBT_MODIFIERS.find((entry) => debtMinutes <= entry.maxMin);
  return tier?.modifier ?? 0.55;
}

/**
 * Overnight sleep-stress modifier (Garmin avg stress during sleep, 0–100).
 * Elevated nocturnal stress indicates incomplete parasympathetic recovery.
 */
export function sleepStressModifier(avgStressDuringSleep: number | null): number {
  if (avgStressDuringSleep === undefined || avgStressDuringSleep === null) {
    return 1.0;
  }
  if (avgStressDuringSleep > 50) {
    return 0.85;
  }
  if (avgStressDuringSleep > 35) {
    return 0.92;
  }
  if (avgStressDuringSleep > 25) {
    return 0.97;
  }
  return 1.0;
}

/**
 * Score last night's duration against the target: the target reached is 100, half of
 * it 20, linear between. Duration is the best-supported sleep measure a wearable gives.
 */
export function mapSleepDurationRatioToRaw(ratio: number): number {
  return clamp(20 + ((ratio - 0.5) / 0.5) * 80, 20, 100);
}

/**
 * Stages and duration each count for half when both are known. A night without
 * stages is scored on its duration alone, at a lower quality, rather than not at all.
 */
function sleepBaseScore(features: RecoveryFeatureSet): { base: number; quality: number } | null {
  const stages = isSet(features.sleepEfficiencyPercent)
    ? mapRestorativeSleepRatioToRaw(features.sleepEfficiencyPercent)
    : null;
  const duration = isSet(features.sleepDurationRatio)
    ? mapSleepDurationRatioToRaw(features.sleepDurationRatio)
    : null;

  if (stages !== null && duration !== null) {
    return { base: (stages + duration) / 2, quality: 0.65 };
  }
  if (stages !== null) {
    return { base: stages, quality: 0.65 };
  }
  if (duration !== null) {
    return { base: duration, quality: 0.5 };
  }
  return null;
}

export function scoreSleep(features: RecoveryFeatureSet): DimensionScore {
  const night = sleepBaseScore(features);
  if (!night) {
    return { score: null, available: false, qualityFactor: 0.0 };
  }

  const debtModifier = sleepDebtModifier(features.sleepDebtMin);
  const stressModifier = sleepStressModifier(features.avgStressDuringSleep);
  const score = clamp(night.base * debtModifier * stressModifier, 0, 100);

  return { score, available: true, qualityFactor: night.quality };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 3 — Subjective Score
// RECOVERY_MODEL.md §5.3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map composite wellness index (0–10) to SubjectiveRaw.
 * Evidence: Saw et al. 2016 — subjective measures as sensitive as objective (Level 3).
 */
function mapWellnessToSubjectiveRaw(index: number): number {
  if (index >= 8.0) {
    return 100;
  }
  if (index >= 6.5) {
    return 80;
  }
  if (index >= 5.0) {
    return 60;
  }
  if (index >= 3.5) {
    return 40;
  }
  if (index >= 2.0) {
    return 20;
  }
  return 10;
}

/**
 * RPE modifier: when perceived effort > expected, recovery is likely incomplete.
 * Foster et al. 2001 — RPE drift as early overreaching indicator (Level 3-5).
 */
function rpeVsTargetModifier(rpeVsTarget: number | null): number {
  if (rpeVsTarget === undefined || rpeVsTarget === null) {
    return 1.0;
  }
  if (rpeVsTarget < -1.5) {
    return 1.05;
  }
  if (rpeVsTarget <= 1.5) {
    return 1.0;
  }
  if (rpeVsTarget <= 3.0) {
    return 0.9;
  }
  return 0.75;
}

export function scoreSubjective(features: RecoveryFeatureSet): DimensionScore {
  const { subjectiveWellnessIndex, rpeVsTargetZone } = features;

  if (subjectiveWellnessIndex === undefined || subjectiveWellnessIndex === null) {
    return { score: null, available: false, qualityFactor: 0.0 };
  }

  const raw = mapWellnessToSubjectiveRaw(subjectiveWellnessIndex);
  const modifier = rpeVsTargetModifier(rpeVsTargetZone);
  const score = clamp(raw * modifier, 0, 100);

  return {
    score,
    available: true,
    qualityFactor: 0.8, // MANUAL athlete self-report
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension 4 — Load Context Score
// RECOVERY_MODEL.md §5.4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map ACWR to LoadContextRaw.
 * Evidence: Gabbett 2016, Hulin et al. 2017 (Level 1-3).
 * The "sweet spot" is 0.8–1.3 ACWR where recovery is achievable.
 */
const ACWR_LOAD_CONTEXT: Array<{ max: number; score: number }> = [
  { max: 0.8, score: 70 },
  { max: 1.0, score: 85 },
  { max: 1.3, score: 100 },
  { max: 1.5, score: 65 },
  { max: 1.8, score: 40 },
  { max: 2.0, score: 20 },
];

function mapAcwrToLoadContextRaw(acwr: number | null): number {
  if (!isSet(acwr)) {
    return 75;
  }
  const tier = ACWR_LOAD_CONTEXT.find((entry) => acwr <= entry.max);
  return tier?.score ?? 5;
}

/**
 * Monotony modifier.
 * Foster et al. 1998 — high monotony impairs recovery efficiency (Level 5).
 */
function monotonyModifier(monotony: number | null): number {
  if (monotony === undefined || monotony === null) {
    return 1.0;
  }
  if (monotony < 1.5) {
    return 1.05;
  }
  if (monotony <= 2.0) {
    return 1.0;
  }
  if (monotony <= 2.5) {
    return 0.9;
  }
  return 0.8;
}

export function scoreLoadContext(load: LoadFeatureSet | 'PENDING'): DimensionScore {
  if (load === 'PENDING') {
    // No load data — use neutral score with low confidence
    return { score: 75, available: true, qualityFactor: 0.4 };
  }

  const raw = mapAcwrToLoadContextRaw(load.acwr);
  const modifier = monotonyModifier(load.loadMonotony);
  const score = clamp(raw * modifier, 0, 100);

  return {
    score,
    available: true,
    qualityFactor: 0.85, // derived from feature extraction — reliable
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthesis — Weighted Composite
// RECOVERY_MODEL.md §5.5
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default dimension weights (evidence-based, from RECOVERY_MODEL.md Table 5.5).
 * Total = 1.00
 */
const DEFAULT_WEIGHTS = {
  autonomic: 0.35,
  sleep: 0.3,
  subjective: 0.25,
  loadContext: 0.1,
} as const;

type DimensionKey = keyof typeof DEFAULT_WEIGHTS;

/**
 * Compute the weighted composite ReadinessScore from scored dimensions.
 *
 * Dynamic weight redistribution: when dimensions are PENDING, their weight
 * is redistributed proportionally to available dimensions.
 * The Load Context dimension receives NO redistribution bonus (it is
 * contextual, not a recovery measure).
 *
 * Returns null when fewer than 2 dimensions are available.
 */
export function synthesizeScore(dimensions: ScoredDimensions): {
  score: number | null;
  confidence: number;
  availableCount: number;
  redistributedWeights: Record<DimensionKey, number>;
} {
  const available = Object.entries(dimensions).filter(
    ([, dim]) =>
      (dim as DimensionScore).available &&
      (dim as DimensionScore).score !== undefined &&
      (dim as DimensionScore).score !== null,
  ) as Array<[DimensionKey, DimensionScore]>;

  const availableCount = available.length;

  if (availableCount < 2) {
    return {
      score: null,
      confidence: 0.0,
      availableCount,
      redistributedWeights: { ...DEFAULT_WEIGHTS },
    };
  }

  // Compute total available weight (not counting PENDING dimensions)
  const totalAvailableWeight = available.reduce((sum, [key]) => sum + DEFAULT_WEIGHTS[key], 0);

  // Redistribute weights proportionally (no bonus to loadContext)
  const redistributedWeights: Record<DimensionKey, number> = {
    autonomic: 0,
    sleep: 0,
    subjective: 0,
    loadContext: 0,
  };

  for (const [key] of available) {
    redistributedWeights[key] = DEFAULT_WEIGHTS[key] / totalAvailableWeight;
  }

  // Weighted sum
  const rawScore = available.reduce((sum, [key, dim]) => {
    return sum + (dim.score ?? 0) * redistributedWeights[key];
  }, 0);

  const score = Math.round(clamp(rawScore, 0, 100));

  // Measurement quality factor
  const qualityFactor = available.reduce((sum, [key, dim]) => {
    return sum + dim.qualityFactor * redistributedWeights[key];
  }, 0);

  return { score, confidence: qualityFactor, availableCount, redistributedWeights };
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence
// RECOVERY_MODEL.md §8
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Baseline maturity factor — HRV delta requires an established baseline.
 * Simplification for v1: if delta from baseline is available → adequate baseline.
 */
export function baselineMaturityFactor(features: RecoveryFeatureSet): number {
  if (isSet(features.hrvDeltaFromBaseline)) {
    return 0.8; // adequate baseline (14-day minimum implied by the extractor)
  }
  return 0.4; // no baseline established
}

/**
 * Signal consistency factor — detects objective/subjective dissonance.
 * Per RECOVERY_MODEL.md §8.3 and §9.1.
 */
export function signalConsistencyFactor(
  autonomicScore: number | null,
  sleepScore: number | null,
  subjectiveScore: number | null,
): { factor: number; dissonanceDetected: boolean } {
  if (
    autonomicScore === undefined ||
    autonomicScore === null ||
    subjectiveScore === undefined ||
    subjectiveScore === null
  ) {
    return { factor: 1.0, dissonanceDetected: false };
  }

  // Objective = average of available objective markers
  const objectiveScores = [autonomicScore, sleepScore].filter((s): s is number => isSet(s));
  if (objectiveScores.length === 0) {
    return { factor: 1.0, dissonanceDetected: false };
  }

  const objectiveAvg = objectiveScores.reduce((a, b) => a + b, 0) / objectiveScores.length;
  const diff = Math.abs(objectiveAvg - subjectiveScore);

  if (diff > 40) {
    return { factor: 0.7, dissonanceDetected: true };
  }
  if (diff > 20) {
    return { factor: 0.85, dissonanceDetected: true };
  }
  return { factor: 1.0, dissonanceDetected: false };
}

/**
 * Compute all four dimension scores at once.
 */
export function scoreAllDimensions(
  recovery: RecoveryFeatureSet,
  load: LoadFeatureSet | 'PENDING',
): ScoredDimensions {
  return {
    autonomic: scoreAutonomic(recovery),
    sleep: scoreSleep(recovery),
    subjective: scoreSubjective(recovery),
    loadContext: scoreLoadContext(load),
  };
}
