/**
 * FATIGUE MODEL v1 — Inference Function
 *
 * The single entry point for Fatigue Intelligence inference.
 * This function is PURE: no side effects, no database calls, no randomness.
 *
 * Pipeline:
 *   1. Score five fatigue dimensions from DayFeatures + context
 *   2. Apply dissonance bias correction if needed
 *   3. Synthesize FatigueIndex from available dimensions
 *   4. Classify FatigueLevel, FatigueType, FatigueTrajectory
 *   5. Compute signals, decision, recommendation, explanation
 *   6. Build FatigueState for Digital Twin update
 *
 * References: docs/models/FATIGUE_MODEL.md
 * Model ID: 'fatigue-v1'
 */

import type { DayFeatures } from '../../features/types';
import type {
  FatigueModelContext,
  FatigueModelOutput,
  FatigueState,
  FatigueSignals,
  FatigueDecision,
  FatigueRecommendation,
  DimensionResult,
  ScoredFatigueDimensions,
} from './types';
import type { OverreachingRisk } from '../../digital-twin/types';
import { applyEnvironmentalImpactToFatigueIndex } from '../environment/apply-impact';
import {
  scoreLoadFatigue,
  scoreNeuromuscularFatigue,
  scoreMetabolicFatigue,
  scoreCumulativeTrajectory,
  scorePsychologicalFatigue,
  synthesizeFatigueIndex,
  classifyFatigueLevel,
  classifyFatigueType,
  getDominantDimension,
  classifyTrainingCapacity,
  computeFatigueTrajectory,
  estimateTimeToFresh,
  applyDissonanceBias,
  sessionsWithCarryOver,
} from './scoring';
import type { I18nItem } from '../shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

function scoreFatigueDimensions(
  features: DayFeatures,
  context: FatigueModelContext,
): ScoredFatigueDimensions {
  const recovery = features.recovery !== 'PENDING' ? features.recovery : null;
  const sessions = sessionsWithCarryOver(features.sessions, context.priorSessions);
  const initial: ScoredFatigueDimensions = {
    load: scoreLoadFatigue(features.load),
    neuromuscular: scoreNeuromuscularFatigue(features.recovery, context.recoveryState, sessions),
    metabolic: scoreMetabolicFatigue(sessions),
    cumulative: scoreCumulativeTrajectory(
      context.consecutiveAccumulationDays,
      recovery?.sleepDebtMin ?? null,
      context.recoveryState?.dissonanceDetected ?? false,
    ),
    psychological: scorePsychologicalFatigue(features.recovery),
  };

  return applyDissonanceBias(
    initial,
    context.consecutiveAccumulationDays,
    context.recoveryState?.dissonanceDetected ?? false,
  );
}

function buildFatigueSignals(
  dims: ScoredFatigueDimensions,
  fatigueIndex: number | null,
  context: FatigueModelContext,
  trainingBlockedByCondition: boolean,
): FatigueSignals {
  const fatigueLevel = classifyFatigueLevel(fatigueIndex);
  const dominantDimension = getDominantDimension(dims);
  const trajectory = computeFatigueTrajectory(context.recentFatigueHistory);

  return {
    fatigueLevel,
    fatigueType: classifyFatigueType(dims),
    fatigueTrajectory: trajectory,
    dominantFatigueDimension: dominantDimension,
    primaryLimitingFactor: buildPrimaryLimitingFactor(dims, dominantDimension),
    functionalOverreachingRisk: computeOverreachingRisk(
      fatigueIndex,
      trajectory,
      context.recoveryState,
      context.consecutiveAccumulationDays,
    ),
    estimatedTimeToFresh: estimateTimeToFresh(dims, fatigueLevel),
    performanceImpairmentEstimate: isSet(fatigueIndex)
      ? Math.min((fatigueIndex / 100) * 0.25, 0.25)
      : 0,
    trainingCapacity: classifyTrainingCapacity(fatigueLevel, trainingBlockedByCondition),
    isAccumulating: trajectory === 'ACCUMULATING' || trajectory === 'ACCELERATING',
    consecutiveAccumulationDays: context.consecutiveAccumulationDays,
  };
}

