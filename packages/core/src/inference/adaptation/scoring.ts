/**
 * ADAPTATION MODEL v1 — Scoring Functions
 *
 * Pure functions that score each adaptation dimension.
 * No side effects, no I/O.
 *
 * References: docs/models/ADAPTATION_MODEL.md §4.1–4.4
 */

import type {
  AdaptationStatus,
  AdaptationTrend,
  DataCompleteness,
  FatigueState,
  RecoveryState,
} from '../../digital-twin/types';
import type { LoadFeatureSet, RecoveryFeatureSet, SessionFeatureSet } from '../../features/types';
import type { DimensionScore, ScoredAdaptationDimensions } from './types';

// Dimension weights (must sum to 1.0)
const WEIGHTS = {
  loadProgression: 0.3,
  neuromuscularEfficiency: 0.25,
  autonomicAdaptation: 0.25,
  recoveryQuality: 0.2,
} as const;

function scoreFromRhrDeltaOnly(rhrDeltaFromBaseline: number): number {
  if (rhrDeltaFromBaseline < -2) {
    return 65;
  }
  if (rhrDeltaFromBaseline > 2) {
    return 35;
  }
  return 50;
}

function scoreFromCapacityOnly(capacity: FatigueState['trainingCapacity']): number {
  if (capacity === 'FULL') {
    return 65;
  }
  if (capacity === 'REDUCED') {
    return 50;
  }
  return 30;
}

