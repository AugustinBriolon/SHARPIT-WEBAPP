/**
 * PHYSICAL HEALTH MODEL v1 — Scoring & Inference
 *
 * Deterministic latent-state inference from observation history.
 * Never averages raw pain scores naively — uses time-decayed weighting.
 */

import type { DataCompleteness } from '../../digital-twin/types';
import { isSet } from '@sharpit/shared/value';
import type { I18nItem } from '../shared/types';
import type {
  ConditionStatus,
  ConditionTrend,
  TrainingCapacityLevel,
} from '../../physical-health/types';
import type {
  ConditionInferenceInput,
  ConditionObservationInput,
  InferredConditionView,
  PhysicalHealthDecision,
  PhysicalHealthDecisionVerdict,
  PhysicalHealthRecommendation,
  PhysicalHealthSignals,
} from './types';

const TREND_SLOPE_THRESHOLD = 0.3;
const SEVERITY_DECAY_HALF_LIFE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// Severity — time-decayed weighted inference (not a simple average)
// ─────────────────────────────────────────────────────────────────────────────

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

function decayWeight(daysAgo: number): number {
  return Math.exp((-daysAgo * Math.LN2) / SEVERITY_DECAY_HALF_LIFE_DAYS);
}

/**
 * What a reading says of the pain: its figure, or 0 when the athlete reported none.
 * A reading at 0 is stored as asymptomatic; left out, three days at 0 after a 6 still
 * averaged to 6 for four weeks.
 */
function readingSeverity(observation: ConditionObservationInput): number | null {
  if (!observation.symptomPresent) {
    return 0;
  }
  return isSet(observation.severityReported) ? (observation.severityReported as number) : null;
}

