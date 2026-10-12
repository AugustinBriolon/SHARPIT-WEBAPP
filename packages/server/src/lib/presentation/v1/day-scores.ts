/**
 * SharpIt day scores for V1 Today / Effort (ADR-079): stress surface, Energy Bank, target band.
 * Computed on read from dailyHealth + snapshot — no new persistence table in v1.
 *
 * Callers: handlers/v1/today/handler.ts, handlers/v1/effort/handler.ts (targetBand / strainPerformance),
 * morning-push, coach tools, athlete-notifications.
 * API: GET /api/v1/today optional stress|energyBank|targetBand|timeline; GET /api/v1/effort extras.
 * Schema: no new Prisma tables — reads dailyHealth + athlete snapshot.
 * User: "fix all" — complete go-all Bevel parity sprints (stress samples → timeline → strain perf + bedtime).
 */

import { format } from 'date-fns';
import {
  buildDiurnalStressSamples,
  runEnergyBankModel,
  typicalEnergyBaseline,
  type EnergyBankResult,
} from '@sharpit/core/inference/energy-bank/model';
import {
  computeTargetStrainBand,
  type TargetStrainBand,
} from '@sharpit/core/inference/target-strain/model';
import { analyzeSleep, toSleepEntryInputs } from '@sharpit/app/lib/sleep/sleep';
import { getHealthEntries } from '@sharpit/server/lib/queries';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { loadDailyTrainingStressEntries } from '@sharpit/server/lib/training/pmc/pmc-server';
import { isSet } from '@sharpit/shared/value';

export type V1TodayStress = {
  value: number;
  asOf: string;
};

export type V1TodayEnergyBank = {
  algorithmVersion: string;
  value: number | null;
  typicalBaseline: number | null;
  asOfMinuteOfDay: number;
  series: Array<{ minuteOfDay: number; value: number }>;
};

export type V1TodayTargetBand = {
  algorithmVersion: string;
  low: number;
  high: number;
  status: 'below' | 'within' | 'above' | null;
};

export type V1StrainPerformanceDay = {
  date: string;
  strain: number | null;
  low: number;
  high: number;
  status: 'below' | 'within' | 'above' | null;
};

/** Rolling Strain Performance vs target band (last ~14 scored days). */
export type V1StrainPerformance = {
  withinCount: number;
  dayCount: number;
  withinPct: number | null;
  history: V1StrainPerformanceDay[];
};

export type V1DayScores = {
  stress: V1TodayStress | null;
  energyBank: V1TodayEnergyBank | null;
  targetBand: V1TodayTargetBand | null;
  strainPerformance: V1StrainPerformance | null;
};

function trainingDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Map daily TSS to the 0–21 strain scale for a rolling baseline (proxy until day-strain history is stored). */
function tssToStrainProxy(tss: number): number {
  return Math.max(0, Math.min(21, Math.round((tss / 5) * 10) / 10));
}

function projectEnergyBank(result: EnergyBankResult): V1TodayEnergyBank {
  return {
    algorithmVersion: result.algorithmVersion,
    value: result.value,
    typicalBaseline: result.typicalBaseline,
    asOfMinuteOfDay: result.asOfMinuteOfDay,
    series: result.series,
  };
}

function projectTargetBand(band: TargetStrainBand): V1TodayTargetBand {
  return {
    algorithmVersion: band.algorithmVersion,
    low: band.low,
    high: band.high,
    status: band.status,
  };
}

function projectStrainPerformance(history: V1StrainPerformanceDay[]): V1StrainPerformance | null {
  if (history.length === 0) {
    return null;
  }
  const scored = history.filter((day) => day.status !== null);
  const withinCount = scored.filter((day) => day.status === 'within').length;
  return {
    withinCount,
    dayCount: scored.length,
    withinPct: scored.length > 0 ? Math.round((withinCount / scored.length) * 100) : null,
    history,
  };
}

function recentEnergyCloses(
  healthEntries: Awaited<ReturnType<typeof getHealthEntries>>,
  trainingDayId: string,
  sleepDebtMin: number | null,
): Array<number | null> {
  const closes: Array<number | null> = [];
  for (const entry of [...healthEntries].reverse()) {
    const dayId = trainingDayKey(entry.date);
    if (dayId >= trainingDayId) {
      continue;
    }
    closes.push(
      runEnergyBankModel({
        readinessScore: entry.recoveryScore ?? null,
        sleepDebtMin,
        strainScore: null,
        stress: entry.stress ?? null,
        previousClose: closes.at(-1) ?? null,
        hourOfDay: 22,
        stressSamples: buildDiurnalStressSamples(entry.stress ?? null, 22),
      }).value,
    );
  }
  return closes;
}

