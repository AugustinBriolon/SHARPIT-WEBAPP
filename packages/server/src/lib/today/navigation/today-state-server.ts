import type { AdaptationInferenceResult } from '@sharpit/core/inference/adaptation-orchestrator';
import { isSet } from '@sharpit/shared/value';
import type { FatigueInferenceResult } from '@sharpit/core/inference/fatigue-orchestrator';
import type { RecoveryInferenceResult } from '@sharpit/core/inference/orchestrator';
import type { ReasoningInferenceResult } from '@sharpit/core/inference/reasoning-orchestrator';
import { serializeDecisionState } from '@sharpit/core/decision/adapters';
import type { PhysicalHealthInferenceResult } from '@sharpit/core/inference/physical-health-orchestrator';
import type { EnvironmentInferenceResult } from '@sharpit/core/inference/environment-orchestrator';
import type { EnvironmentalDecisionSnapshot } from '@sharpit/core/inference/environment/types';
import { buildEnvironmentalDecisionSnapshot } from '@sharpit/core/inference/environment/snapshot';
import { adaptationEngine } from '@sharpit/server/lib/engines/adaptation-engine';
import { environmentEngine } from '@sharpit/server/lib/engines/environment-engine';
import { physicalHealthEngine } from '@sharpit/server/lib/engines/physical-health-engine';
import { fatigueEngine } from '@sharpit/server/lib/engines/fatigue-engine';
import { featureEngine } from '@sharpit/server/lib/engines/feature-engine';
import { reasoningEngine } from '@sharpit/server/lib/engines/reasoning-engine';
import { recoveryEngine } from '@sharpit/server/lib/engines/recovery-engine';
import { computeDailyStrain } from '@sharpit/server/lib/training/load/daily-strain';
import {
  activityMatchesTrainingDay,
  approximateTrainingDayUtcRange,
  DEFAULT_TRAINING_DAY_START_HOUR,
  DEFAULT_TRAINING_DAY_TIMEZONE,
} from '@sharpit/core/training/training-day';
import type {
  AdaptationData,
  DailyStrainData,
  DecisionData,
  FatigueData,
  ReasoningData,
  RecoveryData,
  PhysicalHealthData,
  EnvironmentSnapshotData,
  TodayState,
} from '@sharpit/app/athlete-state/today-state';
import { prisma } from '@sharpit/db/client';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

function readStateComputedAt(state: unknown): Date | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const raw = (state as { computedAt?: unknown }).computedAt;
  if (typeof raw !== 'string' && !(raw instanceof Date)) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function isReasoningStale(athleteId: string, reasoningComputedAt: Date): Promise<boolean> {
  const twin = await prisma.digitalTwin.findUnique({
    where: { athleteId },
    select: {
      recoveryState: true,
      fatigueState: true,
      adaptationState: true,
      physicalHealthState: true,
      environmentalStateMeta: true,
    },
  });
  if (!twin) {
    return true;
  }

  const subModelTimes = [
    readStateComputedAt(twin.recoveryState),
    readStateComputedAt(twin.fatigueState),
    readStateComputedAt(twin.adaptationState),
    readStateComputedAt(twin.physicalHealthState),
    readStateComputedAt(twin.environmentalStateMeta),
  ].filter((d): d is Date => isSet(d));

  return subModelTimes.some((computedAt) => computedAt > reasoningComputedAt);
}