export function runFatigueModel(
  features: DayFeatures,
  context: FatigueModelContext,
): FatigueModelOutput {
  const computedAt = new Date();
  const load = features.load !== 'PENDING' ? features.load : null;
  const condition = features.condition !== 'PENDING' ? features.condition : null;

  const dims = scoreFatigueDimensions(features, context);
  const {
    score: rawFatigueIndex,
    confidence: rawConfidence,
    dataCompleteness,
  } = synthesizeFatigueIndex(dims);

  const fatigueIndex = applyEnvironmentalImpactToFatigueIndex(
    rawFatigueIndex,
    context.environmentalImpact ?? null,
  );
  const confidence =
    rawConfidence * fatigueHistoryMaturityModifier(context.recentFatigueHistory.length);

  const signals = buildFatigueSignals(
    dims,
    fatigueIndex,
    context,
    condition?.trainingBlockedByCondition ?? false,
  );
  const decision = buildDecision(signals, dims, load);
  const recommendation = buildRecommendation(signals, decision, confidence);

  const fatigueState: FatigueState = {
    fatigueIndex,
    fatigueLevel: signals.fatigueLevel,
    fatigueType: signals.fatigueType,
    dimensions: {
      load: toDimensionResult(dims.load),
      neuromuscular: toDimensionResult(dims.neuromuscular),
      metabolic: toDimensionResult(dims.metabolic),
      cumulative: toDimensionResult(dims.cumulative),
      psychological: toDimensionResult(dims.psychological),
    },
    trajectory: signals.fatigueTrajectory,
    consecutiveAccumulationDays: context.consecutiveAccumulationDays,
    dominantDimension: signals.dominantFatigueDimension,
    primaryLimitingFactor: signals.primaryLimitingFactor,
    functionalOverreachingRisk: signals.functionalOverreachingRisk,
    estimatedTimeToFresh: signals.estimatedTimeToFresh,
    performanceImpairmentEstimate: signals.performanceImpairmentEstimate,
    trainingCapacity: signals.trainingCapacity,
    confidence,
    dataCompleteness,
    modelId: 'fatigue-v1',
    computedAt,
    trainingDayId: context.trainingDayId,
  };

  return { signals, fatigueState, decision, recommendation };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function fatigueHistoryMaturityModifier(historyDays: number): number {
  if (historyDays >= 14) {
    return 1.0;
  }
  if (historyDays >= 7) {
    return 0.8;
  }
  return 0.6;
}

function dimensionResultStatus(d: import('./types').DimensionScore): string {
  if (!d.available) {
    return 'unavailable';
  }
  if (isSet(d.score)) {
    return `score=${d.score}`;
  }
  return 'computed';
}

function toDimensionResult(d: import('./types').DimensionScore): DimensionResult {
  return {
    score: d.score,
    available: d.available,
    status: dimensionResultStatus(d),
  };
}

function isLowReadinessCategory(recoveryState: import('./types').RecoveryState | null): boolean {
  return (
    recoveryState?.readinessCategory === 'LOW' || recoveryState?.readinessCategory === 'VERY_LOW'
  );
}

function isAccumulatingTrajectory(trajectory: import('./types').FatigueTrajectory): boolean {
  return trajectory === 'ACCUMULATING' || trajectory === 'ACCELERATING';
}

function criticalOverreachingRisk(
  fatigueIndex: number,
  recoveryState: import('./types').RecoveryState | null,
  consecutiveDays: number,
): OverreachingRisk | null {
  if (fatigueIndex > 80 && isLowReadinessCategory(recoveryState) && consecutiveDays >= 5) {
    return 'CRITICAL';
  }
  return null;
}

function highOverreachingRisk(
  fatigueIndex: number,
  trajectory: import('./types').FatigueTrajectory,
  recoveryState: import('./types').RecoveryState | null,
): OverreachingRisk | null {
  if (
    fatigueIndex > 65 &&
    isAccumulatingTrajectory(trajectory) &&
    (recoveryState?.dimensions?.autonomic?.score ?? 100) < 50
  ) {
    return 'HIGH';
  }
  return null;
}

function moderateOverreachingRisk(
  fatigueIndex: number,
  trajectory: import('./types').FatigueTrajectory,
  consecutiveDays: number,
): OverreachingRisk | null {
  if (!isAccumulatingTrajectory(trajectory) || fatigueIndex <= 55) {
    return null;
  }
  return consecutiveDays >= 4 ? 'HIGH' : 'MODERATE';
}

function computeOverreachingRisk(
  fatigueIndex: number | null,
  trajectory: import('./types').FatigueTrajectory,
  recoveryState: import('./types').RecoveryState | null,
  consecutiveDays: number,
): OverreachingRisk {
  if (
    fatigueIndex === undefined ||
    fatigueIndex === null ||
    recoveryState?.illnessRisk === 'HIGH'
  ) {
    return 'LOW';
  }

  return (
    criticalOverreachingRisk(fatigueIndex, recoveryState, consecutiveDays) ??
    highOverreachingRisk(fatigueIndex, trajectory, recoveryState) ??
    moderateOverreachingRisk(fatigueIndex, trajectory, consecutiveDays) ??
    'LOW'
  );
}

function buildPrimaryLimitingFactor(
  dims: ScoredFatigueDimensions,
  dominant: import('./types').FatigueDominantDimension,
): string {
  const CODES: Record<import('./types').FatigueDominantDimension, string> = {
    LOAD: 'fatigue.primaryLimitingFactor.load',
    NEUROMUSCULAR: 'fatigue.primaryLimitingFactor.neuromuscular',
    METABOLIC: 'fatigue.primaryLimitingFactor.metabolic',
    CUMULATIVE: 'fatigue.primaryLimitingFactor.cumulative',
    PSYCHOLOGICAL: 'fatigue.primaryLimitingFactor.psychological',
  };
  return CODES[dominant] ?? 'fatigue.primaryLimitingFactor.multiple';
}

function appendFatigueTypeRationale(rationale: I18nItem[], signals: FatigueSignals): void {
  if (signals.fatigueType === 'NEUROMUSCULAR_DOMINANT' && rationale.length < 3) {
    rationale.push({ code: 'fatigue.rationale.neuromuscularDominant' });
  }
  if (signals.fatigueType === 'METABOLIC_DOMINANT' && rationale.length < 3) {
    rationale.push({ code: 'fatigue.rationale.metabolicDominant' });
  }
}

function resolveCriticalOverreachingDecision(signals: FatigueSignals): FatigueDecision {
  return {
    verdict: 'REST_WEEK',
    trainingCapacity: signals.trainingCapacity,
    rationale: [
      { code: 'fatigue.rationale.criticalOverreaching' },
      {
        code: 'fatigue.rationale.consecutiveDays',
        params: { days: signals.consecutiveAccumulationDays },
      },
    ],
  };
}

function resolveHighRiskLevelDecision(signals: FatigueSignals): FatigueDecision {
  const verdict = signals.fatigueLevel === 'OVERREACHING_RISK' ? 'REST_WEEK' : 'REDUCE';
  const rationale: I18nItem[] = [{ code: 'fatigue.rationale.loadReductionRequired' }];
  if (signals.isAccumulating) {
    rationale.push({ code: 'fatigue.rationale.stillAccumulating' });
  }
  return { verdict, trainingCapacity: signals.trainingCapacity, rationale };
}

function resolveAccumulatedDecision(signals: FatigueSignals): FatigueDecision {
  const rationale: I18nItem[] = [{ code: 'fatigue.rationale.accumulatedFatigue' }];
  if (isSet(signals.estimatedTimeToFresh)) {
    rationale.push({
      code: 'fatigue.rationale.estimatedFresh',
      params: { days: signals.estimatedTimeToFresh },
    });
  }
  return { verdict: 'REDUCE', trainingCapacity: signals.trainingCapacity, rationale };
}

function resolveFunctionalHighDecision(signals: FatigueSignals): FatigueDecision {
  if (signals.fatigueTrajectory === 'ACCUMULATING') {
    return {
      verdict: 'REDUCE',
      trainingCapacity: signals.trainingCapacity,
      rationale: [
        { code: 'fatigue.rationale.productiveState' },
        { code: 'fatigue.rationale.avoidAddingLoad' },
      ],
    };
  }
  return {
    verdict: 'MAINTAIN',
    trainingCapacity: signals.trainingCapacity,
    rationale: [{ code: 'fatigue.rationale.productiveState' }],
  };
}

import { isSet } from '@sharpit/shared/value';

function resolveFunctionalLowDecision(
  signals: FatigueSignals,
  load: import('../../features/types').LoadFeatureSet | null,
): FatigueDecision {
  const isRising = isAccumulatingTrajectory(signals.fatigueTrajectory);
  const canBuild = isSet(load?.acwr) && load.acwr < 0.8 && !isRising;
  return {
    verdict: canBuild ? 'BUILD' : 'MAINTAIN',
    trainingCapacity: signals.trainingCapacity,
    rationale: [
      {
        code: canBuild ? 'fatigue.rationale.loadBelowOptimal' : 'fatigue.rationale.maintainCurrent',
      },
    ],
  };
}

function resolveFreshDecision(
  signals: FatigueSignals,
  load: import('../../features/types').LoadFeatureSet | null,
): FatigueDecision {
  const elevatedLoad = isSet(load?.acwr) && load.acwr > 1.2;
  return {
    verdict: elevatedLoad ? 'MAINTAIN' : 'BUILD',
    trainingCapacity: signals.trainingCapacity,
    rationale: [
      {
        code: elevatedLoad ? 'fatigue.rationale.loadRatioElevated' : 'fatigue.rationale.lowFatigue',
      },
    ],
  };
}

function buildDecision(
  signals: FatigueSignals,
  dims: ScoredFatigueDimensions,
  load: import('../../features/types').LoadFeatureSet | null,
): FatigueDecision {
  if (signals.fatigueLevel === 'INSUFFICIENT_DATA') {
    return {
      verdict: 'INSUFFICIENT_DATA',
      trainingCapacity: 'FULL',
      rationale: [{ code: 'fatigue.rationale.noData' }],
    };
  }

  let decision: FatigueDecision;
  if (signals.functionalOverreachingRisk === 'CRITICAL') {
    decision = resolveCriticalOverreachingDecision(signals);
  } else if (
    signals.fatigueLevel === 'OVERREACHING_RISK' ||
    signals.fatigueLevel === 'NON_FUNCTIONAL_RISK'
  ) {
    decision = resolveHighRiskLevelDecision(signals);
  } else if (signals.fatigueLevel === 'ACCUMULATED') {
    decision = resolveAccumulatedDecision(signals);
  } else if (signals.fatigueLevel === 'FUNCTIONAL_HIGH') {
    decision = resolveFunctionalHighDecision(signals);
  } else if (signals.fatigueLevel === 'FUNCTIONAL_LOW') {
    decision = resolveFunctionalLowDecision(signals, load);
  } else {
    decision = resolveFreshDecision(signals, load);
  }

  const rationale = [...decision.rationale];
  appendFatigueTypeRationale(rationale, signals);
  return { ...decision, rationale: rationale.slice(0, 3) };
}

function buildRecommendation(
  signals: FatigueSignals,
  decision: FatigueDecision,
  confidence: number,
): FatigueRecommendation {
  const keyEvidence: I18nItem[] = [
    {
      code: 'fatigue.evidence.limitingFactor',
      params: { dimension: signals.dominantFatigueDimension },
    },
  ];
  if (isSet(signals.estimatedTimeToFresh)) {
    keyEvidence.push({
      code: 'fatigue.evidence.timeToFresh',
      params: { days: signals.estimatedTimeToFresh },
    });
  }
  if (signals.performanceImpairmentEstimate > 0.1) {
    keyEvidence.push({
      code: 'fatigue.evidence.performanceCapacity',
      params: { pct: Math.round((1 - signals.performanceImpairmentEstimate) * 100) },
    });
  }

  return {
    type: decision.verdict,
    keyEvidence: keyEvidence.slice(0, 3),
    confidence,
  };
}
