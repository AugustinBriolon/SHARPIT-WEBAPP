import { format, parseISO, subDays } from 'date-fns';
import type { RecoveryTone } from '@sharpit/app/lib/recovery/recovery';
import type { SleepNightStatus, SleepViewModel } from '@sharpit/app/presentation/sleep-view-model';
import type { SleepAdequacySignal } from '@sharpit/app/lib/today/dashboard/today-mapping';
import { sleepAdequacySignalForNight } from '@sharpit/server/lib/presentation/sleep/sleep';

export type V1SleepSource = Pick<
  SleepViewModel,
  | 'nightStatus'
  | 'sleepScore'
  | 'adequacyDisplay'
  | 'scoreBreakdown'
  | 'totalSleepMin'
  | 'deepMin'
  | 'remMin'
  | 'lightMin'
  | 'awakeMin'
  | 'bedtimeMin'
  | 'wakeMin'
  | 'sleepDelta7d'
  | 'targetDeltaMin'
  | 'sleepTargetMin'
  | 'coachView'
  | 'barData'
  | 'recoveryNote'
  | 'confidencePresentation'
  | 'emptyState'
>;

export type V1SleepResponse = {
  apiVersion: 1;
  trainingDayId: string;
  nightStatus: SleepNightStatus;
  empty: { title: string; message: string | null } | null;
  score: number | null;
  /** The key drives the tone on the client; the label is the web's own wording. */
  adequacy: { key: SleepAdequacySignal; label: string };
  durationMin: number | null;
  targetMin: number;
  targetDeltaMin: number | null;
  delta7dMin: number | null;
  stages: {
    deepMin: number | null;
    remMin: number | null;
    lightMin: number | null;
    awakeMin: number | null;
  };
  /** Minutes after midnight, as the health entries store them. */
  bedtimeMin: number | null;
  wakeMin: number | null;
  breakdown: {
    durationScore: number | null;
    architectureScore: number | null;
    restorativeRatio: number | null;
  };
  averages: {
    score: number | null;
    durationMin: number | null;
    deepPct: number | null;
    remPct: number | null;
    nights: number;
  };
  regularityMin: number | null;
  recommendedBedtimeMin: number | null;
  recommendedDurationMin: number | null;
  /** Enriched “sleep needed” tonight (ADR-079). Callers: sleep handler, SleepTests. API: GET /api/v1/sleep. */
  sleepNeededMin: number | null;
  sleepNeededContributors: {
    debtBoostMin: number;
    strainBoostMin: number;
    efficiencyBoostMin: number;
  } | null;
  debt7Min: number | null;
  debt14Min: number | null;
  recoveryNote: string | null;
  /** Oldest first, one entry per night of the window ending on `trainingDayId`. */
  history: Array<{ date: string; minutes: number | null }>;
  insights: Array<{ tone: RecoveryTone; title: string; detail: string }>;
  confidencePct: number | null;
};

/**
 * The web chart labels its bars `dd/MM`, which loses the year. The window always ends on
 * the training day, so each bar's ISO date follows from its position.
 */
function projectHistory(
  barData: V1SleepSource['barData'],
  trainingDayId: string,
): V1SleepResponse['history'] {
  const refDate = parseISO(trainingDayId);
  return barData.map((point, index) => ({
    date: format(subDays(refDate, barData.length - 1 - index), 'yyyy-MM-dd'),
    minutes: point.minutes,
  }));
}

function projectAverages(coachView: V1SleepSource['coachView']): V1SleepResponse['averages'] {
  const { score, durationMin, deepPct, remPct, nights } = coachView.avg;
  return { score, durationMin, deepPct, remPct, nights };
}

function projectEmpty(emptyState: V1SleepSource['emptyState']): V1SleepResponse['empty'] {
  if (!emptyState) {
    return null;
  }
  return { title: emptyState.title, message: emptyState.description ?? null };
}

/** Canonical Sleep payload for native clients — a projection, no new domain logic. */
export function projectV1Sleep(source: V1SleepSource, trainingDayId: string): V1SleepResponse {
  const { coachView } = source;
  return {
    apiVersion: 1,
    trainingDayId,
    nightStatus: source.nightStatus,
    empty: projectEmpty(source.emptyState),
    score: source.sleepScore,
    adequacy: {
      key: sleepAdequacySignalForNight(source.nightStatus, source.sleepScore),
      label: source.adequacyDisplay.label,
    },
    durationMin: source.totalSleepMin,
    targetMin: source.sleepTargetMin,
    targetDeltaMin: source.targetDeltaMin,
    delta7dMin: source.sleepDelta7d,
    stages: {
      deepMin: source.deepMin,
      remMin: source.remMin,
      lightMin: source.lightMin,
      awakeMin: source.awakeMin,
    },
    bedtimeMin: source.bedtimeMin,
    wakeMin: source.wakeMin,
    breakdown: {
      durationScore: source.scoreBreakdown.durationScore,
      architectureScore: source.scoreBreakdown.architectureScore,
      restorativeRatio: source.scoreBreakdown.restorativeRatio,
    },
    averages: projectAverages(coachView),
    regularityMin: coachView.regularityMin,
    recommendedBedtimeMin: coachView.recommendedBedtimeMin,
    recommendedDurationMin: coachView.hasData ? coachView.recommendedDurationMin : null,
    sleepNeededMin: coachView.hasData ? coachView.sleepNeededMin : null,
    sleepNeededContributors: coachView.hasData ? coachView.sleepNeededContributors : null,
    debt7Min: coachView.debt7Min,
    debt14Min: coachView.debt14Min,
    recoveryNote: source.recoveryNote,
    history: projectHistory(source.barData, trainingDayId),
    insights: coachView.insights.map(({ tone, title, detail }) => ({ tone, title, detail })),
    confidencePct: source.confidencePresentation.pct,
  };
}
