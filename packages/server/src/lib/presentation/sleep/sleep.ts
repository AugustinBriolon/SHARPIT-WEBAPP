import { parseISO, format, isSameDay } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import { fr } from 'date-fns/locale';
import { getAthleteProfile, getHealthEntries } from '@sharpit/server/lib/queries';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import {
  buildDailyWindowSeries,
  getIndexedHealthEntry,
  indexHealthEntriesByDay,
  effectiveSleepMinutes,
} from '@sharpit/app/lib/health/health';

type DailyHealthRow = Awaited<ReturnType<typeof getHealthEntries>>[number];
import { analyzeSleep, toSleepEntryInputs } from '@sharpit/app/lib/sleep/sleep';
import {
  buildSleepScoreBreakdown,
  computeSleepEfficiencyPct,
  mapSleepScoreToAdequacy,
} from '@sharpit/app/lib/sleep/sleep-scoring';
// Callers: v1/sleep handler, presentation sleep. API: GET /api/v1/sleep. User: implement Bevel gaps plan.
import { SLEEP_TARGET_MIN } from '@sharpit/core/sleep/targets';
import {
  mapRecoveryToSignal,
  mapSleepAdequacySignalToDisplay,
  mapConfidenceToTier,
  type ReadinessCategory,
  type SleepAdequacySignal,
} from '@sharpit/app/lib/today/dashboard/today-mapping';
import { buildSleepPageInsights } from '@sharpit/server/lib/product-insight/sleep-page-insights';
import { buildGlobalDecisionContext } from '@sharpit/server/lib/decision/global-decision-context';
import { EMPTY_GLOBAL_DECISION } from '@sharpit/app/presentation/global-decision-context';
import type { SleepNightStatus, SleepViewModel } from '@sharpit/app/presentation/sleep-view-model';

const CONFIDENCE_TONE = {
  high: 'good',
  medium: 'warn',
  low: 'neutral',
} as const;

function emptySleepViewModel(): SleepViewModel {
  return {
    nightStatus: 'missing',
    sleepScore: null,
    adequacyDisplay: { label: '—', colorClass: 'text-muted-foreground' },
    scoreBreakdown: buildSleepScoreBreakdown({
      deepMin: null,
      remMin: null,
      totalMin: null,
      debtMin: null,
    }),
    totalSleepMin: null,
    deepMin: null,
    remMin: null,
    lightMin: null,
    awakeMin: null,
    bedtimeMin: null,
    wakeMin: null,
    garminScore: null,
    sleepDelta7d: null,
    targetDeltaMin: null,
    sleepTargetMin: SLEEP_TARGET_MIN,
    coachView: {
      hasData: false,
      hasDetailedData: false,
      latest: null,
      avg: { score: null, durationMin: null, deepPct: null, remPct: null, nights: 0 },
      regularityMin: null,
      recommendedBedtimeMin: null,
      recommendedDurationMin: 0,
      targetDurationMin: 0,
      sleepNeededMin: 0,
      sleepNeededContributors: { debtBoostMin: 0, strainBoostMin: 0, efficiencyBoostMin: 0 },
      debt7Min: null,
      debt14Min: null,
      insights: [],
    },
    barData: [],
    recoveryNote: null,
    insights: { primary: [], supporting: [], contextual: [] },
    globalDecision: EMPTY_GLOBAL_DECISION,
    confidencePresentation: {
      pct: null,
      label: null,
      tone: 'neutral',
    },
    emptyState: {
      title: 'Données de sommeil indisponibles.',
      description: 'Synchronise tes donnees ou reessaie plus tard.',
    },
    hierarchy: { rootId: 'sleep', order: ['hero', 'stats', 'coach', 'insights', 'trends'] },
    sections: [],
  };
}

export function resolveSleepNightStatus(
  trainingDayId: string,
  totalSleepMin: number | null,
  liveDayId: string = format(new Date(), 'yyyy-MM-dd'),
): SleepNightStatus {
  if (isSet(totalSleepMin) && totalSleepMin > 0) {
    return 'present';
  }
  return trainingDayId === liveDayId ? 'pending' : 'missing';
}

export function sleepAdequacySignalForNight(
  nightStatus: SleepNightStatus,
  sleepScore: number | null,
): SleepAdequacySignal {
  if (nightStatus === 'pending') {
    return 'PENDING';
  }
  if (nightStatus === 'missing') {
    return 'MISSING';
  }
  return mapSleepScoreToAdequacy(sleepScore) ?? 'MISSING';
}

function computeAwakeMinutes(input: {
  totalSleepMin: number | null;
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  todayEntry: DailyHealthRow | null;
}): number | null {
  const { totalSleepMin, deepMin, remMin, lightMin, todayEntry } = input;
  if (isSet(totalSleepMin) && isSet(deepMin) && isSet(remMin) && isSet(lightMin)) {
    return Math.max(0, totalSleepMin - deepMin - remMin - lightMin);
  }
  return todayEntry?.sleepAwakeMin ?? null;
}

