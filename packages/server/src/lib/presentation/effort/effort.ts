import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import {
  computeTrainingLoad,
  enrichFatigueLoadDimension,
} from '@sharpit/server/lib/training/load/training-load';
import { slicePmcWindow } from '@sharpit/app/lib/training/pmc/pmc';
import type { PmcPoint } from '@sharpit/app/lib/training/pmc/pmc-history';
import {
  loadAthletePmcPoints,
  loadDailyTrainingStressEntries,
} from '@sharpit/server/lib/training/pmc/pmc-server';
import { resolve } from '@sharpit/app/lib/french';
import {
  mapConfidenceToTier,
  mapFatigueTypeToLabel,
  type FatigueType,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import { buildEffortPageInsights } from '@sharpit/server/lib/product-insight/effort-page-insights';
import { buildGlobalDecisionContext } from '@sharpit/server/lib/decision/global-decision-context';
import { EMPTY_GLOBAL_DECISION } from '@sharpit/app/presentation/global-decision-context';
import type { EffortViewModel } from '@sharpit/app/presentation/effort-view-model';
import { buildEffortStrainComposition } from '@sharpit/app/lib/presentation/effort/effort-strain-composition';
import {
  CHART_CAUTION_STROKE,
  CHART_RISK_STROKE,
  CHART_TEMPO_STROKE,
  CHART_TICK_COLOR,
  CHART_VO2_STROKE,
} from '@sharpit/app/lib/theme/chart-theme';

const OVERREACHING_RISK_DISPLAY: Record<string, { label: string; colorClass: string } | undefined> =
  {
    MODERATE: { label: 'Risque modéré', colorClass: 'text-signal-caution' },
    HIGH: { label: 'Risque élevé', colorClass: 'text-signal-vo2' },
    CRITICAL: { label: 'Risque critique', colorClass: 'text-signal-risk' },
  };

const FATIGUE_VERDICT_DISPLAY: Record<string, { label: string; colorClass: string }> = {
  BUILD: { label: 'Progresser', colorClass: 'text-primary' },
  MAINTAIN: { label: 'Maintenir', colorClass: 'text-[var(--color-signal-recovery)]' },
  REDUCE: { label: 'Réduire la charge', colorClass: 'text-signal-caution' },
  REST_WEEK: {
    label: 'Semaine de récupération',
    colorClass: 'text-signal-vo2',
  },
  TAPER: { label: 'Affûtage', colorClass: 'text-[var(--color-signal-recovery)]' },
  INSUFFICIENT_DATA: { label: 'Données insuffisantes', colorClass: 'text-muted-foreground' },
};

const COMPLETENESS_LABEL: Record<string, string> = {
  FULL: 'Complètes',
  PARTIAL: 'Partielles',
  SPARSE: 'Éparses',
  INSUFFICIENT: 'Insuffisantes',
};

const CONFIDENCE_TONE = {
  high: 'good',
  medium: 'warn',
  low: 'neutral',
} as const;

const DOMINANT_DIMENSION_LABEL: Record<string, string> = {
  LOAD: 'Charge excessive',
  NEUROMUSCULAR: 'Fatigue neuromusculaire',
  METABOLIC: 'Fatigue métabolique',
  CUMULATIVE: 'Accumulation chronique',
  PSYCHOLOGICAL: 'Fatigue psychologique',
  load: 'Charge excessive',
  neuromuscular: 'Fatigue neuromusculaire',
  metabolic: 'Fatigue métabolique',
  cumulative: 'Accumulation chronique',
  psychological: 'Fatigue psychologique',
};

const DOMINANT_DIMENSION_LABEL_LOW: Record<string, string> = {
  LOAD: 'Charge actuelle',
  NEUROMUSCULAR: 'Neuromusculaire',
  METABOLIC: 'Métabolique',
  CUMULATIVE: 'Historique de charge',
  PSYCHOLOGICAL: 'Psychologique',
  load: 'Charge actuelle',
  neuromuscular: 'Neuromusculaire',
  metabolic: 'Métabolique',
  cumulative: 'Historique de charge',
  psychological: 'Psychologique',
};

function mapStrainToDisplay(strainScore: number | null) {
  if (strainScore === undefined || strainScore === null) {
    return {
      label: 'Indéterminé',
      colorClass: 'text-muted-foreground',
      strokeColor: CHART_TICK_COLOR,
    };
  }
  if (strainScore >= 16) {
    return {
      label: 'Charge très élevée',
      colorClass: 'text-signal-risk',
      strokeColor: CHART_RISK_STROKE,
    };
  }
  if (strainScore >= 11) {
    return {
      label: 'Charge élevée',
      colorClass: 'text-signal-vo2',
      strokeColor: CHART_VO2_STROKE,
    };
  }
  if (strainScore >= 6) {
    return {
      label: 'Charge modérée',
      colorClass: 'text-signal-caution',
      strokeColor: CHART_CAUTION_STROKE,
    };
  }
  if (strainScore > 0) {
    return {
      label: 'Charge légère',
      colorClass: 'text-[var(--color-signal-recovery)]',
      strokeColor: CHART_TEMPO_STROKE,
    };
  }
  return { label: 'Repos', colorClass: 'text-muted-foreground', strokeColor: CHART_TICK_COLOR };
}

function buildWeeklyTssSeries(
  refDate: Date,
  dailyStress: Awaited<ReturnType<typeof loadDailyTrainingStressEntries>>,
) {
  const weeklyTss: { week: string; tss: number }[] = [];
  for (let w = 7; w >= 0; w -= 1) {
    const weekStart = new Date(refDate);
    weekStart.setDate(refDate.getDate() - w * 7 - 6);
    const weekEnd = new Date(refDate);
    weekEnd.setDate(refDate.getDate() - w * 7);
    const total = dailyStress
      .filter((entry) => entry.date >= weekStart && entry.date <= weekEnd)
      .reduce((sum, entry) => sum + entry.load, 0);
    weeklyTss.push({ week: w === 0 ? 'Cette sem.' : `S-${w}`, tss: Math.round(total) });
  }
  return weeklyTss;
}

function resolveDominantDimensionLabel(dominantDimension: string | null, isLowFatigue: boolean) {
  if (!dominantDimension) {
    return null;
  }
  const map = isLowFatigue ? DOMINANT_DIMENSION_LABEL_LOW : DOMINANT_DIMENSION_LABEL;
  return map[dominantDimension] ?? dominantDimension;
}

function resolveFatigueTypeLabel(fatigueType: string | null | undefined) {
  if (!fatigueType || fatigueType === 'UNDETERMINED') {
    return null;
  }
  return mapFatigueTypeToLabel(fatigueType as FatigueType);
}

function computeEffortWeeklyStats(
  trainingLoad: ReturnType<typeof computeTrainingLoad>,
  pmcSeries: PmcPoint[],
  weeklyTss: ReturnType<typeof buildWeeklyTssSeries>,
) {
  const avgWeeklyTss =
    weeklyTss.length > 0
      ? Math.round(weeklyTss.reduce((s, w) => s + w.tss, 0) / weeklyTss.length)
      : 0;
  const chronicWeeklyAvg =
    trainingLoad.acwr > 0 ? Math.round(trainingLoad.weeklyLoad / trainingLoad.acwr) : null;
  const lastTsb = pmcSeries.length > 0 ? (pmcSeries[pmcSeries.length - 1]?.tsb ?? null) : null;
  return { avgWeeklyTss, chronicWeeklyAvg, lastTsb };
}

function resolveEffortDerivedMetrics(input: {
  fatigue: NonNullable<Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>['fatigue']>;
  trainingLoad: ReturnType<typeof computeTrainingLoad>;
  pmcSeries: PmcPoint[];
  weeklyTss: ReturnType<typeof buildWeeklyTssSeries>;
}) {
  const { fatigue, trainingLoad, pmcSeries, weeklyTss } = input;
  const weeklyStats = computeEffortWeeklyStats(trainingLoad, pmcSeries, weeklyTss);
  const performancePercent =
    fatigue.performanceImpairmentEstimate > 0
      ? Math.round((1 - fatigue.performanceImpairmentEstimate) * 100)
      : null;
  const verdictDisplay =
    FATIGUE_VERDICT_DISPLAY[fatigue.decision.verdict] ?? FATIGUE_VERDICT_DISPLAY.INSUFFICIENT_DATA;
  const confidenceTier = mapConfidenceToTier(fatigue.confidence);
  const isLowFatigue =
    fatigue.fatigueLevel === 'FRESH' || fatigue.fatigueLevel === 'FUNCTIONAL_LOW';
  const dimensions = enrichFatigueLoadDimension(fatigue.dimensions, trainingLoad.acwr);

  return {
    fatigueTypeLabel: resolveFatigueTypeLabel(fatigue.fatigueType),
    performancePercent,
    verdictDisplay,
    confidencePct: Math.round(fatigue.confidence * 100),
    confidenceTone: (CONFIDENCE_TONE[confidenceTier] ??
      'neutral') as EffortViewModel['confidenceTone'],
    completenessLabel: COMPLETENESS_LABEL[fatigue.dataCompleteness] ?? fatigue.dataCompleteness,
    isLowFatigue,
    dimensions,
    availableDimCount: Object.values(dimensions).filter((d) => d.available).length,
    ...weeklyStats,
  };
}

function buildPopulatedEffortViewModel(input: {
  snapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>;
  fatigue: NonNullable<Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>['fatigue']>;
  dailyStrain: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>['dailyStrain'];
  trainingLoad: ReturnType<typeof computeTrainingLoad>;
  pmcSeries: PmcPoint[];
  weeklyTss: ReturnType<typeof buildWeeklyTssSeries>;
  dailyLoad: number;
  strainScore: number | null;
  strainDisplay: ReturnType<typeof mapStrainToDisplay>;
}): EffortViewModel {
  const {
    snapshot,
    fatigue,
    dailyStrain,
    trainingLoad,
    pmcSeries,
    weeklyTss,
    dailyLoad,
    strainScore,
    strainDisplay,
  } = input;
  const metrics = resolveEffortDerivedMetrics({ fatigue, trainingLoad, pmcSeries, weeklyTss });
  const rationale = fatigue.decision.rationale.map((r) => resolve(r));
  const keyEvidence = fatigue.recommendation.keyEvidence.map((e) => resolve(e));
  const dominantDimensionLabel = resolveDominantDimensionLabel(
    fatigue.dominantDimension,
    metrics.isLowFatigue,
  );
  const limitingFactorLabel = fatigue.primaryLimitingFactor
    ? resolve({ code: fatigue.primaryLimitingFactor })
    : null;
  const insights = buildEffortPageInsights({
    acwr: trainingLoad.acwr,
    confidence: fatigue.confidence,
    dominantDimension: dominantDimensionLabel,
    estimatedDaysToFresh: fatigue.estimatedTimeToFresh,
    fatigueType: fatigue.fatigueType as FatigueType,
    keyEvidence,
    overreachingLabel:
      OVERREACHING_RISK_DISPLAY[fatigue.signals.functionalOverreachingRisk]?.label ?? null,
    performancePercent: metrics.performancePercent,
    primaryLimitingFactor: limitingFactorLabel,
    rationale,
    strainScore,
    trainingCapacity: fatigue.trainingCapacity,
    tsb: metrics.lastTsb,
    verdictLabel: metrics.verdictDisplay.label,
    weeklyLoad: trainingLoad.weeklyLoad,
  });
  const overreaching = OVERREACHING_RISK_DISPLAY[fatigue.signals.functionalOverreachingRisk];

  return {
    strainScore,
    dailyLoad,
    weeklyLoad: trainingLoad.weeklyLoad,
    strainComposition: buildEffortStrainComposition(dailyStrain),
    fatigueType: fatigue.fatigueType,
    fatigueTypeLabel: metrics.fatigueTypeLabel,
    performancePercent: metrics.performancePercent,
    consecutiveDays: fatigue.consecutiveAccumulationDays,
    estimatedDaysToFresh: fatigue.estimatedTimeToFresh,
    acwr: trainingLoad.acwr,
    chronicWeeklyAvg: metrics.chronicWeeklyAvg,
    tsb: metrics.lastTsb,
    confidencePct: metrics.confidencePct,
    confidenceTone: metrics.confidenceTone,
    verdict: metrics.verdictDisplay.label,
    verdictClass: metrics.verdictDisplay.colorClass,
    verdictKey: fatigue.decision.verdict,
    rationale,
    trainingCapacity: fatigue.trainingCapacity,
    strainSubtitle: '',
    strainStatusLabel: strainDisplay.label,
    strainStatusClassName: strainDisplay.colorClass,
    strainStrokeColor: strainDisplay.strokeColor,
    dimensions: metrics.dimensions,
    missingDimCount: 5 - metrics.availableDimCount,
    dominantDimension: fatigue.dominantDimension,
    primaryLimitingFactor: limitingFactorLabel,
    isLowFatigue: metrics.isLowFatigue,
    pmcSeries,
    weeklyTss,
    avgWeeklyTss: metrics.avgWeeklyTss,
    overreaching,
    keyEvidence,
    completenessLabel: metrics.completenessLabel,
    availableDimCount: metrics.availableDimCount,
    insights,
    globalDecision: buildGlobalDecisionContext(snapshot, 'FATIGUE'),
    emptyState: null,
    hierarchy: { rootId: 'effort', order: ['hero', 'verdict', 'insights', 'charts', 'evidence'] },
    sections: [],
  };
}

function emptyEffortViewModel(): EffortViewModel {
  const strainDisplay = mapStrainToDisplay(null);
  return {
    strainScore: null,
    dailyLoad: 0,
    weeklyLoad: 0,
    strainComposition: buildEffortStrainComposition(null),
    fatigueType: 'INSUFFICIENT_DATA',
    fatigueTypeLabel: null,
    performancePercent: null,
    consecutiveDays: 0,
    estimatedDaysToFresh: null,
    acwr: 0,
    chronicWeeklyAvg: null,
    tsb: null,
    confidencePct: 0,
    confidenceTone: 'neutral',
    verdict: 'Données insuffisantes',
    verdictClass: 'text-muted-foreground',
    verdictKey: 'INSUFFICIENT_DATA',
    rationale: [],
    trainingCapacity: 'REST_ONLY',
    strainSubtitle: '',
    strainStatusLabel: strainDisplay.label,
    strainStatusClassName: strainDisplay.colorClass,
    strainStrokeColor: strainDisplay.strokeColor,
    dimensions: {},
    missingDimCount: 5,
    dominantDimension: null,
    primaryLimitingFactor: null,
    isLowFatigue: false,
    pmcSeries: [],
    weeklyTss: [],
    avgWeeklyTss: 0,
    overreaching: undefined,
    keyEvidence: [],
    completenessLabel: '—',
    availableDimCount: 0,
    insights: { primary: [], supporting: [], contextual: [] },
    globalDecision: EMPTY_GLOBAL_DECISION,
    emptyState: {
      title: 'Charge indisponible.',
      description: 'Synchronise tes données et réessaie.',
    },
    hierarchy: { rootId: 'effort', order: ['hero', 'verdict', 'insights', 'charts', 'evidence'] },
    sections: [],
  };
}

export async function buildEffortViewModel(
  athleteId: string,
  trainingDayId: string,
): Promise<EffortViewModel> {
  const snapshot = await getOrBuildAthleteSnapshot(athleteId, trainingDayId);
  const { fatigue } = snapshot;
  const { dailyStrain } = snapshot;

  if (!fatigue) {
    return emptyEffortViewModel();
  }

  const refDate = new Date(`${trainingDayId}T12:00:00.000Z`);
  const [pmcPoints, dailyStress] = await Promise.all([
    loadAthletePmcPoints(athleteId, { refDate }),
    loadDailyTrainingStressEntries(athleteId, { refDate }),
  ]);

  // Same source as the PMC chart above it, so the ACWR gauge and the fitness curve
  // cannot disagree about the same week.
  const trainingLoad = computeTrainingLoad(dailyStress, refDate);
  const dailyLoad = dailyStrain?.dailyTss ?? trainingLoad.dailyLoad;
  const strainScore = dailyStrain?.strainScore ?? null;
  const strainDisplay = mapStrainToDisplay(strainScore);
  const pmcSeries = slicePmcWindow(pmcPoints, 28, refDate);
  const weeklyTss = buildWeeklyTssSeries(refDate, dailyStress);

  return buildPopulatedEffortViewModel({
    snapshot,
    fatigue,
    dailyStrain,
    trainingLoad,
    pmcSeries,
    weeklyTss,
    dailyLoad,
    strainScore,
    strainDisplay,
  });
}
