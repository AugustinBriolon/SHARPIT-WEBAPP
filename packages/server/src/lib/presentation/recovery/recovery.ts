import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AthleteSnapshot } from '@sharpit/app/athlete-state/snapshot';
import type { RecoveryViewModel } from '@sharpit/app/presentation/recovery-view-model';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { getHealthEntries } from '@sharpit/server/lib/queries';
import {
  buildDailyWindowSeries,
  getIndexedHealthEntry,
  indexHealthEntriesByDay,
} from '@sharpit/app/lib/health/health';
import { resolve } from '@sharpit/app/lib/french';
import {
  resolveLimiterSignal,
  type LimiterSignalCode,
} from '@sharpit/app/lib/today/dashboard/limiter-signal';

type DailyHealthRow = Awaited<ReturnType<typeof getHealthEntries>>[number];
import {
  mapAutonomicBalanceToDisplay,
  mapConfidenceToTier,
  mapLoadStressContextToDisplay,
  mapRecoveryIntensityLabel,
  mapRecoveryToSignal,
  mapScoreToColorClass,
  mapSubjectiveWellnessToDisplay,
  type AutonomicBalance,
  type LoadStressContext,
  type ReadinessCategory,
  type RecommendedIntensity,
  type SubjectiveWellness,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import { buildRecoveryPageInsights } from '@sharpit/server/lib/product-insight/recovery-page-insights';
import { buildGlobalDecisionContext } from '@sharpit/server/lib/decision/global-decision-context';
import { EMPTY_GLOBAL_DECISION } from '@sharpit/app/presentation/global-decision-context';

const PRIMARY_LIMITER_LABEL: Record<string, string> = {
  autonomic: 'Système nerveux autonome',
  sleep: 'Qualité du sommeil',
  subjective: 'Bien-être subjectif',
  loadContext: 'Contexte de charge',
};

const COMPLETENESS_LABEL: Record<string, string> = {
  FULL: 'Complètes',
  PARTIAL: 'Partielles',
  SPARSE: 'Éparses',
  INSUFFICIENT: 'Insuffisantes',
};

const RISK_DISPLAY: Record<string, { label: string; colorClass: string } | undefined> = {
  MODERATE: { label: 'Risque modéré', colorClass: 'text-signal-caution' },
  HIGH: { label: 'Risque élevé', colorClass: 'text-signal-vo2' },
  CRITICAL: { label: 'Risque critique', colorClass: 'text-signal-risk' },
};

const ILLNESS_RISK_DISPLAY: Record<string, { label: string; colorClass: string } | undefined> = {
  ELEVATED: { label: 'Récupération atypique', colorClass: 'text-signal-caution' },
  HIGH: { label: 'Récupération atypique marquée', colorClass: 'text-signal-risk' },
};

const CONFIDENCE_TONE = {
  high: 'good',
  medium: 'warn',
  low: 'neutral',
} as const;

function chipClass(colorClass: string): string {
  return colorClass.split(' ')[0] ?? colorClass;
}

function isSleepLimiterPending(snapshot: AthleteSnapshot) {
  const sleepFreshness =
    snapshot.freshness.domains.find((d) => d.domain === 'sleep')?.freshness ?? null;
  return (
    sleepFreshness === 'awaiting_data' ||
    sleepFreshness === 'syncing' ||
    sleepFreshness === 'computing'
  );
}

function resolveRecoveryLimiterLabel(
  snapshot: AthleteSnapshot,
  recovery: NonNullable<AthleteSnapshot['recovery']>,
): string | null {
  if (!recovery.primaryLimitingFactor) {
    return null;
  }
  if (isSleepLimiterPending(snapshot) && recovery.primaryLimitingFactor === 'sleep') {
    return null;
  }
  return PRIMARY_LIMITER_LABEL[recovery.primaryLimitingFactor] ?? recovery.primaryLimitingFactor;
}

function resolveRecoveryLimiterSignal(
  snapshot: AthleteSnapshot,
  recovery: NonNullable<AthleteSnapshot['recovery']>,
  todayEntry: DailyHealthRow | null,
): LimiterSignalCode | null {
  if (!recovery.primaryLimitingFactor) {
    return null;
  }
  if (isSleepLimiterPending(snapshot) && recovery.primaryLimitingFactor === 'sleep') {
    return null;
  }
  return (
    resolveLimiterSignal({
      primaryLimitingFactor: recovery.primaryLimitingFactor,
      hints: todayEntry
        ? {
            hrv: todayEntry.hrv,
            hrvBaselineLow: todayEntry.hrvBaselineLow,
            hrvBaselineHigh: todayEntry.hrvBaselineHigh,
            hrvStatus: todayEntry.hrvStatus,
            restingHr: todayEntry.restingHr,
            sleepMinutes: todayEntry.sleepMinutes,
            sleepDeepMin: todayEntry.sleepDeepMin,
            sleepRemMin: todayEntry.sleepRemMin,
          }
        : null,
    })?.code ?? null
  );
}

function resolveRecoverySignalPresentation(recovery: NonNullable<AthleteSnapshot['recovery']>) {
  const autonomicDisplay = mapAutonomicBalanceToDisplay(
    recovery.signals.autonomicBalance as AutonomicBalance,
  );
  const wellnessDisplay = mapSubjectiveWellnessToDisplay(
    recovery.signals.subjectiveWellness as SubjectiveWellness,
  );
  const loadDisplay = mapLoadStressContextToDisplay(
    recovery.signals.loadStressContext as LoadStressContext,
  );
  const confidencePct = Math.round(recovery.confidence * 100);
  const confidenceTier = mapConfidenceToTier(recovery.confidence);
  const intensityLabel = mapRecoveryIntensityLabel(
    recovery.decision.recommendedIntensity as RecommendedIntensity,
  );

  return {
    autonomicDisplay,
    wellnessDisplay,
    loadDisplay,
    confidencePct,
    confidenceTone: CONFIDENCE_TONE[confidenceTier] ?? 'neutral',
    completenessLabel: COMPLETENESS_LABEL[recovery.dataCompleteness] ?? recovery.dataCompleteness,
    intensityLabel,
  };
}

function readTodayHealthEntry(todayEntry: DailyHealthRow | null) {
  if (!todayEntry) {
    return {
      baselineLow: null,
      baselineHigh: null,
      hrv: null,
      restingHr: null,
      bodyBattery: null,
    };
  }
  return {
    baselineLow: todayEntry.hrvBaselineLow,
    baselineHigh: todayEntry.hrvBaselineHigh,
    hrv: todayEntry.hrv,
    restingHr: todayEntry.restingHr,
    bodyBattery: todayEntry.bodyBattery,
  };
}

function buildPopulatedRecoveryViewModel(input: {
  snapshot: AthleteSnapshot;
  recovery: NonNullable<AthleteSnapshot['recovery']>;
  todayEntry: DailyHealthRow | null;
  healthSeries: ReturnType<typeof loadRecoveryHealthSeries>;
}): RecoveryViewModel {
  const { snapshot, recovery, todayEntry, healthSeries } = input;
  const signal = mapRecoveryToSignal(recovery.readinessCategory as ReadinessCategory);
  const presentation = resolveRecoverySignalPresentation(recovery);
  const limiterLabel = resolveRecoveryLimiterLabel(snapshot, recovery);
  const limiterSignal = resolveRecoveryLimiterSignal(snapshot, recovery, todayEntry);
  const rationale = recovery.decision.rationale.map((r) => resolve(r));
  const keyEvidence = recovery.recommendation.keyEvidence.map((e) => resolve(e));
  const todayHealth = readTodayHealthEntry(todayEntry);
  const insights = buildRecoveryPageInsights({
    autonomicLabel: presentation.autonomicDisplay.label,
    confidence: recovery.confidence,
    dissonanceDetected: recovery.signals.dissonanceDetected,
    estimatedRecoveryDays: recovery.estimatedTimeToFullRecovery,
    illnessLabel: ILLNESS_RISK_DISPLAY[recovery.signals.illnessRisk]?.label ?? null,
    keyEvidence,
    limitingFactorLabel: limiterLabel,
    loadLabel: presentation.loadDisplay.label,
    overreachingLabel: RISK_DISPLAY[recovery.signals.overreachingRisk]?.label ?? null,
    rationale,
    readinessScore: recovery.readinessScore,
    recommendedIntensityLabel: presentation.intensityLabel,
    wellnessLabel: presentation.wellnessDisplay.label,
  });

  return {
    readinessScore: recovery.readinessScore,
    signal,
    limiterLabel,
    limiterSignal,
    estimatedRecoveryDays: recovery.estimatedTimeToFullRecovery,
    isCalibrating: recovery.readinessCategory === 'BASELINE_PENDING',
    availableDimCount: Object.values(recovery.dimensions).filter((d) => d.available).length,
    dimensions: recovery.dimensions,
    intensityLabel: presentation.intensityLabel,
    intensityClassName: mapScoreToColorClass(recovery.readinessScore),
    rationale,
    autonomicLabel: presentation.autonomicDisplay.label,
    autonomicClass: chipClass(presentation.autonomicDisplay.colorClass),
    wellnessLabel: presentation.wellnessDisplay.label,
    wellnessClass: chipClass(presentation.wellnessDisplay.colorClass),
    loadLabel: presentation.loadDisplay.label,
    loadClass: chipClass(presentation.loadDisplay.colorClass),
    dissonanceDetected: recovery.signals.dissonanceDetected,
    sparkHrv: healthSeries.sparkHrv,
    sparkRhr: healthSeries.sparkRhr,
    dualData: healthSeries.dualData,
    ...todayHealth,
    confidencePct: presentation.confidencePct,
    confidenceTone: presentation.confidenceTone,
    completenessLabel: presentation.completenessLabel,
    overreaching: RISK_DISPLAY[recovery.signals.overreachingRisk],
    illness: ILLNESS_RISK_DISPLAY[recovery.signals.illnessRisk],
    keyEvidence,
    insights,
    globalDecision: buildGlobalDecisionContext(snapshot, 'RECOVERY'),
    emptyState: null,
    hierarchy: {
      rootId: 'recovery',
      order: ['hero', 'decision', 'signals', 'insights', 'evidence'],
    },
    sections: [],
  };
}

function loadRecoveryHealthSeries(healthByDay: Map<string, DailyHealthRow>, refDate: Date) {
  return {
    sparkHrv: buildDailyWindowSeries(
      healthByDay,
      14,
      (d, e) => ({
        date: format(d, 'dd MMM', { locale: fr }),
        value: e?.hrv ?? null,
      }),
      refDate,
    ),
    sparkRhr: buildDailyWindowSeries(
      healthByDay,
      14,
      (d, e) => ({
        date: format(d, 'dd MMM', { locale: fr }),
        value: e?.restingHr ?? null,
      }),
      refDate,
    ),
    dualData: buildDailyWindowSeries(
      healthByDay,
      14,
      (d, e) => ({
        date: format(d, 'dd MMM', { locale: fr }),
        a: e?.bodyBattery ?? null,
        b: e?.stress ?? null,
      }),
      refDate,
    ),
  };
}

function emptyRecoveryViewModel(): RecoveryViewModel {
  return {
    readinessScore: null,
    signal: { label: '—', qualityClass: 'text-muted-foreground', arrow: '→' },
    limiterLabel: null,
    limiterSignal: null,
    estimatedRecoveryDays: null,
    isCalibrating: false,
    availableDimCount: 0,
    dimensions: {} as RecoveryViewModel['dimensions'],
    intensityLabel: '—',
    intensityClassName: mapScoreToColorClass(null),
    rationale: [],
    autonomicLabel: '—',
    autonomicClass: 'text-muted-foreground',
    wellnessLabel: '—',
    wellnessClass: 'text-muted-foreground',
    loadLabel: '—',
    loadClass: 'text-muted-foreground',
    dissonanceDetected: false,
    sparkHrv: [],
    sparkRhr: [],
    dualData: [],
    baselineLow: null,
    baselineHigh: null,
    hrv: null,
    restingHr: null,
    bodyBattery: null,
    confidencePct: 0,
    confidenceTone: 'neutral',
    completenessLabel: '—',
    keyEvidence: [],
    insights: { primary: [], supporting: [], contextual: [] },
    globalDecision: EMPTY_GLOBAL_DECISION,
    overreaching: undefined,
    illness: undefined,
    emptyState: {
      title: 'Données de récupération indisponibles.',
      description: 'Reessaie plus tard ou synchronise tes donnees.',
    },
    hierarchy: {
      rootId: 'recovery',
      order: ['hero', 'decision', 'signals', 'insights', 'evidence'],
    },
    sections: [],
  };
}

export async function buildRecoveryViewModel(
  athleteId: string,
  trainingDayId: string,
): Promise<RecoveryViewModel> {
  const snapshot: AthleteSnapshot = await getOrBuildAthleteSnapshot(athleteId, trainingDayId);
  const { recovery } = snapshot;

  if (!recovery) {
    return emptyRecoveryViewModel();
  }

  const refDate = new Date(`${trainingDayId}T12:00:00.000Z`);
  const healthEntries = await getHealthEntries(athleteId, 14, refDate);
  const healthByDay = indexHealthEntriesByDay<DailyHealthRow>(healthEntries);
  const todayEntry = getIndexedHealthEntry(healthByDay, refDate);
  const healthSeries = loadRecoveryHealthSeries(healthByDay, refDate);

  return buildPopulatedRecoveryViewModel({
    snapshot,
    recovery,
    todayEntry,
    healthSeries,
  });
}