function formatRecoveryResult(result: RecoveryInferenceResult): RecoveryData {
  const { output, computedAt } = result;
  const { recoveryState, recommendation, signals, decision } = output;

  return {
    readinessScore: recoveryState.readinessScore,
    readinessCategory: recoveryState.readinessCategory,
    confidence: recoveryState.confidence,
    dataCompleteness: recoveryState.dataCompleteness,
    dimensions: {
      autonomic: recoveryState.dimensions.autonomic,
      sleep: recoveryState.dimensions.sleep,
      subjective: recoveryState.dimensions.subjective,
      loadContext: recoveryState.dimensions.loadContext,
    },
    primaryLimitingFactor: recoveryState.primaryLimitingFactor,
    estimatedTimeToFullRecovery: recoveryState.estimatedTimeToFullRecovery,
    signals: {
      autonomicBalance: signals.autonomicBalance,
      sleepAdequacy: signals.sleepAdequacy,
      subjectiveWellness: signals.subjectiveWellness,
      loadStressContext: signals.loadStressContext,
      overreachingRisk: signals.overreachingRisk,
      illnessRisk: signals.illnessRisk,
      dissonanceDetected: signals.dissonanceDetected,
    },
    decision: {
      verdict: decision.verdict,
      recommendedIntensity: decision.recommendedIntensity,
      rationale: [...decision.rationale],
    },
    recommendation: {
      type: recommendation.type,
      keyEvidence: [...recommendation.keyEvidence],
      confidence: recommendation.confidence,
    },
    computedAt: computedAt.toISOString(),
  };
}

function formatFatigueResult(result: FatigueInferenceResult): FatigueData {
  const { output, computedAt } = result;
  const { fatigueState, recommendation, signals, decision } = output;

  return {
    fatigueIndex: fatigueState.fatigueIndex,
    fatigueLevel: fatigueState.fatigueLevel,
    fatigueType: fatigueState.fatigueType,
    confidence: fatigueState.confidence,
    dataCompleteness: fatigueState.dataCompleteness,
    dimensions: {
      load: fatigueState.dimensions.load,
      neuromuscular: fatigueState.dimensions.neuromuscular,
      metabolic: fatigueState.dimensions.metabolic,
      cumulative: fatigueState.dimensions.cumulative,
      psychological: fatigueState.dimensions.psychological,
    },
    trajectory: fatigueState.trajectory,
    consecutiveAccumulationDays: fatigueState.consecutiveAccumulationDays,
    dominantDimension: fatigueState.dominantDimension,
    primaryLimitingFactor: fatigueState.primaryLimitingFactor,
    trainingCapacity: fatigueState.trainingCapacity,
    estimatedTimeToFresh: fatigueState.estimatedTimeToFresh,
    performanceImpairmentEstimate: fatigueState.performanceImpairmentEstimate,
    signals: {
      functionalOverreachingRisk: signals.functionalOverreachingRisk,
      isAccumulating: signals.isAccumulating,
    },
    decision: {
      verdict: decision.verdict,
      trainingCapacity: decision.trainingCapacity,
      rationale: [...decision.rationale],
    },
    recommendation: {
      type: recommendation.type,
      keyEvidence: [...recommendation.keyEvidence],
      confidence: recommendation.confidence,
    },
    computedAt: computedAt.toISOString(),
  };
}

function formatAdaptationResult(result: AdaptationInferenceResult): AdaptationData {
  const { output, computedAt } = result;
  const { adaptationState, recommendation, signals, decision } = output;

  return {
    adaptationIndex: adaptationState.adaptationIndex,
    adaptationStatus: adaptationState.adaptationStatus,
    adaptationTrend: adaptationState.adaptationTrend,
    confidence: adaptationState.confidence,
    dimensions: {
      loadProgression: adaptationState.dimensions.loadProgression,
      neuromuscularEfficiency: adaptationState.dimensions.neuromuscularEfficiency,
      autonomicAdaptation: adaptationState.dimensions.autonomicAdaptation,
      recoveryQuality: adaptationState.dimensions.recoveryQuality,
    },
    limitingFactor: adaptationState.limitingFactor,
    estimatedAdaptationPeak: adaptationState.estimatedAdaptationPeak,
    plateauRisk: adaptationState.plateauRisk,
    overreachingWithoutAdaptationDetected: adaptationState.overreachingWithoutAdaptationDetected,
    signals: {
      availableDimensionCount: signals.availableDimensionCount,
      historyLength: signals.historyLength,
    },
    decision: {
      verdict: decision.verdict,
      loadMultiplier: decision.loadMultiplier,
      rationale: [...decision.rationale],
    },
    recommendation: {
      type: recommendation.type,
      keyEvidence: [...recommendation.keyEvidence],
    },
    computedAt: computedAt.toISOString(),
  };
}