function projectEnergyBankOrNull(input: {
  readiness: number | null;
  sleepDebtMin: number | null;
  strainScore: number | null;
  stressValue: number | null;
  recentCloses: Array<number | null>;
  hourOfDay: number;
}): V1TodayEnergyBank | null {
  const energyResult = runEnergyBankModel({
    readinessScore: input.readiness,
    sleepDebtMin: input.sleepDebtMin,
    strainScore: input.strainScore,
    stress: input.stressValue,
    previousClose: input.recentCloses.at(-1) ?? null,
    hourOfDay: input.hourOfDay,
    stressSamples: buildDiurnalStressSamples(input.stressValue, input.hourOfDay),
  });
  if (!isSet(energyResult.value) && energyResult.series.length === 0) {
    return null;
  }
  return projectEnergyBank({
    ...energyResult,
    typicalBaseline: typicalEnergyBaseline(input.recentCloses),
  });
}

function strainWindowMaps(
  dailyStress: Awaited<ReturnType<typeof loadDailyTrainingStressEntries>>,
  refDate: Date,
): { stressByDay: Map<string, number>; recentStrainScores: number[] } {
  const cutoff = new Date(refDate);
  cutoff.setDate(cutoff.getDate() - 14);
  const stressByDay = new Map(
    dailyStress
      .filter((row) => row.date >= cutoff && row.date <= refDate)
      .map((row) => [trainingDayKey(row.date), tssToStrainProxy(row.load)] as const),
  );
  const recentStrainScores = dailyStress
    .filter((row) => row.date >= cutoff && row.date < refDate)
    .map((row) => tssToStrainProxy(row.load));
  return { stressByDay, recentStrainScores };
}

function buildStrainPerformanceHistory(input: {
  trainingDayId: string;
  strainScore: number | null;
  readiness: number | null;
  stressByDay: Map<string, number>;
  byDay: Map<string, Awaited<ReturnType<typeof getHealthEntries>>[number]>;
}): V1StrainPerformanceDay[] {
  const historyDays = [...input.stressByDay.keys()].sort();
  const history: V1StrainPerformanceDay[] = [];
  for (let index = 0; index < historyDays.length; index += 1) {
    const dayId = historyDays[index]!;
    const dayStrain =
      dayId === input.trainingDayId ? input.strainScore : (input.stressByDay.get(dayId) ?? null);
    const prior = historyDays
      .slice(Math.max(0, index - 14), index)
      .map((id) => input.stressByDay.get(id) ?? null);
    const dayHealth = input.byDay.get(dayId);
    const dayBand = computeTargetStrainBand({
      readinessScore:
        dayHealth?.recoveryScore ?? (dayId === input.trainingDayId ? input.readiness : null),
      recentStrainScores: prior,
      todayStrainScore: dayStrain,
    });
    if (!dayBand) {
      continue;
    }
    history.push({
      date: dayId,
      strain: dayStrain,
      low: dayBand.low,
      high: dayBand.high,
      status: dayBand.status,
    });
  }
  return history;
}

/**
 * Loads stress, Energy Bank, target strain band and Strain Performance for a training day.
 * shortcut: double-fetches snapshot vs Today VM; merge loaders when Today is refactored.
 */
export async function loadV1DayScores(
  athleteId: string,
  trainingDayId: string,
  now: Date = new Date(),
): Promise<V1DayScores> {
  const refDate = new Date(`${trainingDayId}T12:00:00`);
  const [snapshot, healthEntries, dailyStress] = await Promise.all([
    getOrBuildAthleteSnapshot(athleteId, trainingDayId),
    getHealthEntries(athleteId, 14, refDate),
    loadDailyTrainingStressEntries(athleteId, { refDate }),
  ]);

  const byDay = new Map(healthEntries.map((entry) => [trainingDayKey(entry.date), entry] as const));
  const todayHealth = byDay.get(trainingDayId);
  const stressValue =
    todayHealth?.stress ?? snapshot.dailyStrain?.trace?.cardiovascularSignals?.stress ?? null;
  const stress: V1TodayStress | null = isSet(stressValue)
    ? { value: stressValue, asOf: trainingDayId }
    : null;

  const sleepCoach = analyzeSleep(toSleepEntryInputs(healthEntries), {
    targetDurationMin: null,
  });
  const readiness = snapshot.readiness ?? todayHealth?.recoveryScore ?? null;
  const strainScore = snapshot.dailyStrain?.strainScore ?? null;
  const hourOfDay = trainingDayKey(now) === trainingDayId ? now.getHours() : 22;
  const recentCloses = recentEnergyCloses(healthEntries, trainingDayId, sleepCoach.debt7Min);
  const energyBank = projectEnergyBankOrNull({
    readiness,
    sleepDebtMin: sleepCoach.debt7Min,
    strainScore,
    stressValue,
    recentCloses,
    hourOfDay,
  });
  const { stressByDay, recentStrainScores } = strainWindowMaps(dailyStress, refDate);
  const band = computeTargetStrainBand({
    readinessScore: readiness,
    recentStrainScores,
    todayStrainScore: strainScore,
  });

  return {
    stress,
    energyBank,
    targetBand: band ? projectTargetBand(band) : null,
    strainPerformance: projectStrainPerformance(
      buildStrainPerformanceHistory({
        trainingDayId,
        strainScore,
        readiness,
        stressByDay,
        byDay,
      }),
    ),
  };
}
