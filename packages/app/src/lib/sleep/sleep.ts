import type { RecoveryTone } from '@sharpit/app/lib/recovery/recovery';
import { isSet } from '@sharpit/shared/value';
import { buildSleepScoreBreakdown } from './sleep-scoring';

/**
 * Coach de sommeil : analyse déterministe des phases de sommeil (Garmin) et
 * recommandation d'heure de coucher.
 *
 * Repères physiologiques utilisés (adulte) :
 *  - Sommeil profond : ~13-23 % du temps de sommeil (récupération physique).
 *  - Sommeil paradoxal (REM) : ~20-25 % (mémoire, récupération cognitive).
 *  - Durée cible : 7h30-8h30. On vise 8h par défaut.
 *  - Régularité des horaires : pilier majeur de la qualité du sommeil.
 */

const TARGET_DURATION_MIN = 480; // 8 h — défaut si pas d'objectif profil
const FALL_ASLEEP_BUFFER_MIN = 20;
const RECENT_WINDOW_NIGHTS = 7;
const COACH_WINDOW_NIGHTS = 14;
const MAX_RECOVERY_BOOST_MIN = 60;

export interface SleepEntryInput {
  date: Date;
  sleepMinutes: number | null;
  sleepScore: number | null;
  sleepDeepMin: number | null;
  sleepLightMin: number | null;
  sleepRemMin: number | null;
  sleepAwakeMin: number | null;
  sleepBedtimeMin: number | null;
  sleepWakeMin: number | null;
  sleepRespiration: number | null;
  sleepAvgStress: number | null;
  sleepScoreFeedback: string | null;
}

export interface SleepPhase {
  key: 'deep' | 'rem' | 'light' | 'awake';
  label: string;
  minutes: number;
  percent: number; // part du temps au lit (pour la barre)
  color: string;
  ideal: string | null;
  tone: RecoveryTone;
}

export interface SleepInsight {
  tone: RecoveryTone;
  title: string;
  detail: string;
}

export interface SleepLatest {
  date: Date;
  /** Score SHARPIT (durée vs cible + architecture restauratrice). */
  sharpitScore: number | null;
  sharpitScoreTone: RecoveryTone;
  restorativeRatio: number | null;
  /** Score Garmin brut, si disponible (non affiché comme score concurrent). */
  garminScore: number | null;
  durationMin: number | null;
  bedtimeMin: number | null;
  wakeMin: number | null;
  phases: SleepPhase[];
}

export interface SleepCoachView {
  hasData: boolean;
  /** Au moins une nuit avec phases, score ou horaires coucher/réveil. */
  hasDetailedData: boolean;
  latest: SleepLatest | null;
  avg: {
    score: number | null;
    durationMin: number | null;
    deepPct: number | null;
    remPct: number | null;
    nights: number;
  };
  regularityMin: number | null;
  recommendedBedtimeMin: number | null;
  /** Durée visée ce soir (objectif + rattrapage dette si besoin). */
  recommendedDurationMin: number;
  targetDurationMin: number;
  debt7Min: number | null;
  debt14Min: number | null;
  /** Same as recommendedDurationMin — Bevel-style “sleep needed” label (ADR-079). */
  sleepNeededMin: number;
  sleepNeededContributors: {
    debtBoostMin: number;
    strainBoostMin: number;
    efficiencyBoostMin: number;
  };
  insights: SleepInsight[];
}

const PHASE_COLORS = {
  deep: 'var(--signal-base)',
  rem: 'var(--signal-recovery)',
  light: 'var(--signal-tempo)',
  awake: 'var(--signal-caution)',
} as const;