function formatReasoningResult(result: ReasoningInferenceResult): ReasoningData {
  const { output, computedAt } = result;
  const { reasoningState, signals } = output;

  return {
    overallVerdict: reasoningState.overallVerdict,
    systemAttentionPriority: reasoningState.systemAttentionPriority,
    physiologicalConsistency: reasoningState.physiologicalConsistency,
    consistencyScore: reasoningState.consistencyScore,
    confidence: reasoningState.confidence,
    dataCompleteness: reasoningState.dataCompleteness,
    keyFindings: reasoningState.keyFindings as ReasoningData['keyFindings'],
    limitingFactor: reasoningState.limitingFactor,
    opportunities: reasoningState.opportunities as ReasoningData['opportunities'],
    conflicts: reasoningState.conflicts as ReasoningData['conflicts'],
    topAction: reasoningState.topAction,
    evidenceGraph: reasoningState.evidenceGraph,
    signals: {
      availableModelCount: signals.availableModelCount,
      hasRecoveryState: signals.hasRecoveryState,
      hasFatigueState: signals.hasFatigueState,
      hasAdaptationState: signals.hasAdaptationState,
      modelDirections: signals.modelDirections,
    },
    computedAt: computedAt.toISOString(),
  };
}

function formatDecisionResult(result: ReasoningInferenceResult): DecisionData {
  return serializeDecisionState(result.output.decisionState);
}

async function loadRecoveryState(
  athleteId: string,
  trainingDayId: string,
  forceRefresh: boolean,
): Promise<RecoveryData | null> {
  try {
    if (!forceRefresh) {
      const cached = await recoveryEngine.getLatest(athleteId, trainingDayId);
      if (cached) {
        return formatRecoveryResult(cached);
      }
    }
    const result = await recoveryEngine.run(athleteId, trainingDayId);
    return formatRecoveryResult(result);
  } catch (error) {
    console.error('[today-state-server/recovery]', error);
    return null;
  }
}

async function loadFatigueState(
  athleteId: string,
  trainingDayId: string,
  forceRefresh: boolean,
): Promise<FatigueData | null> {
  try {
    if (!forceRefresh) {
      const cached = await fatigueEngine.getLatest(athleteId, trainingDayId);
      if (cached) {
        return formatFatigueResult(cached);
      }
    }
    const result = await fatigueEngine.run(athleteId, trainingDayId);
    return formatFatigueResult(result);
  } catch (error) {
    console.error('[today-state-server/fatigue]', error);
    return null;
  }
}

async function loadAdaptationState(
  athleteId: string,
  trainingDayId: string,
  forceRefresh: boolean,
): Promise<AdaptationData | null> {
  try {
    if (!forceRefresh) {
      const cached = await adaptationEngine.getLatest(athleteId, trainingDayId);
      if (cached) {
        return formatAdaptationResult(cached);
      }
    }
    const result = await adaptationEngine.run(athleteId, trainingDayId);
    return formatAdaptationResult(result);
  } catch (error) {
    console.error('[today-state-server/adaptation]', error);
    return null;
  }
}

