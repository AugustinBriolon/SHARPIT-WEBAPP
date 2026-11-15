/**
 * ADAPTATION MODEL v1 — Inference Function
 *
 * The single entry point for Adaptation Intelligence inference.
 * This function is PURE: no side effects, no database calls, no randomness.
 *
 * Pipeline:
 *   1. Score four adaptation dimensions from DayFeatures + context
 *   2. Synthesize AdaptationIndex from available dimensions
 *   3. Classify AdaptationStatus and AdaptationTrend
 *   4. Detect flags (plateauRisk, overreachingWithoutAdaptationDetected)
 *   5. Estimate adaptation peak
 *   6. Build signals
 *   7. Make decision (verdict + loadMultiplier)
 *   8. Generate recommendation
 *   9. Build AdaptationState for Digital Twin update
 *  10. Generate explanation
 *
 * References: docs/models/ADAPTATION_MODEL.md
 * Model ID: 'adaptation-v1'
 */

import type { DayFeatures } from '../../features/types';
import { applyEnvironmentalImpactToAdaptationIndex } from '../environment/apply-impact';
import type {
  AdaptationModelContext,
  AdaptationModelOutput,
  AdaptationSignals,
  AdaptationDecision,
  AdaptationRecommendation,
  ScoredAdaptationDimensions,
  DimensionScore,
} from './types';
import type { AdaptationState, DimensionResult } from '../../digital-twin/types';
import {
  scoreLoadProgression,
  scoreNeuromuscularEfficiency,
  scoreAutonomicAdaptation,
  scoreRecoveryQuality,
  synthesizeAdaptationIndex,
  classifyAdaptationStatus,
  computeAdaptationTrend,
} from './scoring';
import type { I18nItem } from '../shared/types';
import { isSet } from '@sharpit/shared/value';

function resolveAdaptationConfidence(input: {
  baseConfidence: number;
  historyLength: number;
  dataCompleteness: string;
  overreachingWithoutAdaptationDetected: boolean;
}): number {
  const historyBonus = Math.min(input.historyLength / 28, 1.0) * 0.15;
  let confidence = Math.min(input.baseConfidence + historyBonus, 1.0);
  if (input.historyLength < 7) {
    confidence = Math.min(confidence, 0.5);
  }
  if (input.dataCompleteness === 'INSUFFICIENT') {
    confidence = 0.1;
  }
  if (input.overreachingWithoutAdaptationDetected) {
    confidence = Math.min(confidence, 0.75);
  }
  return confidence;
}