function computeSleepTrendStats(input: {
  healthByDay: Map<string, DailyHealthRow>;
  refDate: Date;
  nightPresent: boolean;
  totalSleepMin: number | null;
  sleepTargetMin: number;
}) {
  const { healthByDay, refDate, nightPresent, totalSleepMin, sleepTargetMin } = input;
  const last7Sleep = buildDailyWindowSeries(
    healthByDay,
    7,
    (d, e) => {
      if (isSameDay(d, refDate)) {
        return null;
      }
      return e ? effectiveSleepMinutes(e) : null;
    },
    refDate,
  ).filter((value): value is number => isSet(value));

  const avgSleepMinutes7d =
    last7Sleep.length > 0
      ? Math.round(last7Sleep.reduce((sum, value) => sum + value, 0) / last7Sleep.length)
      : null;

  const sleepDelta7d =
    nightPresent && isSet(totalSleepMin) && isSet(avgSleepMinutes7d)
      ? totalSleepMin - avgSleepMinutes7d
      : null;
  const targetDeltaMin =
    nightPresent && isSet(totalSleepMin) ? totalSleepMin - sleepTargetMin : null;

  return { sleepDelta7d, targetDeltaMin, avgSleepMinutes7d };
}

function buildSleepRecoveryNote(input: {
  nightPresent: boolean;
  recovery: NonNullable<Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>['recovery']>;
  autonomicScore: number | null;
  sleepScore: number | null;
}): string | null {
  const { nightPresent, recovery, autonomicScore, sleepScore } = input;
  if (!nightPresent || recovery.readinessScore === undefined || recovery.readinessScore === null) {
    return null;
  }
  const recoverySignal = mapRecoveryToSignal(recovery.readinessCategory as ReadinessCategory);
  if (isSet(autonomicScore) && isSet(sleepScore) && autonomicScore > sleepScore) {
    return `Récupération ${recovery.readinessScore}/100 (${recoverySignal.label.toLowerCase()}) — la VFC compense partiellement le sommeil.`;
  }
  if (recovery.primaryLimitingFactor === 'sleep') {
    return `Récupération ${recovery.readinessScore}/100 — le sommeil est le facteur limitant aujourd'hui.`;
  }
  return null;
}

function buildSleepBarData(
  healthByDay: Map<string, DailyHealthRow>,
  refDate: Date,
  sleepTargetMin: number,
) {
  return buildDailyWindowSeries(
    healthByDay,
    14,
    (d, e) => {
      const mins = e?.sleepMinutes ?? null;
      let fill = 'var(--muted-foreground)';
      if (isSet(mins)) {
        fill = mins >= sleepTargetMin ? 'var(--color-signal-base)' : 'var(--color-signal-caution)';
      }
      return { date: format(d, 'dd/MM', { locale: fr }), minutes: mins, fill };
    },
    refDate,
  );
}

function readSleepPhaseMinutes(todayEntry: DailyHealthRow | null) {
  return {
    deepMin: todayEntry?.sleepDeepMin ?? null,
    remMin: todayEntry?.sleepRemMin ?? null,
    lightMin: todayEntry?.sleepLightMin ?? null,
    totalSleepMin: todayEntry ? effectiveSleepMinutes(todayEntry) : null,
  };
}

async function assembleSleepNightSnapshot(input: {
  trainingDayId: string;
  refDate: Date;
  healthEntries: Awaited<ReturnType<typeof getHealthEntries>>;
  athleteProfile: Awaited<ReturnType<typeof getAthleteProfile>>;
  recovery: NonNullable<Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>['recovery']>;
  /** Recent day strain 0–21 for Sleep Needed (ADR-079). */
  recentStrainScore?: number | null;
}) {
  const sleepGoals = {
    targetDurationMin: input.athleteProfile?.sleepTargetMinutes ?? null,
    bedtimeTargetMin: input.athleteProfile?.sleepBedtimeTargetMin ?? null,
  };
  const healthByDay = indexHealthEntriesByDay(input.healthEntries);
  const todayEntry = getIndexedHealthEntry(healthByDay, input.refDate);
  const phases = readSleepPhaseMinutes(todayEntry);
  const awakeMin = computeAwakeMinutes({ ...phases, todayEntry });
  const sleepTargetMin = input.athleteProfile?.sleepTargetMinutes ?? SLEEP_TARGET_MIN;
  const nightStatus = resolveSleepNightStatus(input.trainingDayId, phases.totalSleepMin);
  const sleepEfficiencyPercent = computeSleepEfficiencyPct({
    totalSleepMin: phases.totalSleepMin,
    awakeMin,
    bedtimeMin: todayEntry?.sleepBedtimeMin ?? null,
    wakeMin: todayEntry?.sleepWakeMin ?? null,
  });

  return {
    refDate: input.refDate,
    healthEntries: input.healthEntries,
    healthByDay,
    todayEntry,
    ...phases,
    awakeMin,
    sleepTargetMin,
    nightStatus,
    nightPresent: nightStatus === 'present',
    coachView: analyzeSleep(
      toSleepEntryInputs(input.healthEntries),
      { ...sleepGoals },
      {
        recentStrainScore: input.recentStrainScore ?? null,
        sleepEfficiencyPercent,
      },
    ),
    recovery: input.recovery,
  };
}

