import { EMPTY_GLOBAL_DECISION } from '@sharpit/app/presentation/global-decision-context';
import type { DimensionResult } from '@sharpit/app/athlete-state/today-state';
import { buildEffortStrainComposition } from '@sharpit/app/lib/presentation/effort/effort-strain-composition';

const EMPTY_DIM: DimensionResult = { score: null, status: 'PENDING', available: false };

/** Stable adaptation dimension chrome for cold-start micro-skeletons. */
export const ADAPTATION_DIMENSION_SHELL = [
  {
    key: 'loadProgression',
    label: 'Progression de charge',
    description: 'La charge d’entraînement évolue-t-elle de façon productive ?',
    dim: EMPTY_DIM,
  },
  {
    key: 'recoveryQuality',
    label: 'Qualité de récupération',
    description: 'La récupération soutient-elle l’adaptation ?',
    dim: EMPTY_DIM,
  },
  {
    key: 'autonomicAdaptation',
    label: 'Adaptation autonome',
    description: 'Le système nerveux suit-il la charge ?',
    dim: EMPTY_DIM,
  },
  {
    key: 'neuromuscularEfficiency',
    label: 'Efficacité neuromusculaire',
    description: 'Même effort, meilleure performance ?',
    dim: EMPTY_DIM,
  },
] as const;

export function adaptationLoadingShell() {
  return {
    adaptationIndex: null as number | null,
    statusLabel: '',
    statusClassName: 'text-muted-foreground',
    trendLabel: '—',
    verdictLabel: '',
    verdictClassName: 'text-muted-foreground',
    verdictKey: 'INSUFFICIENT_DATA',
    loadMultiplier: 1,
    limitingFactor: null as string | null,
    plateauRisk: false,
    overreachingWithoutAdaptation: false,
    dimensions: ADAPTATION_DIMENSION_SHELL.map((d) => ({ ...d, dim: { ...EMPTY_DIM } })),
    availableDimCount: 0,
    historyLength: 0,
    confidencePct: 0,
    confidenceTone: 'neutral' as const,
    globalDecision: EMPTY_GLOBAL_DECISION,
  };
}

export const RECOVERY_DIMENSION_SHELL: Record<string, DimensionResult> = {
  autonomic: EMPTY_DIM,
  sleep: EMPTY_DIM,
  subjective: EMPTY_DIM,
  loadContext: EMPTY_DIM,
};

export function recoveryLoadingShell() {
  return {
    readinessScore: null as number | null,
    signal: { label: '', qualityClass: 'text-muted-foreground', arrow: '' },
    limiterLabel: null as string | null,
    limiterSignal: null as
      | 'hrv_low'
      | 'rhr_high'
      | 'sleep_short'
      | 'sleep_poor'
      | 'subjective_low'
      | 'load_elevated'
      | null,
    estimatedRecoveryDays: null as number | null,
    isCalibrating: false,
    availableDimCount: 0,
    dimensions: { ...RECOVERY_DIMENSION_SHELL },
    intensityLabel: '',
    intensityClassName: 'text-muted-foreground',
    rationale: [] as string[],
    autonomicLabel: '—',
    autonomicClass: 'text-muted-foreground',
    wellnessLabel: '—',
    wellnessClass: 'text-muted-foreground',
    loadLabel: '—',
    loadClass: 'text-muted-foreground',
    dissonanceDetected: false,
    sparkHrv: [] as { date: string; value: number | null }[],
    sparkRhr: [] as { date: string; value: number | null }[],
    dualData: [] as { date: string; a: number | null; b: number | null }[],
    baselineLow: null as number | null,
    baselineHigh: null as number | null,
    hrv: null as number | null,
    restingHr: null as number | null,
    bodyBattery: null as number | null,
    confidencePct: 0,
    confidenceTone: 'neutral' as const,
    completenessLabel: '—',
    globalDecision: EMPTY_GLOBAL_DECISION,
  };
}

export const EFFORT_DIMENSION_SHELL: Record<string, DimensionResult> = {
  load: EMPTY_DIM,
  neuromuscular: EMPTY_DIM,
  metabolic: EMPTY_DIM,
  cumulative: EMPTY_DIM,
  psychological: EMPTY_DIM,
};

export function effortLoadingShell() {
  return {
    strainScore: null as number | null,
    dailyLoad: 0,
    weeklyLoad: 0,
    strainComposition: buildEffortStrainComposition(null),
    fatigueType: 'UNDETERMINED',
    fatigueTypeLabel: null as string | null,
    performancePercent: null as number | null,
    consecutiveDays: 0,
    estimatedDaysToFresh: null as number | null,
    strainSubtitle: '',
    strainStatusLabel: '',
    strainStatusClassName: 'text-muted-foreground',
    strainStrokeColor: 'var(--color-muted-foreground)',
    acwr: 0,
    chronicWeeklyAvg: null as number | null,
    tsb: null as number | null,
    confidencePct: 0,
    confidenceTone: 'neutral' as const,
    verdict: '',
    verdictClass: 'text-muted-foreground',
    verdictKey: 'INSUFFICIENT_DATA',
    rationale: [] as string[],
    trainingCapacity: 'REST_ONLY' as const,
    dimensions: { ...EFFORT_DIMENSION_SHELL },
    missingDimCount: 0,
    dominantDimension: null as string | null,
    primaryLimitingFactor: null as string | null,
    isLowFatigue: false,
    pmcSeries: [] as { label: string; ctl: number; atl: number; tsb: number }[],
    weeklyTss: [] as { week: string; tss: number }[],
    avgWeeklyTss: 0,
    completenessLabel: '—',
    availableDimCount: 0,
    globalDecision: EMPTY_GLOBAL_DECISION,
  };
}

export function sleepLoadingShell() {
  return {
    nightStatus: 'pending' as const,
    sleepScore: null as number | null,
    adequacyDisplay: { label: '', colorClass: 'text-muted-foreground' },
    scoreBreakdown: {
      restorativeRatio: null as number | null,
      durationScore: null as number | null,
      architectureScore: null as number | null,
      rawScore: null as number | null,
      debtMin: null as number | null,
      debtModifier: 1,
      sharpitScore: null as number | null,
    },
    totalSleepMin: null as number | null,
    deepMin: null as number | null,
    remMin: null as number | null,
    lightMin: null as number | null,
    awakeMin: null as number | null,
    bedtimeMin: null as number | null,
    wakeMin: null as number | null,
    garminScore: null as number | null,
    sleepDelta7d: null as number | null,
    targetDeltaMin: null as number | null,
    sleepTargetMin: 480,
    coachView: {
      hasData: false,
      hasDetailedData: false,
      latest: null,
      avg: { score: null, durationMin: null, deepPct: null, remPct: null, nights: 0 },
      regularityMin: null,
      recommendedBedtimeMin: null,
      recommendedDurationMin: 0,
      targetDurationMin: 0,
      // ADR-079. Callers: sleep loading shell. API: SleepCoachView. User: Bevel gaps plan.
      sleepNeededMin: 0,
      sleepNeededContributors: { debtBoostMin: 0, strainBoostMin: 0, efficiencyBoostMin: 0 },
      debt7Min: null,
      debt14Min: null,
      insights: [],
    },
    barData: [] as { date: string; minutes: number | null; fill: string }[],
    recoveryNote: null as string | null,
    insights: { primary: [], supporting: [], contextual: [] },
    globalDecision: EMPTY_GLOBAL_DECISION,
    confidencePresentation: { pct: null as number | null },
  };
}