export function runAdaptationModel(
  features: DayFeatures,
  context: AdaptationModelContext,
): AdaptationModelOutput {
  const computedAt = new Date();

  // ── Step 1: Score four dimensions ─────────────────────────────────────────
  const dims: ScoredAdaptationDimensions = {
    loadProgression: scoreLoadProgression(features.load),
    neuromuscularEfficiency: scoreNeuromuscularEfficiency(
      features.sessions,
      context.efficiencyTrendPercent ?? null,
    ),
    autonomicAdaptation: scoreAutonomicAdaptation(features.recovery),
    recoveryQuality: scoreRecoveryQuality(context.recoveryState, context.fatigueState),
  };

  // ── Step 2: Synthesize AdaptationIndex ────────────────────────────────────
  const {
    score: rawIndex,
    confidence: baseConfidence,
    dataCompleteness,
    availableDimensionCount,
    totalAvailableWeight,
  } = synthesizeAdaptationIndex(dims);

  const adaptationIndex = applyEnvironmentalImpactToAdaptationIndex(
    rawIndex,
    context.environmentalImpact ?? null,
  );

  const historyLength = context.recentAdaptationHistory.length;
  const overreachingWithoutAdaptationDetected = detectOverreachingWithoutAdaptation(
    context.fatigueState,
    dims.autonomicAdaptation,
    dims.recoveryQuality,
  );

  const confidence = resolveAdaptationConfidence({
    baseConfidence,
    historyLength,
    dataCompleteness,
    overreachingWithoutAdaptationDetected,
  });

  const adaptationStatus = isSet(adaptationIndex)
    ? classifyAdaptationStatus(adaptationIndex)
    : 'INSUFFICIENT_DATA';

  const adaptationTrend = computeAdaptationTrend(context.recentAdaptationHistory);

  // ── Step 4: Detect flags ──────────────────────────────────────────────────
  const plateauRisk = detectPlateauRisk(
    dims.loadProgression,
    adaptationStatus,
    context.recentAdaptationHistory,
  );

  // ── Step 5: Estimate adaptation peak ─────────────────────────────────────
  const estimatedAdaptationPeak = estimateAdaptationPeak(adaptationStatus, adaptationTrend);

  // ── Step 6: Limiting factor ───────────────────────────────────────────────
  const limitingFactor = findLimitingFactor(dims);

  // ── Step 7: Build signals ─────────────────────────────────────────────────
  const signals: AdaptationSignals = {
    adaptationIndex,
    adaptationStatus,
    adaptationTrend,
    dimensionScores: {
      loadProgression: dims.loadProgression.score,
      neuromuscularEfficiency: dims.neuromuscularEfficiency.score,
      autonomicAdaptation: dims.autonomicAdaptation.score,
      recoveryQuality: dims.recoveryQuality.score,
    },
    plateauRisk,
    overreachingWithoutAdaptationDetected,
    availableDimensionCount,
    totalAvailableWeight,
    confidence,
    historyLength,
  };

  // ── Step 8: Build decision ────────────────────────────────────────────────
  const decision = buildDecision({
    status: adaptationStatus,
    trainingCapacity: context.fatigueState?.trainingCapacity ?? null,
    plateauRisk,
    overreaching: overreachingWithoutAdaptationDetected,
    dims,
  });

  // ── Step 9: Build recommendation ─────────────────────────────────────────
  const recommendation = buildRecommendation(decision, signals);

  // ── Step 10: Build AdaptationState ────────────────────────────────────────
  const adaptationState: AdaptationState = {
    adaptationIndex,
    adaptationStatus,
    adaptationTrend,
    dimensions: {
      loadProgression: toDimensionResult(dims.loadProgression),
      neuromuscularEfficiency: toDimensionResult(dims.neuromuscularEfficiency),
      autonomicAdaptation: toDimensionResult(dims.autonomicAdaptation),
      recoveryQuality: toDimensionResult(dims.recoveryQuality),
    },
    limitingFactor,
    estimatedAdaptationPeak,
    plateauRisk,
    overreachingWithoutAdaptationDetected,
    confidence,
    dataCompleteness,
    modelId: 'adaptation-v1',
    computedAt,
    trainingDayId: context.trainingDayId,
  };

  return { signals, adaptationState, decision, recommendation };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function dimensionStatus(d: DimensionScore): string {
  if (!d.available) {
    return 'unavailable';
  }
  if (isSet(d.score)) {
    return `score=${d.score}`;
  }
  return 'computed';
}

function toDimensionResult(d: DimensionScore): DimensionResult {
  return {
    score: d.score,
    available: d.available,
    status: dimensionStatus(d),
  };
}

function findLimitingFactor(dims: ScoredAdaptationDimensions): AdaptationState['limitingFactor'] {
  const candidates = [
    { key: 'loadProgression' as const, score: dims.loadProgression.score },
    { key: 'neuromuscularEfficiency' as const, score: dims.neuromuscularEfficiency.score },
    { key: 'autonomicAdaptation' as const, score: dims.autonomicAdaptation.score },
    { key: 'recoveryQuality' as const, score: dims.recoveryQuality.score },
  ].filter((c) => isSet(c.score)) as Array<{
    key: keyof ScoredAdaptationDimensions;
    score: number;
  }>;

  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((min, c) => (c.score < min.score ? c : min)).key;
}

function detectPlateauRisk(
  loadDim: DimensionScore,
  status: AdaptationState['adaptationStatus'],
  history: readonly number[],
): boolean {
  if (history.length < 14) {
    return false;
  }
  if (status !== 'PLATEAUING') {
    return false;
  }
  if (!loadDim.available || (loadDim.score ?? 0) <= 60) {
    return false;
  }

  const last14 = history.slice(0, 14);
  const minVal = Math.min(...last14);
  const maxVal = Math.max(...last14);
  return maxVal - minVal < 3;
}

function detectOverreachingWithoutAdaptation(
  fatigueState: import('../../digital-twin/types').FatigueState | null,
  autonomic: DimensionScore,
  recoveryQ: DimensionScore,
): boolean {
  if (!isSet(fatigueState)) {
    return false;
  }
  const { fatigueIndex } = fatigueState;
  if (!isSet(fatigueIndex) || fatigueIndex <= 70) {
    return false;
  }
  return (autonomic.score ?? 100) < 40 && (recoveryQ.score ?? 100) < 40;
}

function estimateAdaptationPeak(
  status: AdaptationState['adaptationStatus'],
  trend: AdaptationState['adaptationTrend'],
): number | null {
  if (status === 'POSITIVELY_ADAPTING') {
    return trend === 'IMPROVING' ? 7 : 14;
  }
  return null;
}

type BuildAdaptationDecisionInput = {
  status: AdaptationState['adaptationStatus'];
  trainingCapacity: import('../../digital-twin/types').TrainingCapacity | null;
  plateauRisk: boolean;
  overreaching: boolean;
  dims: ScoredAdaptationDimensions;
};

function plateauDecision(dims: ScoredAdaptationDimensions): AdaptationDecision {
  const rationale: I18nItem[] = [{ code: 'adaptation.rationale.stalled' }];
  if (dims.loadProgression.available) {
    rationale.push({ code: 'adaptation.rationale.loadProgressionLow' });
  }
  return { verdict: 'INCREASE_LOAD', loadMultiplier: 1.08, rationale };
}

function adaptationDecisionForStatus(
  input: BuildAdaptationDecisionInput,
): AdaptationDecision | null {
  const { status, trainingCapacity, plateauRisk, dims } = input;

  if (status === 'POSITIVELY_ADAPTING') {
    return trainingCapacity === 'FULL'
      ? {
          verdict: 'SUSTAIN',
          loadMultiplier: 1.0,
          rationale: [{ code: 'adaptation.rationale.supercompensation' }],
        }
      : {
          verdict: 'RECOVERY_PRIORITY',
          loadMultiplier: 0.7,
          rationale: [{ code: 'adaptation.rationale.restrictedCapacity' }],
        };
  }

  if (status === 'MAINTAINING') {
    return plateauRisk
      ? {
          verdict: 'INCREASE_LOAD',
          loadMultiplier: 1.07,
          rationale: [{ code: 'adaptation.rationale.plateauRisk' }],
        }
      : {
          verdict: 'SUSTAIN',
          loadMultiplier: 1.0,
          rationale: [{ code: 'adaptation.rationale.stableLoad' }],
        };
  }

  if (status === 'PLATEAUING') {
    return plateauDecision(dims);
  }

  if (status === 'MALADAPTING') {
    return {
      verdict: 'REDUCE_LOAD',
      loadMultiplier: 0.85,
      rationale: [{ code: 'adaptation.rationale.maladaptation' }],
    };
  }

  if (status === 'DETRAINING') {
    return {
      verdict: 'INCREASE_LOAD',
      loadMultiplier: 1.08,
      rationale: [{ code: 'adaptation.rationale.detraining' }],
    };
  }

  return null;
}

function buildDecision(input: BuildAdaptationDecisionInput): AdaptationDecision {
  if (input.status === 'INSUFFICIENT_DATA') {
    return {
      verdict: 'INSUFFICIENT_DATA',
      loadMultiplier: 1.0,
      rationale: [{ code: 'adaptation.rationale.noData' }],
    };
  }

  if (input.overreaching) {
    return {
      verdict: 'REDUCE_LOAD',
      loadMultiplier: 0.8,
      rationale: [
        { code: 'adaptation.rationale.overreachingDetected' },
        { code: 'adaptation.rationale.autonomicSuppressed' },
        { code: 'adaptation.rationale.immediateReduction' },
      ],
    };
  }

  const decision = adaptationDecisionForStatus(input);
  if (decision) {
    return { ...decision, rationale: decision.rationale.slice(0, 3) };
  }

  return {
    verdict: 'INCREASE_LOAD',
    loadMultiplier: 1.08,
    rationale: [{ code: 'adaptation.rationale.detraining' }],
  };
}

function buildRecommendation(
  decision: AdaptationDecision,
  signals: AdaptationSignals,
): AdaptationRecommendation {
  const keyEvidence: I18nItem[] = [];
  if (isSet(signals.adaptationIndex)) {
    keyEvidence.push({
      code: 'adaptation.evidence.index',
      params: { index: signals.adaptationIndex },
    });
  }
  if (signals.overreachingWithoutAdaptationDetected) {
    keyEvidence.push({ code: 'adaptation.evidence.overreachingPattern' });
  } else if (signals.plateauRisk) {
    keyEvidence.push({ code: 'adaptation.evidence.plateauRisk' });
  }
  if (signals.historyLength > 0) {
    keyEvidence.push({
      code: 'adaptation.evidence.trend',
      params: { trend: signals.adaptationTrend, days: signals.historyLength },
    });
  }

  return {
    type: decision.verdict,
    keyEvidence: keyEvidence.slice(0, 3),
  };
}