async function fetchDailyStrainDependencies(athleteId: string, trainingDayId: string) {
  return Promise.all([
    featureEngine.getDayFeatures(athleteId, trainingDayId),
    prisma.activity.findMany({
      where: {
        athleteId,
        ...visibleActivityWhere,
        date: approximateTrainingDayUtcRange(trainingDayId),
      },
      include: {
        runMetrics: true,
        bikeMetrics: true,
        swimMetrics: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.athleteProfile.findUnique({ where: { id: athleteId } }),
    prisma.googleAccount.findUnique({ where: { athleteId }, select: { timeZone: true } }),
    prisma.dailyHealth.findUnique({
      where: {
        athleteId_date: { athleteId, date: new Date(`${trainingDayId}T00:00:00.000Z`) },
      },
    }),
  ] as const);
}

function healthSignalsFromEntry(
  healthEntry: Awaited<ReturnType<typeof prisma.dailyHealth.findUnique>>,
) {
  if (!healthEntry) {
    return null;
  }
  return {
    calories: healthEntry.calories,
    recoveryScore: healthEntry.recoveryScore,
    stress: healthEntry.stress,
    bodyBattery: healthEntry.bodyBattery,
    totalSteps: healthEntry.totalSteps,
    restingHr: healthEntry.restingHr,
    hrv: healthEntry.hrv,
  };
}

function restingHrFromFeatures(
  features: Awaited<ReturnType<typeof featureEngine.getDayFeatures>>,
): number | null {
  if (features.recovery === 'PENDING') {
    return null;
  }
  return features.recovery.rhrAbsolute ?? null;
}

function strainThresholdsFromProfile(
  athleteProfile: Awaited<ReturnType<typeof prisma.athleteProfile.findUnique>>,
  features: Awaited<ReturnType<typeof featureEngine.getDayFeatures>>,
) {
  return {
    ftpW: athleteProfile?.ftpW ?? null,
    maxHr: athleteProfile?.maxHr ?? null,
    lthr: athleteProfile?.lthr ?? null,
    restingHr: restingHrFromFeatures(features),
  };
}

async function loadDailyStrainState(
  athleteId: string,
  trainingDayId: string,
): Promise<DailyStrainData | null> {
  try {
    const [features, activities, athleteProfile, googleAccount, healthEntry] =
      await fetchDailyStrainDependencies(athleteId, trainingDayId);
    const trainingDayOptions = {
      timezone: googleAccount?.timeZone ?? DEFAULT_TRAINING_DAY_TIMEZONE,
      trainingDayStartHour: DEFAULT_TRAINING_DAY_START_HOUR,
    };
    const filteredActivities = activities.filter((activity) =>
      activityMatchesTrainingDay(activity.date, trainingDayId, trainingDayOptions),
    );

    return computeDailyStrain({
      sessionFeatures: features.sessions,
      legacyActivities: filteredActivities,
      healthSignals: healthSignalsFromEntry(healthEntry),
      thresholds: strainThresholdsFromProfile(athleteProfile, features),
    });
  } catch (error) {
    console.error('[today-state-server/daily-strain]', error);
    return null;
  }
}

async function loadEnvironmentState(
  athleteId: string,
  trainingDayId: string,
  forceRefresh: boolean,
): Promise<EnvironmentSnapshotData | null> {
  try {
    if (!forceRefresh) {
      const cached = await environmentEngine.getLatest(athleteId, trainingDayId);
      if (cached) {
        return formatEnvironmentResult(cached);
      }
    }
    const result = await environmentEngine.run(athleteId, trainingDayId, { forceRefresh });
    return formatEnvironmentResult(result);
  } catch (error) {
    console.error('[today-state-server/environment]', error);
    return null;
  }
}

function formatEnvironmentResult(
  result: EnvironmentInferenceResult,
): EnvironmentalDecisionSnapshot {
  return buildEnvironmentalDecisionSnapshot({
    stress: result.output.stress,
    impact: result.output.impact,
    meta: result.output.meta,
  });
}

async function loadPhysicalHealthState(
  athleteId: string,
  trainingDayId: string,
  forceRefresh: boolean,
): Promise<PhysicalHealthData | null> {
  try {
    if (!forceRefresh) {
      const cached = await physicalHealthEngine.getLatest(athleteId, trainingDayId);
      if (cached) {
        return formatPhysicalHealthResult(cached);
      }
    }
    const result = await physicalHealthEngine.run(athleteId, trainingDayId);
    return formatPhysicalHealthResult(result);
  } catch (error) {
    console.error('[today-state-server/physical-health]', error);
    return null;
  }
}

function formatPhysicalHealthResult(result: PhysicalHealthInferenceResult): PhysicalHealthData {
  const { output, computedAt } = result;
  const { physicalHealthState, signals, decision, recommendation } = output;

  return {
    conditions: physicalHealthState.conditions.map((c) => ({
      conditionId: c.conditionId,
      label: c.label,
      bodyRegion: c.bodyRegion,
      side: c.side,
      type: c.type,
      affectsTraining: c.affectsTraining,
      severity: c.severity,
      status: c.status,
      trend: c.trend,
      confidence: c.confidence,
      functionalCapacity: c.functionalCapacity,
      estimatedRecoveryDays: c.estimatedRecoveryDays,
      evidenceObservationIds: [...c.evidenceObservationIds],
    })),
    activeConditionCount: physicalHealthState.activeConditionCount,
    aggregateTrainingCapacity: physicalHealthState.aggregateTrainingCapacity,
    primaryLimitingConditionId: physicalHealthState.primaryLimitingConditionId,
    trainingBlockedByCondition: physicalHealthState.trainingBlockedByCondition,
    confidence: physicalHealthState.confidence,
    dataCompleteness: physicalHealthState.dataCompleteness,
    decision: {
      verdict: decision.verdict,
      rationale: [...decision.rationale],
    },
    recommendation: {
      trainingCapacity: recommendation.trainingCapacity,
      confidence: recommendation.confidence,
      evidence: [...recommendation.evidence],
    },
    signals: {
      activeConditionCount: signals.activeConditionCount,
      maxSeverity: signals.maxSeverity,
      improvingCount: signals.improvingCount,
      worseningCount: signals.worseningCount,
      recurrentCount: signals.recurrentCount,
    },
    computedAt: computedAt.toISOString(),
  };
}

async function isCachedReasoningUsable(
  athleteId: string,
  cached: ReasoningInferenceResult,
): Promise<boolean> {
  const cachedHasI18nTopAction = isSet(cached.output.reasoningState.topAction?.verbCode);
  if (cached.output.reasoningState.overallVerdict === 'INSUFFICIENT_DATA') {
    return false;
  }
  if (!cachedHasI18nTopAction) {
    return false;
  }
  return !(await isReasoningStale(athleteId, cached.computedAt));
}

async function loadReasoningState(
  athleteId: string,
  trainingDayId: string,
  forceRefresh: boolean,
): Promise<{ reasoning: ReasoningData | null; decision: DecisionData | null }> {
  try {
    if (!forceRefresh) {
      const cached = await reasoningEngine.getLatest(athleteId, trainingDayId);
      if (cached && (await isCachedReasoningUsable(athleteId, cached))) {
        return {
          reasoning: formatReasoningResult(cached),
          decision: formatDecisionResult(cached),
        };
      }
    }

    const result = await reasoningEngine.run(athleteId, trainingDayId);
    return {
      reasoning: formatReasoningResult(result),
      decision: formatDecisionResult(result),
    };
  } catch (error) {
    console.error('[today-state-server/reasoning]', error);
    return { reasoning: null, decision: null };
  }
}

export async function loadTodayState(params: {
  athleteId: string;
  trainingDayId: string;
  forceRefresh?: boolean;
}): Promise<TodayState> {
  const { athleteId, trainingDayId, forceRefresh = false } = params;

  const physicalHealth = await loadPhysicalHealthState(athleteId, trainingDayId, forceRefresh);
  const environment = await loadEnvironmentState(athleteId, trainingDayId, forceRefresh);

  const [recovery, fatigue, adaptation, dailyStrain] = await Promise.all([
    loadRecoveryState(athleteId, trainingDayId, forceRefresh),
    loadFatigueState(athleteId, trainingDayId, forceRefresh),
    loadAdaptationState(athleteId, trainingDayId, forceRefresh),
    loadDailyStrainState(athleteId, trainingDayId),
  ]);

  const { reasoning, decision } = await loadReasoningState(athleteId, trainingDayId, forceRefresh);

  return {
    reasoning,
    decision,
    recovery,
    fatigue,
    adaptation,
    physicalHealth,
    environment,
    dailyStrain,
  };
}
