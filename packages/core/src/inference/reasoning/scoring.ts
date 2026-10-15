/**
 * REASONING ENGINE v1 — Scoring Functions
 *
 * Pure functions for cross-model synthesis:
 *   - mapToDirection: maps each model's state to TRAIN/EASY/REST
 *   - computeConsistency: measures inter-model agreement
 *   - synthesizeVerdict: safety-first verdict from all directions
 *   - detectConflicts: cross-model contradictions
 *   - detectOpportunities: physiological windows
 *   - buildKeyFindings: top observations ordered by severity
 *   - selectLimitingFactor: highest-severity constraint across models
 *   - buildEvidenceGraph: contribution weights per model
 *
 * All functions are PURE — no side effects, no DB calls.
 */

import type {
  RecoveryState,
  FatigueState,
  AdaptationState,
  OverallVerdict,
  PhysiologicalConsistency,
  SystemAttentionPriority,
  ReasoningFinding,
  ReasoningOpportunity,
  ReasoningConflict,
  ReasoningState,
  DataCompleteness,
} from '../../digital-twin/types';
import { isSet } from '@sharpit/shared/value';
import type { EnvironmentalImpact } from '../../environment';
import { environmentalImpactIsSignificant } from '../environment/apply-impact';
import type { PhysiologicalDirection, ModelDirections } from './types';
import { collectKeyFindings, type BuildKeyFindingsInput } from './key-findings';

// ─────────────────────────────────────────────────────────────────────────────
// Direction mapping
// ─────────────────────────────────────────────────────────────────────────────

export function mapRecoveryDirection(r: RecoveryState | null): PhysiologicalDirection {
  if (!r) {
    return 'UNKNOWN';
  }
  switch (r.readinessCategory) {
    case 'OPTIMAL':
    case 'ADEQUATE':
      return 'TRAIN';
    case 'REDUCED':
      return 'EASY';
    case 'LOW':
    case 'VERY_LOW':
      return 'REST';
    default:
      return 'UNKNOWN';
  }
}

export function mapFatigueDirection(f: FatigueState | null): PhysiologicalDirection {
  if (!f) {
    return 'UNKNOWN';
  }
  switch (f.fatigueLevel) {
    case 'FRESH':
    case 'FUNCTIONAL_LOW':
      return 'TRAIN';
    case 'FUNCTIONAL_HIGH':
    case 'ACCUMULATED':
      return 'EASY';
    case 'NON_FUNCTIONAL_RISK':
    case 'OVERREACHING_RISK':
      return 'REST';
    default:
      return 'UNKNOWN';
  }
}

export function mapAdaptationDirection(a: AdaptationState | null): PhysiologicalDirection {
  if (!a) {
    return 'UNKNOWN';
  }
  switch (a.adaptationStatus) {
    case 'POSITIVELY_ADAPTING':
    case 'MAINTAINING':
      return 'TRAIN';
    case 'PLATEAUING':
      return 'EASY';
    case 'MALADAPTING':
    case 'DETRAINING':
      return 'REST';
    default:
      return 'UNKNOWN';
  }
}