export function formatClock(min: number | null): string {
  if (min === undefined || min === null) {
    return '—';
  }
  const norm = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(min: number | null): string {
  if (min === undefined || min === null) {
    return '—';
  }
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

function avg(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Écart absolu médian (MAD) : mesure de dispersion robuste aux valeurs
 * aberrantes, contrairement à l'écart-type. Sert d'indicateur de régularité.
 */
function medianAbsoluteDeviation(values: number[]): number | null {
  if (values.length < 2) {
    return null;
  }
  const m = median(values)!;
  return median(values.map((v) => Math.abs(v - m)));
}

/** Normalise une heure de coucher pour la moyenne autour de minuit
 * (les couchers après minuit, ex 00:30 = 30 min, deviennent 1470). */
function normalizeBedtime(min: number): number {
  return min < 720 ? min + 1440 : min;
}

function scoreTone(score: number | null): RecoveryTone {
  if (score === undefined || score === null) {
    return 'neutral';
  }
  if (score >= 80) {
    return 'good';
  }
  if (score >= 60) {
    return 'moderate';
  }
  return 'low';
}

function phaseTone(pct: number, goodMin: number, moderateMin: number): RecoveryTone {
  if (pct >= goodMin) {
    return 'good';
  }
  if (pct >= moderateMin) {
    return 'moderate';
  }
  return 'low';
}

type PhaseDraft = Pick<SleepPhase, 'key' | 'label' | 'minutes' | 'percent' | 'ideal' | 'tone'>;

function makePhase(phase: PhaseDraft): SleepPhase {
  return {
    ...phase,
    color: PHASE_COLORS[phase.key],
  };
}

function buildPhaseDrafts(phaseMinutes: {
  deep: number;
  rem: number;
  light: number;
  awake: number;
  inBed: number;
  sleep: number;
}): PhaseDraft[] {
  const { deep, rem, light, awake, inBed, sleep } = phaseMinutes;
  const pct = (value: number) => Math.round((value / inBed) * 100);
  const deepPct = sleep > 0 ? (deep / sleep) * 100 : 0;
  const remPct = sleep > 0 ? (rem / sleep) * 100 : 0;
  const awakeTone: RecoveryTone = awake > 45 ? 'moderate' : 'neutral';

  return [
    {
      key: 'deep',
      label: 'Profond',
      minutes: deep,
      percent: pct(deep),
      ideal: '13-23 %',
      tone: phaseTone(deepPct, 13, 9),
    },
    {
      key: 'rem',
      label: 'Paradoxal (REM)',
      minutes: rem,
      percent: pct(rem),
      ideal: '20-25 %',
      tone: phaseTone(remPct, 20, 15),
    },
    {
      key: 'light',
      label: 'Léger',
      minutes: light,
      percent: pct(light),
      ideal: null,
      tone: 'neutral',
    },
    {
      key: 'awake',
      label: 'Éveillé',
      minutes: awake,
      percent: pct(awake),
      ideal: null,
      tone: awakeTone,
    },
  ];
}

function buildPhases(entry: SleepEntryInput): SleepPhase[] {
  const deep = entry.sleepDeepMin ?? 0;
  const rem = entry.sleepRemMin ?? 0;
  const light = entry.sleepLightMin ?? 0;
  const awake = entry.sleepAwakeMin ?? 0;
  const inBed = deep + rem + light + awake;
  const sleep = deep + rem + light;
  if (inBed === 0) {
    return [];
  }

  return buildPhaseDrafts({ deep, rem, light, awake, inBed, sleep }).map(makePhase);
}

type InsightParams = {
  avgDuration: number | null;
  avgDeepPct: number | null;
  avgRemPct: number | null;
  regularity: number | null;
  avgBedtime: number | null;
  recommendedBedtime: number | null;
  avgStress: number | null;
  targetDuration: number;
  recommendedDuration: number;
  bedtimeGoal: number | null;
  debt7Min: number | null;
  debt14Min: number | null;
};

function buildDebtInsights(params: InsightParams): SleepInsight[] {
  const { debt7Min, debt14Min, targetDuration, recommendedDuration } = params;
  const targetLabel = formatDuration(targetDuration);
  if (isSet(debt7Min) && debt7Min > 60) {
    return [
      {
        tone: debt7Min > 180 ? 'low' : 'moderate',
        title: 'Dette de sommeil sur 7 nuits',
        detail: `Tu as environ ${formatDuration(
          Math.round(debt7Min),
        )} de retard cumulé sur 7 nuits (objectif ${targetLabel}/nuit). Ce soir, vise ${formatDuration(
          recommendedDuration,
        )} pour rattraper progressivement.`,
      },
    ];
  }
  if (isSet(debt14Min) && debt14Min > 120) {
    return [
      {
        tone: 'moderate',
        title: 'Dette sur 14 nuits',
        detail: `Sur 14 nuits, tu es en retard d'environ ${formatDuration(
          Math.round(debt14Min),
        )} par rapport à ton objectif. Priorise la régularité et la durée les prochains jours.`,
      },
    ];
  }
  return [];
}

function buildDurationInsights(params: InsightParams): SleepInsight[] {
  const { avgDuration, targetDuration } = params;
  const targetLabel = formatDuration(targetDuration);
  if (avgDuration === undefined || avgDuration === null) {
    return [];
  }
  if (avgDuration < targetDuration - 30) {
    return [
      {
        tone: 'low',
        title: 'Sous ton objectif de sommeil',
        detail: `Tu dors en moyenne ${formatDuration(
          Math.round(avgDuration),
        )} par nuit, sous ton objectif de ${targetLabel}. Avance ton coucher pour combler l'écart.`,
      },
    ];
  }
  if (avgDuration < targetDuration) {
    return [
      {
        tone: 'moderate',
        title: "Proche de l'objectif",
        detail: `Moyenne de ${formatDuration(
          Math.round(avgDuration),
        )} — objectif ${targetLabel}. Quelques minutes de plus par nuit feraient la différence.`,
      },
    ];
  }
  return [];
}

function buildBedtimeInsights(params: InsightParams): SleepInsight[] {
  const insights: SleepInsight[] = [];
  const { bedtimeGoal, avgBedtime, recommendedBedtime } = params;
  if (isSet(bedtimeGoal) && isSet(avgBedtime)) {
    const diff = Math.abs(normalizeBedtime(avgBedtime) - normalizeBedtime(bedtimeGoal));
    if (diff > 45) {
      insights.push({
        tone: 'moderate',
        title: 'Coucher décalé vs objectif',
        detail: `Tu te couches vers ${formatClock(avgBedtime)} en moyenne, objectif ${formatClock(bedtimeGoal)}. La régularité aide la récupération.`,
      });
    }
  }
  if (
    isSet(avgBedtime) &&
    isSet(recommendedBedtime) &&
    normalizeBedtime(avgBedtime) - normalizeBedtime(recommendedBedtime) > 45
  ) {
    insights.push({
      tone: 'moderate',
      title: 'Coucher tardif',
      detail: `Tu te couches vers ${formatClock(
        avgBedtime,
      )} en moyenne, plus tard que l'heure recommandée (${formatClock(
        recommendedBedtime,
      )}). Avancer le coucher protège surtout ton sommeil profond.`,
    });
  }
  return insights;
}

function buildPhaseInsights(params: InsightParams): SleepInsight[] {
  const insights: SleepInsight[] = [];
  const { avgDeepPct, avgRemPct } = params;
  if (isSet(avgDeepPct) && avgDeepPct < 13) {
    insights.push({
      tone: avgDeepPct < 9 ? 'low' : 'moderate',
      title: 'Sommeil profond bas',
      detail: `Profond à ${Math.round(
        avgDeepPct,
      )} % (cible 13-23 %). Le profond se joue en début de nuit : évite l'alcool et les repas lourds le soir, baisse la température de la chambre (~18 °C) et évite les séances très intenses juste avant le coucher.`,
    });
  }
  if (isSet(avgRemPct) && avgRemPct < 18) {
    insights.push({
      tone: avgRemPct < 15 ? 'low' : 'moderate',
      title: 'Sommeil paradoxal (REM) bas',
      detail: `REM à ${Math.round(
        avgRemPct,
      )} % (cible 20-25 %). Le REM est concentré en fin de nuit : dors suffisamment longtemps, garde des horaires réguliers et limite l'alcool qui le fragmente.`,
    });
  }
  return insights;
}

function buildRegularityInsight(regularity: number | null): SleepInsight[] {
  if (regularity === undefined || regularity === null || regularity <= 60) {
    return [];
  }
  return [
    {
      tone: 'moderate',
      title: 'Horaires irréguliers',
      detail: `Ton heure de coucher varie de ±${Math.round(
        regularity,
      )} min. Un coucher et un lever réguliers (même le week-end) stabilisent ton horloge interne et la qualité du sommeil.`,
    },
  ];
}

function buildStressInsight(avgStress: number | null): SleepInsight[] {
  if (avgStress === undefined || avgStress === null || avgStress <= 30) {
    return [];
  }
  return [
    {
      tone: 'moderate',
      title: 'Stress nocturne élevé',
      detail: `Stress moyen de ${Math.round(
        avgStress,
      )} pendant le sommeil. Une routine de décompression (respiration, lecture, pas d'écran 30 min avant) peut aider à abaisser ton stress nocturne.`,
    },
  ];
}

function buildInsights(params: InsightParams): SleepInsight[] {
  const insights = [
    ...buildDebtInsights(params),
    ...buildDurationInsights(params),
    ...buildBedtimeInsights(params),
    ...buildPhaseInsights(params),
    ...buildRegularityInsight(params.regularity),
    ...buildStressInsight(params.avgStress),
  ];

  if (!insights.length) {
    return [
      {
        tone: 'good',
        title: 'Sommeil de qualité',
        detail:
          "Durée, phases et régularité sont dans les clous. Continue sur cette lancée : c'est un pilier de ta progression.",
      },
    ];
  }

  return insights.slice(0, 4);
}

export interface SleepGoals {
  targetDurationMin?: number | null;
  bedtimeTargetMin?: number | null;
}

function computeCumulativeDebt(nights: SleepEntryInput[], targetMin: number): number | null {
  const valid = nights.filter((n) => isSet(n.sleepMinutes));
  if (valid.length === 0) {
    return null;
  }
  const totalActual = valid.reduce((sum, n) => sum + (n.sleepMinutes ?? 0), 0);
  return Math.max(0, targetMin * valid.length - totalActual);
}

const SLEEP_ENTRY_FIELDS = [
  'sleepMinutes',
  'sleepScore',
  'sleepDeepMin',
  'sleepLightMin',
  'sleepRemMin',
  'sleepAwakeMin',
  'sleepBedtimeMin',
  'sleepWakeMin',
  'sleepRespiration',
  'sleepAvgStress',
  'sleepScoreFeedback',
] as const;

type RawSleepEntry = {
  date: Date | string;
  sleepMinutes?: number | null;
  sleepScore?: number | null;
  sleepDeepMin?: number | null;
  sleepLightMin?: number | null;
  sleepRemMin?: number | null;
  sleepAwakeMin?: number | null;
  sleepBedtimeMin?: number | null;
  sleepWakeMin?: number | null;
  sleepRespiration?: number | null;
  sleepAvgStress?: number | null;
  sleepScoreFeedback?: string | null;
};

function mapSleepEntryInput(entry: RawSleepEntry): SleepEntryInput {
  const mapped = Object.fromEntries(
    SLEEP_ENTRY_FIELDS.map((field) => [field, entry[field] ?? null]),
  ) as Omit<SleepEntryInput, 'date'>;

  return {
    date: new Date(entry.date),
    ...mapped,
  };
}

/** Mappe les entrées santé API vers le format du coach sommeil. */
export function toSleepEntryInputs(
  entries: Array<{
    date: Date | string;
    sleepMinutes?: number | null;
    sleepScore?: number | null;
    sleepDeepMin?: number | null;
    sleepLightMin?: number | null;
    sleepRemMin?: number | null;
    sleepAwakeMin?: number | null;
    sleepBedtimeMin?: number | null;
    sleepWakeMin?: number | null;
    sleepRespiration?: number | null;
    sleepAvgStress?: number | null;
    sleepScoreFeedback?: string | null;
  }>,
): SleepEntryInput[] {
  return entries.map(mapSleepEntryInput);
}

function isCoachNight(entry: SleepEntryInput): boolean {
  return (
    isSet(entry.sleepScore) ||
    isSet(entry.sleepDeepMin) ||
    isSet(entry.sleepRemMin) ||
    isSet(entry.sleepMinutes)
  );
}

function computePhasePercentages(recent7: SleepEntryInput[]): {
  avgDeepPct: number | null;
  avgRemPct: number | null;
} {
  const deepPcts: number[] = [];
  const remPcts: number[] = [];
  for (const night of recent7) {
    const sleep = (night.sleepDeepMin ?? 0) + (night.sleepLightMin ?? 0) + (night.sleepRemMin ?? 0);
    if (sleep <= 0) {
      continue;
    }
    if (isSet(night.sleepDeepMin)) {
      deepPcts.push((night.sleepDeepMin / sleep) * 100);
    }
    if (isSet(night.sleepRemMin)) {
      remPcts.push((night.sleepRemMin / sleep) * 100);
    }
  }
  return { avgDeepPct: avg(deepPcts), avgRemPct: avg(remPcts) };
}

function computeRecommendedBedtimeMin(
  medianWake: number | null,
  recommendedDurationMin: number,
  goals: SleepGoals | undefined,
  debt7Min: number | null,
): number | null {
  let recommendedBedtime: number | null = null;
  if (isSet(medianWake)) {
    const raw = medianWake - recommendedDurationMin - FALL_ASLEEP_BUFFER_MIN;
    recommendedBedtime = ((raw % 1440) + 1440) % 1440;
  }
  if (isSet(goals?.bedtimeTargetMin) && isSet(debt7Min) && debt7Min <= 30) {
    recommendedBedtime = goals.bedtimeTargetMin;
  }
  return recommendedBedtime;
}

function buildLatestSleep(latestNight: SleepEntryInput, targetMin: number): SleepLatest {
  const latestBreakdown = buildSleepScoreBreakdown({
    deepMin: latestNight.sleepDeepMin,
    remMin: latestNight.sleepRemMin,
    totalMin: latestNight.sleepMinutes,
    debtMin: null,
    targetMin,
  });
  return {
    date: latestNight.date,
    sharpitScore: latestBreakdown.sharpitScore,
    sharpitScoreTone: scoreTone(latestBreakdown.sharpitScore),
    restorativeRatio: latestBreakdown.restorativeRatio,
    garminScore: latestNight.sleepScore,
    durationMin: latestNight.sleepMinutes,
    bedtimeMin: latestNight.sleepBedtimeMin,
    wakeMin: latestNight.sleepWakeMin,
    phases: buildPhases(latestNight),
  };
}

function emptySleepCoachView(targetDuration: number): SleepCoachView {
  return {
    hasData: false,
    hasDetailedData: false,
    latest: null,
    avg: {
      score: null,
      durationMin: null,
      deepPct: null,
      remPct: null,
      nights: 0,
    },
    regularityMin: null,
    recommendedBedtimeMin: null,
    recommendedDurationMin: targetDuration,
    targetDurationMin: targetDuration,
    debt7Min: null,
    debt14Min: null,
    sleepNeededMin: targetDuration,
    sleepNeededContributors: { debtBoostMin: 0, strainBoostMin: 0, efficiencyBoostMin: 0 },
    insights: [],
  };
}

const MAX_STRAIN_SLEEP_BOOST_MIN = 45;
const MAX_EFFICIENCY_SLEEP_BOOST_MIN = 30;

export type SleepNeededOptions = {
  /** Recent day strain on SharpIt’s 0–21 scale. */
  recentStrainScore?: number | null;
  /** Sleep efficiency percent 0–100 when known. */
  sleepEfficiencyPercent?: number | null;
};

function strainSleepBoost(strainScore: number | null | undefined): number {
  if (!isSet(strainScore) || strainScore < 8) {
    return 0;
  }
  return Math.min(Math.round(((strainScore - 8) / 13) * MAX_STRAIN_SLEEP_BOOST_MIN), MAX_STRAIN_SLEEP_BOOST_MIN);
}

function efficiencySleepBoost(efficiencyPercent: number | null | undefined): number {
  if (!isSet(efficiencyPercent) || efficiencyPercent >= 85) {
    return 0;
  }
  return Math.min(Math.round(((85 - efficiencyPercent) / 25) * MAX_EFFICIENCY_SLEEP_BOOST_MIN), MAX_EFFICIENCY_SLEEP_BOOST_MIN);
}

function computeDebtAndRecommendedDuration(
  recent7: SleepEntryInput[],
  nights: SleepEntryInput[],
  targetDuration: number,
  options: SleepNeededOptions = {},
): {
  debt7Min: number | null;
  debt14Min: number | null;
  recommendedDurationMin: number;
  sleepNeededContributors: {
    debtBoostMin: number;
    strainBoostMin: number;
    efficiencyBoostMin: number;
  };
} {
  const debt7Min = computeCumulativeDebt(recent7, targetDuration);
  const debt14Min = computeCumulativeDebt(nights, targetDuration);
  const debtBoostMin =
    isSet(debt7Min) && debt7Min > 30
      ? Math.min(Math.ceil(debt7Min / RECENT_WINDOW_NIGHTS), MAX_RECOVERY_BOOST_MIN)
      : 0;
  const strainBoostMin = strainSleepBoost(options.recentStrainScore);
  const efficiencyBoostMin = efficiencySleepBoost(options.sleepEfficiencyPercent);
  // shortcut: no time-to-fall-asleep until SharpIt measures latency, then add a latency term
  return {
    debt7Min,
    debt14Min,
    recommendedDurationMin: targetDuration + debtBoostMin + strainBoostMin + efficiencyBoostMin,
    sleepNeededContributors: { debtBoostMin, strainBoostMin, efficiencyBoostMin },
  };
}

function computeRecentNightAverages(recent7: SleepEntryInput[]): {
  avgScore: number | null;
  avgDuration: number | null;
  avgDeepPct: number | null;
  avgRemPct: number | null;
  avgStress: number | null;
} {
  const { avgDeepPct, avgRemPct } = computePhasePercentages(recent7);
  const stresses = recent7
    .map((night) => night.sleepAvgStress)
    .filter((value): value is number => isSet(value));
  return {
    avgScore: avg(recent7.map((night) => night.sleepScore).filter((v): v is number => isSet(v))),
    avgDuration: avg(
      recent7.map((night) => night.sleepMinutes).filter((v): v is number => isSet(v)),
    ),
    avgDeepPct,
    avgRemPct,
    avgStress: avg(stresses),
  };
}

function computeBedtimeStats(
  nights: SleepEntryInput[],
  recommendedDurationMin: number,
  goals: SleepGoals | undefined,
  debt7Min: number | null,
): {
  regularity: number | null;
  avgBedtime: number | null;
  recommendedBedtime: number | null;
} {
  const bedtimes = nights
    .map((night) => night.sleepBedtimeMin)
    .filter((value): value is number => isSet(value))
    .map(normalizeBedtime);
  const wakes = nights
    .map((night) => night.sleepWakeMin)
    .filter((value): value is number => isSet(value));
  const regularity = medianAbsoluteDeviation(bedtimes);
  const medianBedtimeNorm = median(bedtimes);
  const avgBedtime = isSet(medianBedtimeNorm) ? medianBedtimeNorm % 1440 : null;
  const recommendedBedtime = computeRecommendedBedtimeMin(
    median(wakes),
    recommendedDurationMin,
    goals,
    debt7Min,
  );
  return { regularity, avgBedtime, recommendedBedtime };
}

function hasDetailedNightData(nights: SleepEntryInput[]): boolean {
  return nights.some(
    (night) =>
      isSet(night.sleepScore) ||
      isSet(night.sleepDeepMin) ||
      isSet(night.sleepBedtimeMin) ||
      isSet(night.sleepWakeMin),
  );
}

function roundNullable(value: number | null): number | null {
  return isSet(value) ? Math.round(value) : null;
}

function buildSleepCoachResult(input: {
  nights: SleepEntryInput[];
  latest: SleepLatest;
  insights: SleepInsight[];
  avgScore: number | null;
  avgDuration: number | null;
  avgDeepPct: number | null;
  avgRemPct: number | null;
  regularity: number | null;
  recommendedBedtime: number | null;
  recommendedDurationMin: number;
  targetDuration: number;
  debt7Min: number | null;
  debt14Min: number | null;
  sleepNeededContributors: SleepCoachView['sleepNeededContributors'];
}): SleepCoachView {
  return {
    hasData: true,
    hasDetailedData: hasDetailedNightData(input.nights),
    latest: input.latest,
    avg: {
      score: roundNullable(input.avgScore),
      durationMin: roundNullable(input.avgDuration),
      deepPct: roundNullable(input.avgDeepPct),
      remPct: roundNullable(input.avgRemPct),
      nights: input.nights.length,
    },
    regularityMin: roundNullable(input.regularity),
    recommendedBedtimeMin: input.recommendedBedtime,
    recommendedDurationMin: input.recommendedDurationMin,
    targetDurationMin: input.targetDuration,
    debt7Min: roundNullable(input.debt7Min),
    debt14Min: roundNullable(input.debt14Min),
    sleepNeededMin: input.recommendedDurationMin,
    sleepNeededContributors: input.sleepNeededContributors,
    insights: input.insights,
  };
}

export function analyzeSleep(
  entries: SleepEntryInput[],
  goals?: SleepGoals,
  options: SleepNeededOptions = {},
): SleepCoachView {
  const targetDuration = goals?.targetDurationMin ?? TARGET_DURATION_MIN;
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const nights = sorted.filter(isCoachNight).slice(0, COACH_WINDOW_NIGHTS);
  if (!nights.length) {
    return emptySleepCoachView(targetDuration);
  }

  const recent7 = nights.slice(0, RECENT_WINDOW_NIGHTS);
  const { debt7Min, debt14Min, recommendedDurationMin, sleepNeededContributors } =
    computeDebtAndRecommendedDuration(recent7, nights, targetDuration, options);
  const { avgScore, avgDuration, avgDeepPct, avgRemPct, avgStress } =
    computeRecentNightAverages(recent7);
  const { regularity, avgBedtime, recommendedBedtime } = computeBedtimeStats(
    nights,
    recommendedDurationMin,
    goals,
    debt7Min,
  );

  const targetMin = goals?.targetDurationMin ?? TARGET_DURATION_MIN;
  const latest = buildLatestSleep(nights[0]!, targetMin);
  const insights = buildInsights({
    avgDuration,
    avgDeepPct,
    avgRemPct,
    regularity,
    avgBedtime,
    recommendedBedtime,
    avgStress,
    targetDuration,
    recommendedDuration: recommendedDurationMin,
    bedtimeGoal: goals?.bedtimeTargetMin ?? null,
    debt7Min,
    debt14Min,
  });

  return buildSleepCoachResult({
    nights,
    latest,
    insights,
    avgScore,
    avgDuration,
    avgDeepPct,
    avgRemPct,
    regularity,
    recommendedBedtime,
    recommendedDurationMin,
    targetDuration,
    debt7Min,
    debt14Min,
    sleepNeededContributors,
  });
}