async function loadSleepNightData(input: {
  athleteId: string;
  trainingDayId: string;
  recovery: NonNullable<Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>['recovery']>;
  recentStrainScore?: number | null;
}) {
  const refDate = parseISO(input.trainingDayId);
  const [healthEntries, athleteProfile] = await Promise.all([
    getHealthEntries(input.athleteId, 30, refDate),
    getAthleteProfile(input.athleteId),
  ]);
  return assembleSleepNightSnapshot({
    trainingDayId: input.trainingDayId,
    refDate,
    healthEntries,
    athleteProfile,
    recovery: input.recovery,
    recentStrainScore: input.recentStrainScore,
  });
}

function resolveSleepScorePresentation(night: Awaited<ReturnType<typeof loadSleepNightData>>) {
  const scoreBreakdown = buildSleepScoreBreakdown({
    deepMin: night.deepMin,
    remMin: night.remMin,
    totalMin: night.totalSleepMin,
    debtMin: null,
    targetMin: night.sleepTargetMin,
  });
  const sleepScore = night.nightPresent ? (scoreBreakdown.sharpitScore ?? null) : null;
  const adequacyDisplay = mapSleepAdequacySignalToDisplay(
    sleepAdequacySignalForNight(night.nightStatus, sleepScore),
  );
  return { scoreBreakdown, sleepScore, adequacyDisplay };
}

function readSleepTimingFields(
  todayEntry: Awaited<ReturnType<typeof loadSleepNightData>>['todayEntry'],
) {
  return {
    bedtimeMin: todayEntry?.sleepBedtimeMin ?? null,
    wakeMin: todayEntry?.sleepWakeMin ?? null,
    garminScore: todayEntry?.sleepScore ?? null,
  };
}

function buildPopulatedSleepViewModel(input: {
  snapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>;
  night: Awaited<ReturnType<typeof loadSleepNightData>>;
}): SleepViewModel {
  const { snapshot, night } = input;
  const scorePresentation = resolveSleepScorePresentation(night);
  const timing = readSleepTimingFields(night.todayEntry);
  const { sleepDelta7d, targetDeltaMin } = computeSleepTrendStats({
    healthByDay: night.healthByDay,
    refDate: night.refDate,
    nightPresent: night.nightPresent,
    totalSleepMin: night.totalSleepMin,
    sleepTargetMin: night.sleepTargetMin,
  });
  const autonomicScore = night.recovery.dimensions.autonomic.available
    ? night.recovery.dimensions.autonomic.score
    : null;
  const recoveryNote = buildSleepRecoveryNote({
    nightPresent: night.nightPresent,
    recovery: night.recovery,
    autonomicScore,
    sleepScore: scorePresentation.sleepScore,
  });
  const barData = buildSleepBarData(night.healthByDay, night.refDate, night.sleepTargetMin);
  const confidenceTier = mapConfidenceToTier(night.recovery.confidence);
  const insights = buildSleepPageInsights({
    adequacyLabel: scorePresentation.adequacyDisplay.label,
    coachView: night.coachView,
    confidence: night.recovery.confidence,
    nightStatus: night.nightStatus,
    recoveryNote,
    sleepDelta7d,
    sleepScore: scorePresentation.sleepScore,
    targetDeltaMin,
  });

  return {
    nightStatus: night.nightStatus,
    sleepScore: scorePresentation.sleepScore,
    adequacyDisplay: scorePresentation.adequacyDisplay,
    scoreBreakdown: scorePresentation.scoreBreakdown,
    totalSleepMin: night.totalSleepMin,
    deepMin: night.deepMin,
    remMin: night.remMin,
    lightMin: night.lightMin,
    awakeMin: night.awakeMin,
    ...timing,
    sleepDelta7d,
    targetDeltaMin,
    sleepTargetMin: night.sleepTargetMin,
    coachView: night.coachView,
    barData,
    recoveryNote,
    insights,
    globalDecision: buildGlobalDecisionContext(snapshot, 'SLEEP'),
    confidencePresentation: {
      pct: Math.round(night.recovery.confidence * 100),
      label: null,
      tone: CONFIDENCE_TONE[confidenceTier] ?? 'neutral',
    },
    emptyState: null,
    hierarchy: {
      rootId: 'sleep',
      order: ['hero', 'stats', 'coach', 'phases', 'insights', 'trends'],
    },
    sections: [],
  };
}

export async function buildSleepViewModel(
  athleteId: string,
  trainingDayId: string,
): Promise<SleepViewModel> {
  const snapshot = await getOrBuildAthleteSnapshot(athleteId, trainingDayId);
  const { recovery } = snapshot;

  if (!recovery) {
    return emptySleepViewModel();
  }

  const night = await loadSleepNightData({
    athleteId,
    trainingDayId,
    recovery,
    recentStrainScore: snapshot.dailyStrain?.strainScore ?? null,
  });
  return buildPopulatedSleepViewModel({ snapshot, night });
}