function inferSeverityFromObservations(
  observations: readonly ConditionObservationInput[],
  referenceAt: Date,
): { severity: number; evidenceIds: string[] } {
  const windowDays = 28;
  const dated = observations
    .filter((o) => readingSeverity(o) !== null && daysBetween(o.observedAt, referenceAt) >= 0)
    .sort((x, y) => y.observedAt.getTime() - x.observedAt.getTime());
  const recent = dated.filter((o) => daysBetween(o.observedAt, referenceAt) <= windowDays);
  const [latest] = dated;

  if (!latest) {
    return { severity: 0, evidenceIds: [] };
  }
  if (recent.length === 0) {
    // Nothing in four weeks: the athlete has not checked in, not improved.
    const carried = readingSeverity(latest) as number;
    return {
      severity: Math.round(carried * 10) / 10,
      evidenceIds: carried > 0 ? [latest.id] : [],
    };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  for (const obs of recent) {
    const w = decayWeight(daysBetween(obs.observedAt, referenceAt));
    weightedSum += (readingSeverity(obs) as number) * w;
    weightTotal += w;
  }
  const mean = weightTotal > 0 ? weightedSum / weightTotal : 0;
  // Fast up, slow down: a flare rules the day it is reported, relief has to last.
  const severity = Math.max(mean, readingSeverity(latest) as number);

  return {
    severity: Math.round(severity * 10) / 10,
    evidenceIds: recent
      .filter((o) => o.symptomPresent)
      .map((o) => o.id)
      .reverse()
      .slice(-5),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend — linear regression on symptomatic observations (14d)
// ─────────────────────────────────────────────────────────────────────────────

export function inferTrend(
  observations: readonly ConditionObservationInput[],
  referenceAt: Date,
): ConditionTrend {
  const points = observations
    .filter(
      (o) =>
        readingSeverity(o) !== null &&
        daysBetween(o.observedAt, referenceAt) <= 14 &&
        daysBetween(o.observedAt, referenceAt) >= 0,
    )
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  if (points.length < 3) {
    return 'UNKNOWN';
  }

  const t0 = points[0].observedAt.getTime();
  const pairs = points.map((p) => ({
    x: (p.observedAt.getTime() - t0) / MS_PER_DAY,
    y: readingSeverity(p) as number,
  }));

  const n = pairs.length;
  const sumX = pairs.reduce((a, p) => a + p.x, 0);
  const sumY = pairs.reduce((a, p) => a + p.y, 0);
  const sumXY = pairs.reduce((a, p) => a + p.x * p.y, 0);
  const sumX2 = pairs.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;

  if (denom === 0) {
    return 'UNKNOWN';
  }

  const slope = (n * sumXY - sumX * sumY) / denom;
  if (slope < -TREND_SLOPE_THRESHOLD) {
    return 'IMPROVING';
  }
  if (slope > TREND_SLOPE_THRESHOLD) {
    return 'WORSENING';
  }
  return 'STABLE';
}

// ─────────────────────────────────────────────────────────────────────────────
// Functional capacity — prefer explicit assessment, else infer from severity
// ─────────────────────────────────────────────────────────────────────────────

function inferTrainingCapacityFromSeverity(severity: number): TrainingCapacityLevel {
  if (severity === 0) {
    return 'FULL';
  }
  if (severity <= 3) {
    return 'REDUCED';
  }
  if (severity <= 6) {
    return 'LIMITED';
  }
  return 'UNABLE';
}

function resolveFunctionalCapacity(
  condition: ConditionInferenceInput,
  inferredSeverity: number,
  referenceAt: Date,
): TrainingCapacityLevel {
  const [latest] = [...condition.functionalCapacities]
    .filter((fc) => daysBetween(fc.assessedAt, referenceAt) >= 0)
    .sort((a, b) => b.assessedAt.getTime() - a.assessedAt.getTime());

  if (latest) {
    return latest.trainingCapacity;
  }
  if (!condition.affectsTraining) {
    return 'FULL';
  }
  return inferTrainingCapacityFromSeverity(inferredSeverity);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status & recurrence detection
// ─────────────────────────────────────────────────────────────────────────────

function hasRecentSymptom(
  observations: readonly ConditionObservationInput[],
  referenceAt: Date,
  withinDays: number,
): boolean {
  return observations.some(
    (o) =>
      o.symptomPresent &&
      daysBetween(o.observedAt, referenceAt) <= withinDays &&
      daysBetween(o.observedAt, referenceAt) >= 0,
  );
}

function inferRecurrentStatus(
  condition: ConditionInferenceInput,
  veryRecentSymptom: boolean,
): { status: ConditionStatus; recurrenceCount: number } | null {
  const wasResolved = isSet(condition.resolvedAt) || condition.episodes.some((e) => e.resolvedAt);
  if (wasResolved && veryRecentSymptom) {
    // The relapse itself is counted once, where it is declared: counted here it grew
    // by one on every daily inference.
    return { status: 'RECURRENT', recurrenceCount: condition.recurrenceCount };
  }
  return null;
}

function inferResolvedStatus(
  condition: ConditionInferenceInput,
  severity: number,
  recentSymptom: boolean,
): { status: ConditionStatus; recurrenceCount: number } | null {
  if (condition.resolvedAt && !recentSymptom && severity < 1) {
    return { status: 'RESOLVED', recurrenceCount: condition.recurrenceCount };
  }
  return null;
}

function inferTrendStatus(
  condition: ConditionInferenceInput,
  trend: ConditionTrend,
): { status: ConditionStatus; recurrenceCount: number } | null {
  if (trend === 'IMPROVING') {
    return { status: 'IMPROVING', recurrenceCount: condition.recurrenceCount };
  }
  if (trend === 'WORSENING') {
    return { status: 'WORSENING', recurrenceCount: condition.recurrenceCount };
  }
  return null;
}

function inferNonRecurrentStatus(
  condition: ConditionInferenceInput,
  severity: number,
  trend: ConditionTrend,
  recentSymptom: boolean,
): { status: ConditionStatus; recurrenceCount: number } {
  const resolved = inferResolvedStatus(condition, severity, recentSymptom);
  if (resolved) {
    return resolved;
  }
  if (condition.observations.length <= 1) {
    return { status: 'NEW', recurrenceCount: condition.recurrenceCount };
  }
  const trendStatus = inferTrendStatus(condition, trend);
  if (trendStatus) {
    return trendStatus;
  }
  if (severity < 1 && !recentSymptom) {
    return { status: 'STABLE', recurrenceCount: condition.recurrenceCount };
  }

  return { status: severity > 0 ? 'ACTIVE' : 'STABLE', recurrenceCount: condition.recurrenceCount };
}

function inferStatus(
  condition: ConditionInferenceInput,
  severity: number,
  trend: ConditionTrend,
  referenceAt: Date,
): { status: ConditionStatus; recurrenceCount: number } {
  const recentSymptom = hasRecentSymptom(condition.observations, referenceAt, 14);
  const veryRecentSymptom = hasRecentSymptom(condition.observations, referenceAt, 7);
  const recurrent = inferRecurrentStatus(condition, veryRecentSymptom);
  if (recurrent) {
    return recurrent;
  }

  return inferNonRecurrentStatus(condition, severity, trend, recentSymptom);
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence
// ─────────────────────────────────────────────────────────────────────────────

function inferConfidence(
  observations: readonly ConditionObservationInput[],
  functionalCapacity: TrainingCapacityLevel,
  severity: number,
  referenceAt: Date,
): number {
  const count = observations.length;
  let confidence = Math.min(0.95, 0.35 + count * 0.08);

  const [latest] = observations
    .slice()
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
  if (latest && daysBetween(latest.observedAt, referenceAt) <= 3) {
    confidence += 0.1;
  }

  const onlyAsymptomatic = observations.length > 0 && observations.every((o) => !o.symptomPresent);
  if (onlyAsymptomatic) {
    confidence -= 0.15;
  }

  const severityCapacity = inferTrainingCapacityFromSeverity(severity);
  if (
    severityCapacity !== functionalCapacity &&
    (severityCapacity === 'FULL') !== (functionalCapacity === 'FULL')
  ) {
    confidence -= 0.1;
  }

  return Math.max(0.2, Math.min(0.95, Math.round(confidence * 100) / 100));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery progression estimate
// ─────────────────────────────────────────────────────────────────────────────

function estimateRecoveryDays(
  severity: number,
  trend: ConditionTrend,
  status: ConditionStatus,
): number | null {
  if (status === 'RESOLVED' || severity < 1) {
    return null;
  }
  if (trend !== 'IMPROVING') {
    return null;
  }

  const baseDays = Math.ceil(severity * 2.5);
  return Math.max(1, baseDays);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-condition inference
// ─────────────────────────────────────────────────────────────────────────────

export function inferConditionState(
  condition: ConditionInferenceInput,
  referenceAt: Date,
  computedAt: Date,
): InferredConditionView & {
  update: {
    severity: number;
    status: ConditionStatus;
    confidence: number;
    estimatedRecoveryDays: number | null;
    recurrenceCount: number;
  };
} {
  const { severity, evidenceIds } = inferSeverityFromObservations(
    condition.observations,
    referenceAt,
  );
  const trend = inferTrend(condition.observations, referenceAt);
  const functionalCapacity = resolveFunctionalCapacity(condition, severity, referenceAt);
  const { status, recurrenceCount } = inferStatus(condition, severity, trend, referenceAt);
  const confidence = inferConfidence(
    condition.observations,
    functionalCapacity,
    severity,
    referenceAt,
  );
  const estimatedRecoveryDays = estimateRecoveryDays(severity, trend, status);

  return {
    conditionId: condition.id,
    label: condition.label,
    bodyRegion: condition.bodyRegion,
    side: condition.side,
    type: condition.type,
    affectsTraining: condition.affectsTraining,
    severity,
    status,
    trend,
    confidence,
    functionalCapacity,
    estimatedRecoveryDays,
    evidenceObservationIds: evidenceIds,
    computedAt,
    update: {
      severity,
      status,
      confidence,
      estimatedRecoveryDays,
      recurrenceCount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate inference
// ─────────────────────────────────────────────────────────────────────────────

const CAPACITY_ORDER: TrainingCapacityLevel[] = ['FULL', 'REDUCED', 'LIMITED', 'UNABLE'];

function worstCapacity(capacities: TrainingCapacityLevel[]): TrainingCapacityLevel {
  if (capacities.length === 0) {
    return 'FULL';
  }
  return capacities.reduce((worst, c) =>
    CAPACITY_ORDER.indexOf(c) > CAPACITY_ORDER.indexOf(worst) ? c : worst,
  );
}

export function isActiveCondition(status: ConditionStatus): boolean {
  return status !== 'RESOLVED';
}

export function buildPhysicalHealthSignals(
  conditions: readonly InferredConditionView[],
): PhysicalHealthSignals {
  const active = conditions.filter((c) => isActiveCondition(c.status));
  const maxSeverity = active.length > 0 ? Math.max(...active.map((c) => c.severity)) : 0;
  const aggregateTrainingCapacity = worstCapacity(
    active.map((c) => c.functionalCapacity ?? 'FULL'),
  );

  return {
    activeConditionCount: active.length,
    maxSeverity,
    aggregateTrainingCapacity,
    trainingBlockedByCondition: active.some(
      (c) => c.affectsTraining && c.severity >= 5 && c.functionalCapacity !== 'FULL',
    ),
    improvingCount: active.filter((c) => c.trend === 'IMPROVING').length,
    worseningCount: active.filter((c) => c.trend === 'WORSENING').length,
    recurrentCount: conditions.filter((c) => c.status === 'RECURRENT').length,
  };
}

export function classifyDataCompleteness(
  conditions: readonly ConditionInferenceInput[],
): DataCompleteness {
  if (conditions.length === 0) {
    return 'INSUFFICIENT';
  }
  const withObs = conditions.filter((c) => c.observations.length > 0).length;
  if (withObs === 0) {
    return 'INSUFFICIENT';
  }
  if (withObs < conditions.length) {
    return 'PARTIAL';
  }
  const avgObs = withObs / conditions.length;
  if (avgObs >= 3) {
    return 'FULL';
  }
  return 'SPARSE';
}

export function computeAggregateConfidence(conditions: readonly InferredConditionView[]): number {
  const active = conditions.filter((c) => isActiveCondition(c.status));
  if (active.length === 0) {
    return 0.9;
  }
  const avg = active.reduce((s, c) => s + c.confidence, 0) / active.length;
  return Math.round(avg * 100) / 100;
}

export function findPrimaryLimitingCondition(
  conditions: readonly InferredConditionView[],
): string | null {
  const active = conditions
    .filter((c) => isActiveCondition(c.status) && c.affectsTraining)
    .sort((a, b) => b.severity - a.severity);
  return active[0]?.conditionId ?? null;
}

export function buildPhysicalHealthDecision(
  signals: PhysicalHealthSignals,
): PhysicalHealthDecision {
  let verdict: PhysicalHealthDecisionVerdict;
  const rationale: I18nItem[] = [];

  if (signals.activeConditionCount === 0) {
    verdict = 'CLEAR';
    rationale.push({ code: 'physical.decision.clear' });
  } else if (signals.aggregateTrainingCapacity === 'UNABLE') {
    verdict = 'REST_RECOMMENDED';
    rationale.push({ code: 'physical.decision.rest_recommended' });
  } else if (signals.trainingBlockedByCondition) {
    verdict = 'LIMIT_TRAINING';
    rationale.push({ code: 'physical.decision.limit_training' });
  } else if (signals.worseningCount > 0 || signals.maxSeverity >= 6) {
    verdict = 'REDUCE_LOAD';
    rationale.push({ code: 'physical.decision.reduce_load' });
  } else if (signals.activeConditionCount > 0) {
    verdict = 'MONITOR';
    rationale.push({ code: 'physical.decision.monitor' });
  } else {
    verdict = 'INSUFFICIENT_DATA';
    rationale.push({ code: 'physical.decision.insufficient_data' });
  }

  return { verdict, rationale };
}

export function buildPhysicalHealthRecommendation(
  signals: PhysicalHealthSignals,
  confidence: number,
): PhysicalHealthRecommendation {
  return {
    trainingCapacity: signals.aggregateTrainingCapacity,
    confidence,
    evidence: [
      {
        code: 'physical.recommendation.evidence',
        params: {
          activeCount: signals.activeConditionCount,
          maxSeverity: signals.maxSeverity,
        },
      },
    ],
  };
}