export function buildModelDirections(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ModelDirections {
  return {
    recovery: mapRecoveryDirection(r),
    fatigue: mapFatigueDirection(f),
    adaptation: mapAdaptationDirection(a),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consistency computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeConsistency(dirs: ModelDirections): {
  consistency: PhysiologicalConsistency;
  score: number;
} {
  const known = [dirs.recovery, dirs.fatigue, dirs.adaptation].filter(
    (d) => d !== 'UNKNOWN',
  ) as PhysiologicalDirection[];

  if (known.length < 2) {
    return { consistency: 'INSUFFICIENT_DATA', score: 0 };
  }

  const trainCount = known.filter((d) => d === 'TRAIN').length;
  const easyCount = known.filter((d) => d === 'EASY').length;
  const restCount = known.filter((d) => d === 'REST').length;
  const total = known.length;

  const maxGroup = Math.max(trainCount, easyCount, restCount);
  const agreementRatio = maxGroup / total;
  const score = Math.round(agreementRatio * 100);

  // Conflicting: REST and TRAIN coexist with known count
  const hasConflict = restCount > 0 && trainCount > 0;

  let consistency: PhysiologicalConsistency;
  if (agreementRatio === 1) {
    consistency = 'ALIGNED';
  } else if (hasConflict) {
    consistency = 'CONFLICTING';
  } else {
    consistency = 'PARTIALLY_ALIGNED';
  }

  return { consistency, score };
}

export type ArbitrationSystem = 'RECOVERY' | 'FATIGUE' | 'ADAPTATION';

function hasTrainRestConflict(dirs: ModelDirections): boolean {
  const known = [dirs.recovery, dirs.fatigue, dirs.adaptation].filter(
    (direction) => direction !== 'UNKNOWN',
  ) as PhysiologicalDirection[];
  const trainCount = known.filter((direction) => direction === 'TRAIN').length;
  const restCount = known.filter((direction) => direction === 'REST').length;
  return restCount > 0 && trainCount > 0;
}

function arbitrationFromVerdict(verdict: OverallVerdict): ArbitrationSystem {
  if (verdict === 'TRAIN_HARD') {
    return 'FATIGUE';
  }
  return 'RECOVERY';
}

function adaptationRestConflictArbitration(
  limitingFactor: ReasoningState['limitingFactor'],
): ArbitrationSystem {
  if (limitingFactor.system === 'RECOVERY' || limitingFactor.system === 'ADAPTATION') {
    return limitingFactor.system;
  }
  return 'RECOVERY';
}

/** When models disagree (TRAIN vs REST), pick who has the last word — safety-first. */
export function arbitrateModelConflict(
  dirs: ModelDirections,
  verdict: OverallVerdict,
  limitingFactor: ReasoningState['limitingFactor'],
): ArbitrationSystem | null {
  if (!hasTrainRestConflict(dirs)) {
    return null;
  }

  if (dirs.fatigue === 'REST') {
    return 'FATIGUE';
  }
  if (dirs.recovery === 'REST') {
    return 'RECOVERY';
  }

  if (dirs.adaptation === 'REST' && dirs.fatigue === 'TRAIN') {
    return adaptationRestConflictArbitration(limitingFactor);
  }

  return limitingFactor.system ?? arbitrationFromVerdict(verdict);
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict synthesis (safety-first)
// ─────────────────────────────────────────────────────────────────────────────

function isLowReadiness(r: RecoveryState | null): boolean {
  return r?.readinessCategory === 'LOW' || r?.readinessCategory === 'VERY_LOW';
}

function isFreshFatigue(f: FatigueState | null): boolean {
  return f?.fatigueLevel === 'FRESH' || f?.fatigueLevel === 'FUNCTIONAL_LOW';
}

function isAdequateRecovery(r: RecoveryState | null): boolean {
  return r?.readinessCategory === 'OPTIMAL' || r?.readinessCategory === 'ADEQUATE';
}

function isPositiveAdaptation(a: AdaptationState | null): boolean {
  return a?.adaptationStatus === 'POSITIVELY_ADAPTING' || a?.adaptationStatus === 'MAINTAINING';
}

function safetyVerdict(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): OverallVerdict | null {
  if (f?.fatigueLevel === 'OVERREACHING_RISK') {
    return 'RECOVER';
  }
  if (f?.trainingCapacity === 'REST_ONLY') {
    return 'RECOVER';
  }
  if (isLowReadiness(r)) {
    return 'RECOVER';
  }
  if (a?.overreachingWithoutAdaptationDetected) {
    return 'CAUTION';
  }
  return null;
}

function isRaceReady(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): boolean {
  const peak = a?.estimatedAdaptationPeak;
  return r?.readinessCategory === 'OPTIMAL' && isFreshFatigue(f) && isSet(peak) && peak <= 5;
}

function isTrainHardReady(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): boolean {
  return isAdequateRecovery(r) && isFreshFatigue(f) && isPositiveAdaptation(a);
}

function isTrainEasyDay(f: FatigueState | null, r: RecoveryState | null): boolean {
  if (f?.fatigueLevel === 'ACCUMULATED') {
    return true;
  }
  if (f?.trainingCapacity === 'REDUCED') {
    return true;
  }
  if (r?.readinessCategory === 'REDUCED') {
    return true;
  }
  return f?.fatigueLevel === 'FUNCTIONAL_HIGH';
}

function conflictVerdict(dirs: ModelDirections): OverallVerdict | null {
  if (dirs.recovery === 'TRAIN' && dirs.fatigue === 'REST') {
    return 'CAUTION';
  }
  if (dirs.fatigue === 'TRAIN' && dirs.adaptation === 'REST') {
    return dirs.recovery === 'REST' || dirs.recovery === 'EASY' ? 'TRAIN_EASY' : 'CAUTION';
  }
  return null;
}

export function synthesizeVerdict(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
  availableCount: number,
): OverallVerdict {
  if (availableCount < 2) {
    return 'INSUFFICIENT_DATA';
  }

  const safety = safetyVerdict(r, f, a);
  if (safety) {
    return safety;
  }

  const dirs = buildModelDirections(r, f, a);
  const conflict = conflictVerdict(dirs);
  if (conflict) {
    return conflict;
  }

  if (isRaceReady(r, f, a)) {
    return 'RACE_READY';
  }
  if (isTrainHardReady(r, f, a)) {
    return 'TRAIN_HARD';
  }
  if (isTrainEasyDay(f, r)) {
    return 'TRAIN_EASY';
  }

  return 'TRAIN_SMART';
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict detection
// ─────────────────────────────────────────────────────────────────────────────

function detectCapacityConflict(
  r: RecoveryState | null,
  f: FatigueState | null,
): ReasoningConflict | null {
  if (
    !r ||
    !f ||
    (r.readinessCategory !== 'OPTIMAL' && r.readinessCategory !== 'ADEQUATE') ||
    f.trainingCapacity !== 'REST_ONLY'
  ) {
    return null;
  }

  return {
    id: 'CAPACITY_CONFLICT_01',
    type: 'CAPACITY_CONFLICT',
    descriptionCode: 'reasoning.conflict.capacityConflict01.description',
    models: ['Recovery', 'Fatigue'],
    resolutionCode: 'reasoning.conflict.capacityConflict01.resolution',
  };
}

function detectTimingConflict(
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningConflict | null {
  if (!a?.plateauRisk || !f || f.trainingCapacity !== 'REST_ONLY') {
    return null;
  }

  return {
    id: 'TIMING_CONFLICT_01',
    type: 'TIMING_CONFLICT',
    descriptionCode: 'reasoning.conflict.timingConflict01.description',
    models: ['Adaptation', 'Fatigue'],
    resolutionCode: 'reasoning.conflict.timingConflict01.resolution',
  };
}

function detectSignalConflict(
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningConflict | null {
  if (
    !f ||
    !a ||
    f.functionalOverreachingRisk !== 'CRITICAL' ||
    a.adaptationStatus !== 'POSITIVELY_ADAPTING'
  ) {
    return null;
  }

  return {
    id: 'SIGNAL_CONFLICT_01',
    type: 'SIGNAL_CONFLICT',
    descriptionCode: 'reasoning.conflict.signalConflict01.description',
    models: ['Fatigue', 'Adaptation'],
    resolutionCode: 'reasoning.conflict.signalConflict01.resolution',
  };
}

export function detectConflicts(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningConflict[] {
  return [
    detectCapacityConflict(r, f),
    detectTimingConflict(f, a),
    detectSignalConflict(f, a),
  ].filter((conflict): conflict is ReasoningConflict => isSet(conflict));
}

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity detection
// ─────────────────────────────────────────────────────────────────────────────

function isPlateauingAdaptation(a: AdaptationState | null): boolean {
  return a?.adaptationStatus === 'PLATEAUING' || Boolean(a?.plateauRisk);
}

function detectLoadIncreaseOpportunity(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningOpportunity | null {
  if (
    !r ||
    !f ||
    !a ||
    !isAdequateRecovery(r) ||
    !isFreshFatigue(f) ||
    !isPlateauingAdaptation(a)
  ) {
    return null;
  }

  return {
    id: 'OPP_LOAD_INCREASE',
    type: 'LOAD_INCREASE',
    title: { code: 'reasoning.opportunity.loadIncrease.title' },
    rationale: { code: 'reasoning.opportunity.loadIncrease.rationale' },
    expectedBenefit: 82,
    timeWindow: 'THIS_WEEK',
  };
}

function detectQualitySessionOpportunity(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningOpportunity | null {
  if (r?.readinessCategory !== 'OPTIMAL' || !isFreshFatigue(f) || a?.plateauRisk) {
    return null;
  }

  return {
    id: 'OPP_QUALITY_SESSION',
    type: 'QUALITY_SESSION',
    title: { code: 'reasoning.opportunity.qualitySession.title' },
    rationale: { code: 'reasoning.opportunity.qualitySession.rationale' },
    expectedBenefit: 90,
    timeWindow: 'TODAY',
  };
}

function detectDeloadOpportunity(f: FatigueState | null): ReasoningOpportunity | null {
  if (
    !f ||
    f.consecutiveAccumulationDays < 5 ||
    (f.trajectory !== 'ACCUMULATING' && f.trajectory !== 'ACCELERATING')
  ) {
    return null;
  }

  return {
    id: 'OPP_DELOAD',
    type: 'DELOAD',
    title: { code: 'reasoning.opportunity.deload.title' },
    rationale: {
      code: 'reasoning.opportunity.deload.rationale',
      params: { days: f.consecutiveAccumulationDays },
    },
    expectedBenefit: 75,
    timeWindow: 'THIS_WEEK',
  };
}

function detectRaceReadinessOpportunity(
  r: RecoveryState | null,
  a: AdaptationState | null,
): ReasoningOpportunity | null {
  const peak = a?.estimatedAdaptationPeak;
  if (!a || !isSet(peak) || peak > 7 || !isAdequateRecovery(r)) {
    return null;
  }

  return {
    id: 'OPP_RACE_READINESS',
    type: 'RACE_READINESS',
    title: {
      code: 'reasoning.opportunity.raceReadiness.title',
      params: { days: peak },
    },
    rationale: { code: 'reasoning.opportunity.raceReadiness.rationale' },
    expectedBenefit: 95,
    timeWindow: peak <= 2 ? 'TODAY' : 'THIS_WEEK',
  };
}

function detectRecoveryWindowOpportunity(r: RecoveryState | null): ReasoningOpportunity | null {
  if (!r || (r.readinessCategory !== 'LOW' && r.readinessCategory !== 'VERY_LOW')) {
    return null;
  }

  return {
    id: 'OPP_RECOVERY_WINDOW',
    type: 'RECOVERY_WINDOW',
    title: { code: 'reasoning.opportunity.recoveryWindow.title' },
    rationale: { code: 'reasoning.opportunity.recoveryWindow.rationale' },
    expectedBenefit: 80,
    timeWindow: 'TODAY',
  };
}

export function detectOpportunities(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningOpportunity[] {
  return [
    detectLoadIncreaseOpportunity(r, f, a),
    detectQualitySessionOpportunity(r, f, a),
    detectDeloadOpportunity(f),
    detectRaceReadinessOpportunity(r, a),
    detectRecoveryWindowOpportunity(r),
  ]
    .filter((opportunity): opportunity is ReasoningOpportunity => isSet(opportunity))
    .sort((a, b) => b.expectedBenefit - a.expectedBenefit)
    .slice(0, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Key findings
// ─────────────────────────────────────────────────────────────────────────────

function buildArbitrationFinding(input: BuildKeyFindingsInput): ReasoningFinding | null {
  const { conflicts, modelDirections, physiologicalConsistency, overallVerdict, limitingFactor } =
    input;

  if (
    physiologicalConsistency !== 'CONFLICTING' ||
    !modelDirections ||
    conflicts.length > 0 ||
    !overallVerdict ||
    !limitingFactor
  ) {
    return null;
  }

  const winner = arbitrateModelConflict(modelDirections, overallVerdict, limitingFactor);
  if (!winner) {
    return null;
  }

  return {
    id: 'FINDING_ARBITRATION',
    category: 'CROSS_SYSTEM',
    severity: 'INFO',
    title: { code: 'reasoning.finding.arbitration.title' },
    evidenceItems: [
      {
        code: 'reasoning.finding.arbitration.evidence.verdict',
        params: { verdict: overallVerdict },
      },
      {
        code: 'reasoning.finding.arbitration.evidence.priority',
        params: { system: winner },
      },
      ...(limitingFactor.description ? [limitingFactor.description] : []),
    ],
    confidence: 0.85,
  };
}

export function buildKeyFindings(input: BuildKeyFindingsInput): ReasoningFinding[] {
  return collectKeyFindings({
    ...input,
    arbitrationFinding: buildArbitrationFinding(input),
  });
}

function readAvailableMetric(metric: { available: boolean; value?: number }): number | null {
  return metric.available ? (metric.value ?? null) : null;
}

export function appendEnvironmentalFindings(
  findings: ReasoningFinding[],
  impact: EnvironmentalImpact | null | undefined,
): ReasoningFinding[] {
  if (!impact || !environmentalImpactIsSignificant(impact)) {
    return findings;
  }

  const recoveryDemand = readAvailableMetric(impact.recovery.demandMultiplier);
  const performanceRatio = readAvailableMetric(impact.performance.expectedOutputRatio);
  const severity = isSet(recoveryDemand) && recoveryDemand > 1.15 ? 'WARNING' : ('INFO' as const);

  return [
    ...findings,
    {
      id: 'FINDING_ENVIRONMENTAL_LOAD',
      category: 'CROSS_SYSTEM',
      severity,
      title: { code: 'reasoning.finding.environmentalLoad.title' },
      evidenceItems: [
        {
          code: 'reasoning.finding.environmentalLoad.evidence.recoveryDemand',
          params: isSet(recoveryDemand)
            ? { recoveryPct: Math.round((recoveryDemand - 1) * 100) }
            : undefined,
        },
        {
          code: 'reasoning.finding.environmentalLoad.evidence.performanceExpectation',
          params: isSet(performanceRatio)
            ? { performancePct: Math.round((1 - performanceRatio) * 100) }
            : undefined,
        },
      ],
      confidence: impact.confidence,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Limiting factor selection
// ─────────────────────────────────────────────────────────────────────────────

function fatigueLimitingFactor(f: FatigueState): ReasoningState['limitingFactor'] | null {
  if (f.fatigueLevel === 'OVERREACHING_RISK' || f.fatigueLevel === 'NON_FUNCTIONAL_RISK') {
    return {
      system: 'FATIGUE',
      description: {
        code: 'reasoning.limitingFactor.fatigue.overreaching',
        params: { dimension: f.dominantDimension },
      },
      actionable: true,
    };
  }

  if (f.fatigueLevel === 'ACCUMULATED') {
    return {
      system: 'FATIGUE',
      description: {
        code: 'reasoning.limitingFactor.fatigue.accumulated',
        params: { dimension: f.dominantDimension, days: f.consecutiveAccumulationDays },
      },
      actionable: true,
    };
  }

  return null;
}

function recoveryLimitingFactor(r: RecoveryState): ReasoningState['limitingFactor'] | null {
  if (isLowReadiness(r)) {
    return {
      system: 'RECOVERY',
      description: r.primaryLimitingFactor
        ? {
            code: 'reasoning.limitingFactor.recovery.deficit',
            params: { limiter: r.primaryLimitingFactor },
          }
        : { code: 'reasoning.limitingFactor.recovery.criticallyLow' },
      actionable: true,
    };
  }

  if (r.readinessCategory === 'REDUCED') {
    return {
      system: 'RECOVERY',
      description: r.primaryLimitingFactor
        ? {
            code: 'reasoning.limitingFactor.recovery.deficit',
            params: { limiter: r.primaryLimitingFactor },
          }
        : { code: 'reasoning.limitingFactor.recovery.reduced' },
      actionable: true,
    };
  }

  return null;
}

function adaptationLimitingFactor(a: AdaptationState): ReasoningState['limitingFactor'] | null {
  if (a.adaptationStatus === 'MALADAPTING' || a.adaptationStatus === 'DETRAINING') {
    return {
      system: 'ADAPTATION',
      description: a.limitingFactor
        ? {
            code: 'reasoning.limitingFactor.adaptation.factor',
            params: { factor: a.limitingFactor },
          }
        : { code: 'reasoning.limitingFactor.adaptation.insufficientStimulus' },
      actionable: true,
    };
  }

  if (a.plateauRisk) {
    return {
      system: 'ADAPTATION',
      description: { code: 'reasoning.limitingFactor.adaptation.plateau' },
      actionable: true,
    };
  }

  return null;
}

const NO_LIMITING_FACTOR: ReasoningState['limitingFactor'] = {
  system: null,
  description: null,
  actionable: false,
};

function firstModelLimitingFactor(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
): ReasoningState['limitingFactor'] | null {
  const candidates = [
    f ? fatigueLimitingFactor(f) : null,
    r ? recoveryLimitingFactor(r) : null,
    a ? adaptationLimitingFactor(a) : null,
  ];
  return candidates.find((limit) => isSet(limit)) ?? null;
}

export function selectLimitingFactor(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
  verdict: OverallVerdict,
): ReasoningState['limitingFactor'] {
  if (verdict === 'TRAIN_HARD' || verdict === 'RACE_READY') {
    return NO_LIMITING_FACTOR;
  }

  return firstModelLimitingFactor(r, f, a) ?? NO_LIMITING_FACTOR;
}

// ─────────────────────────────────────────────────────────────────────────────
// System attention priority
// ─────────────────────────────────────────────────────────────────────────────

export function selectAttentionPriority(
  limitingFactor: ReasoningState['limitingFactor'],
  verdict: OverallVerdict,
): SystemAttentionPriority {
  if (limitingFactor.system) {
    return limitingFactor.system;
  }
  if (verdict === 'TRAIN_HARD' || verdict === 'TRAIN_SMART') {
    return 'BALANCED';
  }
  return 'BALANCED';
}

// ─────────────────────────────────────────────────────────────────────────────
// Top action
// ─────────────────────────────────────────────────────────────────────────────

const TOP_ACTION_BY_VERDICT: Record<
  Exclude<OverallVerdict, 'INSUFFICIENT_DATA'>,
  ReasoningState['topAction']
> = {
  TRAIN_SMART: {
    verbCode: 'reasoning.topAction.trainSmart.verb',
    focusCode: 'reasoning.topAction.trainSmart.focus',
    rationaleCode: 'reasoning.topAction.trainSmart.rationale',
    expectedBenefit: 72,
  },
  TRAIN_EASY: {
    verbCode: 'reasoning.topAction.trainEasy.verb',
    focusCode: 'reasoning.topAction.trainEasy.focus',
    rationaleCode: 'reasoning.topAction.trainEasy.rationale',
    expectedBenefit: 55,
  },
  RACE_READY: {
    verbCode: 'reasoning.topAction.raceReady.verb',
    focusCode: 'reasoning.topAction.raceReady.focus',
    rationaleCode: 'reasoning.topAction.raceReady.rationale',
    expectedBenefit: 95,
  },
  CAUTION: {
    verbCode: 'reasoning.topAction.caution.verb',
    focusCode: 'reasoning.topAction.caution.focus',
    rationaleCode: 'reasoning.topAction.caution.rationale',
    expectedBenefit: 50,
  },
  RECOVER: null,
  TRAIN_HARD: null,
};

function buildTrainHardAction(a: AdaptationState | null): ReasoningState['topAction'] {
  return {
    verbCode: 'reasoning.topAction.trainHard.verb',
    focusCode:
      a?.adaptationStatus === 'POSITIVELY_ADAPTING'
        ? 'reasoning.topAction.trainHard.focus.progressiveOverload'
        : 'reasoning.topAction.trainHard.focus.aerobicBase',
    rationaleCode: 'reasoning.topAction.trainHard.rationale',
    expectedBenefit: 90,
  };
}

function buildRecoverAction(): ReasoningState['topAction'] {
  // Never put a limiting-factor i18n code in focusCode — those templates need
  // `{limiter}` params; resolveCode left the placeholder literal in the action line.
  return {
    verbCode: 'reasoning.topAction.recover.verb',
    focusCode: 'reasoning.topAction.recover.focusDefault',
    rationaleCode: 'reasoning.topAction.recover.rationale',
    expectedBenefit: 80,
  };
}

export function buildTopAction(
  verdict: OverallVerdict,
  limitingFactor: ReasoningState['limitingFactor'],
  a: AdaptationState | null,
): ReasoningState['topAction'] {
  if (verdict === 'TRAIN_HARD') {
    return buildTrainHardAction(a);
  }
  if (verdict === 'RECOVER') {
    return buildRecoverAction();
  }
  if (verdict === 'INSUFFICIENT_DATA') {
    return null;
  }

  return TOP_ACTION_BY_VERDICT[verdict] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence graph
// ─────────────────────────────────────────────────────────────────────────────

export type BuildEvidenceGraphInput = {
  recovery: RecoveryState | null;
  fatigue: FatigueState | null;
  adaptation: AdaptationState | null;
  verdict: OverallVerdict;
  limitingFactor: ReasoningState['limitingFactor'];
};

function applyRecoverEvidenceBoosts(
  base: { recovery: number; fatigue: number; adaptation: number },
  recovery: RecoveryState | null,
  fatigue: FatigueState | null,
): void {
  if (fatigue?.fatigueLevel === 'OVERREACHING_RISK' || fatigue?.trainingCapacity === 'REST_ONLY') {
    base.fatigue = 2.5;
    return;
  }
  if (isLowReadiness(recovery)) {
    base.recovery = 2.5;
  }
}

function applyLimitingFactorBoost(
  base: { recovery: number; fatigue: number; adaptation: number },
  system: NonNullable<ReasoningState['limitingFactor']['system']>,
): void {
  const boostBySystem: Record<typeof system, keyof typeof base> = {
    FATIGUE: 'fatigue',
    RECOVERY: 'recovery',
    ADAPTATION: 'adaptation',
  };
  base[boostBySystem[system]] = 1.8;
}

function applyEvidenceBoosts(
  base: { recovery: number; fatigue: number; adaptation: number },
  input: BuildEvidenceGraphInput,
): void {
  const { recovery, fatigue, verdict, limitingFactor } = input;

  if (verdict === 'RECOVER') {
    applyRecoverEvidenceBoosts(base, recovery, fatigue);
    return;
  }

  if (verdict === 'RACE_READY') {
    base.adaptation = 1.8;
    return;
  }

  if (limitingFactor.system) {
    applyLimitingFactorBoost(base, limitingFactor.system);
  }
}

export function buildEvidenceGraph(
  input: BuildEvidenceGraphInput,
): ReasoningState['evidenceGraph'] {
  const base = { recovery: 1.0, fatigue: 1.0, adaptation: 1.0 };
  applyEvidenceBoosts(base, input);

  if (!input.recovery) {
    base.recovery = 0;
  }
  if (!input.fatigue) {
    base.fatigue = 0;
  }
  if (!input.adaptation) {
    base.adaptation = 0;
  }

  const total = base.recovery + base.fatigue + base.adaptation;
  if (total === 0) {
    return { recoveryContribution: 0, fatigueContribution: 0, adaptationContribution: 0 };
  }

  return {
    recoveryContribution: Math.round((base.recovery / total) * 100) / 100,
    fatigueContribution: Math.round((base.fatigue / total) * 100) / 100,
    adaptationContribution: Math.round((base.adaptation / total) * 100) / 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence and data completeness
// ─────────────────────────────────────────────────────────────────────────────

function applyConsistencyModifier(base: number, consistency: PhysiologicalConsistency): number {
  if (consistency === 'ALIGNED') {
    return Math.min(base + 0.1, 0.95);
  }
  if (consistency === 'CONFLICTING') {
    return Math.max(base - 0.15, 0.2);
  }
  return base;
}

function resolveDataCompleteness(
  dataCounts: DataCompleteness[],
  count: number,
): { dataCompleteness: DataCompleteness; confidenceCap: number | null } {
  if (dataCounts.some((d) => d === 'INSUFFICIENT')) {
    return { dataCompleteness: 'INSUFFICIENT', confidenceCap: 0.4 };
  }
  if (dataCounts.some((d) => d === 'SPARSE')) {
    return { dataCompleteness: 'SPARSE', confidenceCap: 0.55 };
  }
  if (dataCounts.some((d) => d === 'PARTIAL') || count < 3) {
    return { dataCompleteness: 'PARTIAL', confidenceCap: null };
  }
  return { dataCompleteness: 'FULL', confidenceCap: null };
}

export function computeReasoningConfidence(
  r: RecoveryState | null,
  f: FatigueState | null,
  a: AdaptationState | null,
  consistency: PhysiologicalConsistency,
): { confidence: number; dataCompleteness: DataCompleteness } {
  const available = [r, f, a].filter(Boolean);
  const count = available.length;

  if (count < 2) {
    return { confidence: 0.15, dataCompleteness: 'INSUFFICIENT' };
  }

  const avgConfidence = available.reduce((sum, m) => sum + m!.confidence, 0) / count;
  let base = count === 3 ? Math.min(avgConfidence + 0.05, 0.95) : avgConfidence;
  base = applyConsistencyModifier(base, consistency);

  const dataCounts = available.map((m) => m!.dataCompleteness);
  const { dataCompleteness, confidenceCap } = resolveDataCompleteness(dataCounts, count);
  if (isSet(confidenceCap)) {
    base = Math.min(base, confidenceCap);
  }

  return { confidence: Math.round(base * 100) / 100, dataCompleteness };
}