function classifyDataCompleteness(availableDimensionCount: number): DataCompleteness {
  if (availableDimensionCount === 4) {
    return 'FULL';
  }
  if (availableDimensionCount >= 2) {
    return 'PARTIAL';
  }
  if (availableDimensionCount === 1) {
    return 'SPARSE';
  }
  return 'INSUFFICIENT';
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual dimension scorers
// ─────────────────────────────────────────────────────────────────────────────

function scoreDetrainingLoad(chronicLoad: number): DimensionScore | null {
  if (chronicLoad >= 20) {
    return null;
  }
  return {
    score: Math.round(lerp(chronicLoad, [0, 20], [0, 20])),
    available: true,
    reason: 'detraining territory (chronicLoad < 20)',
  };
}

function scoreExcessiveAcwr(acwr: number | null): DimensionScore | null {
  if (acwr === undefined || acwr === null || acwr <= 1.5) {
    return null;
  }
  return {
    score: Math.round(lerp(acwr, [1.5, 2.5], [30, 0])),
    available: true,
    reason: 'excessive ACWR — no adaptive benefit',
  };
}

import { isSet } from '@sharpit/shared/value';

function isProgressiveOverloadCandidate(
  acuteChronicLoadTrend: number | null,
  acwr: number | null,
): acuteChronicLoadTrend is number {
  return (
    isSet(acuteChronicLoadTrend) &&
    acuteChronicLoadTrend > 0.02 &&
    isSet(acwr) &&
    acwr >= 0.8 &&
    acwr <= 1.3
  );
}

function scoreProgressiveOverload(
  acuteChronicLoadTrend: number | null,
  acwr: number | null,
): DimensionScore | null {
  if (!isProgressiveOverloadCandidate(acuteChronicLoadTrend, acwr) || !isSet(acwr)) {
    return null;
  }

  const trendBonus = Math.min((acuteChronicLoadTrend - 0.02) / 0.08, 1.0) * 25;
  const acwrBonus = acwr >= 0.95 && acwr <= 1.15 ? 5 : 0;
  return {
    score: Math.round(Math.min(75 + trendBonus + acwrBonus, 100)),
    available: true,
    reason: 'progressive overload in optimal zone',
  };
}

function scoreMaintainingLoad(
  acuteChronicLoadTrend: number | null,
  acwr: number | null,
): DimensionScore | null {
  if (acwr === undefined || acwr === null || acwr < 0.7 || acwr > 1.3) {
    return null;
  }
  const trend = acuteChronicLoadTrend ?? 0;
  const score = trend >= 0 ? 60 : 50 + (trend / -0.02) * -10;
  return {
    score: Math.round(Math.max(45, Math.min(70, score))),
    available: true,
    reason: 'maintaining load',
  };
}

function scoreDecliningLoad(
  acuteChronicLoadTrend: number | null,
  acwr: number | null,
): DimensionScore | null {
  if (
    acuteChronicLoadTrend === undefined ||
    acuteChronicLoadTrend === null ||
    acuteChronicLoadTrend >= -0.02
  ) {
    return null;
  }
  if (isSet(acwr) && acwr >= 0.8) {
    return null;
  }
  const declineScore = Math.max(5, 30 + (acuteChronicLoadTrend / -0.02) * 5);
  return {
    score: Math.round(Math.min(30, declineScore)),
    available: true,
    reason: 'load declining',
  };
}

export function scoreLoadProgression(load: LoadFeatureSet | 'PENDING'): DimensionScore {
  if (load === 'PENDING') {
    return { score: null, available: false, reason: 'load features pending' };
  }

  const { acwr, acuteChronicLoadTrend, chronicLoad } = load;
  const strategies = [
    () => scoreDetrainingLoad(chronicLoad),
    () => scoreExcessiveAcwr(acwr),
    () => scoreProgressiveOverload(acuteChronicLoadTrend, acwr),
    () => scoreMaintainingLoad(acuteChronicLoadTrend, acwr),
    () => scoreDecliningLoad(acuteChronicLoadTrend, acwr),
  ];

  for (const strategy of strategies) {
    const result = strategy();
    if (result) {
      return result;
    }
  }

  return { score: 40, available: true, reason: 'default — insufficient trend signal' };
}

export function scoreNeuromuscularEfficiency(
  sessions: readonly SessionFeatureSet[],
): DimensionScore {
  const eligible = sessions.filter((s) => isSet(s.hrDriftPercent));
  if (eligible.length === 0) {
    return { score: null, available: false, reason: 'no sessions with hrDriftPercent' };
  }

  const meanDrift =
    eligible.reduce((sum, s) => sum + (s.hrDriftPercent as number), 0) / eligible.length;
  const meanIF =
    sessions.filter((s) => isSet(s.intensityFactor)).length > 0
      ? sessions
          .filter((s) => isSet(s.intensityFactor))
          .reduce((sum, s) => sum + (s.intensityFactor as number), 0) /
        sessions.filter((s) => isSet(s.intensityFactor)).length
      : null;

  let base: number;
  if (meanDrift < 3) {
    base = lerp(meanDrift, [0, 3], [100, 80]);
  } else if (meanDrift <= 8) {
    base = lerp(meanDrift, [3, 8], [80, 50]);
  } else if (meanDrift <= 10) {
    base = lerp(meanDrift, [8, 10], [50, 40]);
  } else {
    base = Math.max(0, 40 - (meanDrift - 10) * 3);
  }

  const ifBonus = isSet(meanIF) && meanIF > 0.85 ? 10 : 0;

  return {
    score: Math.round(Math.min(100, base + ifBonus)),
    available: true,
    reason: `meanDrift=${meanDrift.toFixed(1)}%`,
  };
}

function scoreAutonomicFromBothSignals(
  hrvDeltaFromBaseline: number,
  rhrDeltaFromBaseline: number,
): number {
  if (hrvDeltaFromBaseline > 5 && rhrDeltaFromBaseline < -2) {
    const hrvBonus = Math.min((hrvDeltaFromBaseline - 5) / 10, 1.0) * 20;
    return Math.min(80 + hrvBonus, 100);
  }
  if (hrvDeltaFromBaseline >= -5 && hrvDeltaFromBaseline <= 5) {
    return lerp(hrvDeltaFromBaseline, [-5, 5], [50, 70]);
  }
  if (hrvDeltaFromBaseline < -10) {
    return Math.max(0, 30 + (hrvDeltaFromBaseline + 10) * 2);
  }
  // Between the cases above the score fell to 40 on both sides: an HRV up 8 % with a
  // flat resting pulse read worse than an HRV unchanged.
  return hrvDeltaFromBaseline > 5 ? 70 : lerp(hrvDeltaFromBaseline, [-10, -5], [30, 50]);
}

function scoreAutonomicFromHrvOnly(hrvDeltaFromBaseline: number): number {
  if (hrvDeltaFromBaseline > 5) {
    return 70;
  }
  if (hrvDeltaFromBaseline >= -5) {
    return 50;
  }
  return Math.max(10, 30 + (hrvDeltaFromBaseline + 10) * 2);
}

function resolveAutonomicScore(
  hrvDeltaFromBaseline: number | null,
  rhrDeltaFromBaseline: number | null,
): { score: number; partial: boolean } {
  if (isSet(hrvDeltaFromBaseline) && isSet(rhrDeltaFromBaseline)) {
    return {
      score: scoreAutonomicFromBothSignals(hrvDeltaFromBaseline, rhrDeltaFromBaseline),
      partial: false,
    };
  }
  if (isSet(hrvDeltaFromBaseline)) {
    return { score: scoreAutonomicFromHrvOnly(hrvDeltaFromBaseline), partial: true };
  }
  return { score: scoreFromRhrDeltaOnly(rhrDeltaFromBaseline!), partial: true };
}

export function scoreAutonomicAdaptation(recovery: RecoveryFeatureSet | 'PENDING'): DimensionScore {
  if (recovery === 'PENDING') {
    return { score: null, available: false, reason: 'recovery features pending' };
  }

  const { hrvDeltaFromBaseline, rhrDeltaFromBaseline } = recovery;
  if (
    (hrvDeltaFromBaseline === undefined || hrvDeltaFromBaseline === null) &&
    (rhrDeltaFromBaseline === undefined || rhrDeltaFromBaseline === null)
  ) {
    return { score: null, available: false, reason: 'HRV and RHR delta both unavailable' };
  }

  const { score, partial } = resolveAutonomicScore(hrvDeltaFromBaseline, rhrDeltaFromBaseline);
  const adjusted = partial ? Math.max(0, score - 20) : score;

  return {
    score: Math.round(Math.max(0, Math.min(100, adjusted))),
    available: true,
    reason: partial ? 'partial ANS data' : 'full ANS data',
  };
}

function scoreRecoveryFromReadiness(
  readiness: number,
  capacity: FatigueState['trainingCapacity'] | null,
): number {
  if (readiness >= 75 && capacity === 'FULL') {
    return lerp(readiness, [75, 100], [80, 100]);
  }
  if (readiness >= 50) {
    return lerp(readiness, [50, 75], [50, 75]);
  }
  return lerp(readiness, [0, 50], [20, 50]);
}

function baseRecoveryQualityScore(
  readiness: number | null,
  capacity: FatigueState['trainingCapacity'] | null,
): number {
  if (capacity === 'REST_ONLY') {
    return isSet(readiness) ? Math.min(30, readiness * 0.3) : 10;
  }
  if (isSet(readiness)) {
    return scoreRecoveryFromReadiness(readiness, capacity);
  }
  return scoreFromCapacityOnly(capacity!);
}

function applyAccumulationPenalty(score: number, accumulationDays: number): number {
  return accumulationDays > 7 ? Math.max(0, score - 20) : score;
}

function readRecoveryQualityInputs(
  recoveryState: RecoveryState | null,
  fatigueState: FatigueState | null,
): {
  readiness: number | null;
  capacity: FatigueState['trainingCapacity'] | null;
  accumulationDays: number;
} {
  return {
    readiness: recoveryState?.readinessScore ?? null,
    capacity: fatigueState?.trainingCapacity ?? null,
    accumulationDays: fatigueState?.consecutiveAccumulationDays ?? 0,
  };
}

export function scoreRecoveryQuality(
  recoveryState: RecoveryState | null,
  fatigueState: FatigueState | null,
): DimensionScore {
  if (
    (recoveryState === undefined || recoveryState === null) &&
    (fatigueState === undefined || fatigueState === null)
  ) {
    return {
      score: null,
      available: false,
      reason: 'no recovery or fatigue state in Digital Twin',
    };
  }

  const { readiness, capacity, accumulationDays } = readRecoveryQualityInputs(
    recoveryState,
    fatigueState,
  );
  const score = applyAccumulationPenalty(
    baseRecoveryQualityScore(readiness, capacity),
    accumulationDays,
  );

  return {
    score: Math.round(Math.max(0, Math.min(100, score))),
    available: true,
    reason: `readiness=${readiness}, capacity=${capacity}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Index synthesis
// ─────────────────────────────────────────────────────────────────────────────

export function synthesizeAdaptationIndex(dims: ScoredAdaptationDimensions): {
  score: number | null;
  confidence: number;
  dataCompleteness: DataCompleteness;
  availableDimensionCount: number;
  totalAvailableWeight: number;
} {
  const entries = [
    { key: 'loadProgression' as const, weight: WEIGHTS.loadProgression },
    { key: 'neuromuscularEfficiency' as const, weight: WEIGHTS.neuromuscularEfficiency },
    { key: 'autonomicAdaptation' as const, weight: WEIGHTS.autonomicAdaptation },
    { key: 'recoveryQuality' as const, weight: WEIGHTS.recoveryQuality },
  ];

  const available = entries.filter((e) => dims[e.key].available && isSet(dims[e.key].score));
  const totalAvailableWeight = available.reduce((s, e) => s + e.weight, 0);
  const availableDimensionCount = available.length;

  const dataCompleteness = classifyDataCompleteness(availableDimensionCount);

  if (totalAvailableWeight < 0.5) {
    return {
      score: null,
      confidence: 0.1,
      dataCompleteness: 'INSUFFICIENT',
      availableDimensionCount,
      totalAvailableWeight,
    };
  }

  const weightedSum = available.reduce((sum, e) => {
    const adjustedWeight = e.weight / totalAvailableWeight;
    return sum + (dims[e.key].score as number) * adjustedWeight;
  }, 0);

  const baseConfidence = availableDimensionCount / 4;

  return {
    score: Math.round(Math.max(0, Math.min(100, weightedSum))),
    confidence: baseConfidence,
    dataCompleteness,
    availableDimensionCount,
    totalAvailableWeight,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

export function classifyAdaptationStatus(index: number): AdaptationStatus {
  if (index >= 70) {
    return 'POSITIVELY_ADAPTING';
  }
  if (index >= 50) {
    return 'MAINTAINING';
  }
  if (index >= 30) {
    return 'PLATEAUING';
  }
  if (index >= 15) {
    return 'MALADAPTING';
  }
  return 'DETRAINING';
}

export function computeAdaptationTrend(recentHistory: readonly number[]): AdaptationTrend {
  if (recentHistory.length < 7) {
    return 'STABLE';
  }

  const n = recentHistory.length;
  const mean = recentHistory.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const x = n - 1 - i;
    const xMean = (n - 1) / 2;
    numerator += (x - xMean) * (recentHistory[i] - mean);
    denominator += (x - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;

  if (slope > 1.0) {
    return 'IMPROVING';
  }
  if (slope < -1.0) {
    return 'DECLINING';
  }
  return 'STABLE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `value` mapped linearly from one range onto another, clamped at both ends. The helper
 * this replaces added the raw difference to the lower bound, so a 100-to-80 slope came
 * out as 80 to 83 and nearly every adaptation score sat in a band a few points wide.
 */
function lerp(
  value: number,
  [fromMin, fromMax]: readonly [number, number],
  [toMin, toMax]: readonly [number, number],
): number {
  const share = Math.max(0, Math.min(1, (value - fromMin) / (fromMax - fromMin)));
  return toMin + share * (toMax - toMin);
}
