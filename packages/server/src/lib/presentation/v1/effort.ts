import { format, parseISO, subDays } from 'date-fns';
import type { EffortViewModel } from '@sharpit/app/presentation/effort-view-model';
import { mapFatigueDimensionIntensity } from '@sharpit/app/lib/today/dashboard/today-mapping';
import { toneFromClass, type V1RecoveryTone } from '@sharpit/server/lib/presentation/v1/recovery';
import type {
  V1StrainPerformance,
  V1TodayTargetBand,
} from '@sharpit/server/lib/presentation/v1/day-scores';
// Callers: handlers/v1/effort/handler.ts, effort.test.ts.
// API: GET /api/v1/effort (+targetBand, cardioLoad, active/passive strain, strainPerformance).
// Schema: none. User: "fix all" — go-all Bevel parity (passive strain, cardio vs strain, strain perf).

export type V1EffortSource = Omit<
  EffortViewModel,
  'insights' | 'globalDecision' | 'hierarchy' | 'sections'
>;

export type V1EffortDimensionKey =
  'load' | 'neuromuscular' | 'metabolic' | 'cumulative' | 'psychological';

export type V1EffortResponse = {
  apiVersion: 1;
  trainingDayId: string;
  empty: { title: string; message: string | null } | null;
  /** The day's strain, 0–21, worded and toned as the web's ring. */
  strain: { score: number | null; label: string; subtitle: string; tone: V1RecoveryTone };
  verdict: { key: string; label: string; tone: V1RecoveryTone };
  fatigueTypeLabel: string | null;
  trainingCapacity: string;
  rationale: string[];
  keyEvidence: string[];
  consecutiveDays: number;
  estimatedDaysToFresh: number | null;
  load: {
    daily: number;
    weekly: number;
    acwr: number;
    chronicWeeklyAvg: number | null;
    tsb: number | null;
    avgWeeklyTss: number;
  };
  /** Every fatigue dimension in the web's order; a missing one says so. Higher is worse. */
  dimensions: Array<{
    key: V1EffortDimensionKey;
    label: string;
    description: string;
    available: boolean;
    score: number | null;
    intensity: string | null;
  }>;
  dominantDimension: string | null;
  limitingFactor: string | null;
  overreaching: { label: string; tone: V1RecoveryTone } | null;
  composition: EffortViewModel['strainComposition'];
  /** Oldest first, one point per day of the window ending on `trainingDayId`. */
  pmc: Array<{ date: string; ctl: number; atl: number; tsb: number }>;
  /** Oldest first, eight weeks ending with this one. */
  weeklyTss: Array<{ label: string; tss: number }>;
  confidencePct: number | null;
  completenessLabel: string;
  /** Today's target strain band (ADR-079); null when inputs are insufficient. */
  targetBand: V1TodayTargetBand | null;
  /**
   * Cardio Load from the PMC window (CTL/ATL/TSB) — chronic fitness vocabulary,
   * distinct from the day's Strain score (0–21).
   */
  cardioLoad: { ctl: number; atl: number; tsb: number; label: string } | null;
  /** Structured + cardiovascular contributions (sessions / HR stress). */
  activeStrain: { score: number | null; label: string } | null;
  /** Non-workout movement contribution (steps / NEAT) — SharpIt “effort passif”. */
  passiveStrain: { score: number | null; label: string } | null;
  /** Rolling Strain Performance vs target band history. */
  strainPerformance: V1StrainPerformance | null;
};

const DIMENSIONS: ReadonlyArray<{ key: V1EffortDimensionKey; label: string; description: string }> =
  [
    {
      key: 'load',
      label: "Charge d'entraînement",
      description: 'Charge, montée de charge, tendance',
    },
    {
      key: 'neuromuscular',
      label: 'Neuromusculaire',
      description: 'Force, vitesse, récupération musculaire',
    },
    { key: 'metabolic', label: 'Métabolique', description: 'Volume intensité, dette lactique' },
    { key: 'cumulative', label: 'Cumulative', description: 'Accumulation multi-semaines' },
    {
      key: 'psychological',
      label: 'Psychologique',
      description: 'Stress, motivation, charge mentale',
    },
  ];

function projectDimensions(
  dimensions: V1EffortSource['dimensions'],
): V1EffortResponse['dimensions'] {
  return DIMENSIONS.map(({ key, label, description }) => {
    const dimension = dimensions?.[key];
    const available = Boolean(dimension?.available);
    const score = available ? (dimension?.score ?? null) : null;
    return {
      key,
      label,
      description,
      available,
      score,
      intensity: mapFatigueDimensionIntensity(score),
    };
  });
}

/** The web's points carry a display label; the window ends on the training day. */
function projectPmc(
  series: V1EffortSource['pmcSeries'],
  trainingDayId: string,
): V1EffortResponse['pmc'] {
  const refDate = parseISO(trainingDayId);
  return series.map((point, index) => ({
    date: format(subDays(refDate, series.length - 1 - index), 'yyyy-MM-dd'),
    ctl: point.ctl,
    atl: point.atl,
    tsb: point.tsb,
  }));
}

function contributorScore(
  composition: EffortViewModel['strainComposition'],
  key: 'training' | 'cardiovascular' | 'movement',
): number | null {
  const row = composition.contributors.find((contributor) => contributor.key === key);
  if (!row?.available) {
    return null;
  }
  return row.score ?? null;
}

function sumScores(...scores: Array<number | null>): number | null {
  const known = scores.filter((score): score is number => score !== null);
  if (known.length === 0) {
    return null;
  }
  return Math.round(known.reduce((sum, score) => sum + score, 0) * 10) / 10;
}

function projectCardioLoad(pmc: V1EffortResponse['pmc']): V1EffortResponse['cardioLoad'] {
  const last = pmc.at(-1);
  if (!last) {
    return null;
  }
  return { ctl: last.ctl, atl: last.atl, tsb: last.tsb, label: 'Cardio Load' };
}

function projectActiveStrain(
  composition: EffortViewModel['strainComposition'],
): V1EffortResponse['activeStrain'] {
  if (!composition.available) {
    return null;
  }
  return {
    score: sumScores(
      contributorScore(composition, 'training'),
      contributorScore(composition, 'cardiovascular'),
    ),
    label: 'Effort actif',
  };
}

function projectPassiveStrain(
  composition: EffortViewModel['strainComposition'],
): V1EffortResponse['passiveStrain'] {
  if (!composition.available) {
    return null;
  }
  const score = contributorScore(composition, 'movement');
  if (score === null) {
    return { score: null, label: 'Effort passif' };
  }
  return { score, label: 'Effort passif' };
}

/** Canonical Effort payload for native clients — a projection, no new domain logic. */
export function projectV1Effort(
  source: V1EffortSource,
  trainingDayId: string,
  extras: {
    targetBand?: V1TodayTargetBand | null;
    strainPerformance?: V1StrainPerformance | null;
  } = {},
): V1EffortResponse {
  const pmc = projectPmc(source.pmcSeries, trainingDayId);
  return {
    apiVersion: 1,
    trainingDayId,
    empty: source.emptyState
      ? { title: source.emptyState.title, message: source.emptyState.description ?? null }
      : null,
    strain: {
      score: source.strainScore,
      label: source.strainStatusLabel,
      subtitle: source.strainSubtitle,
      tone: toneFromClass(source.strainStatusClassName),
    },
    verdict: {
      key: source.verdictKey,
      label: source.verdict,
      tone: toneFromClass(source.verdictClass),
    },
    fatigueTypeLabel: source.fatigueTypeLabel,
    trainingCapacity: source.trainingCapacity,
    rationale: source.rationale,
    keyEvidence: source.keyEvidence,
    consecutiveDays: source.consecutiveDays,
    estimatedDaysToFresh: source.estimatedDaysToFresh,
    load: {
      daily: source.dailyLoad,
      weekly: source.weeklyLoad,
      acwr: source.acwr,
      chronicWeeklyAvg: source.chronicWeeklyAvg,
      tsb: source.tsb,
      avgWeeklyTss: source.avgWeeklyTss,
    },
    dimensions: projectDimensions(source.dimensions),
    dominantDimension: source.dominantDimension,
    limitingFactor: source.primaryLimitingFactor,
    overreaching: source.overreaching
      ? { label: source.overreaching.label, tone: toneFromClass(source.overreaching.colorClass) }
      : null,
    composition: source.strainComposition,
    pmc,
    weeklyTss: source.weeklyTss.map((week) => ({ label: week.week, tss: week.tss })),
    confidencePct: source.emptyState ? null : source.confidencePct,
    completenessLabel: source.completenessLabel,
    targetBand: extras.targetBand ?? null,
    cardioLoad: projectCardioLoad(pmc),
    activeStrain: projectActiveStrain(source.strainComposition),
    passiveStrain: projectPassiveStrain(source.strainComposition),
    strainPerformance: extras.strainPerformance ?? null,
  };
}
