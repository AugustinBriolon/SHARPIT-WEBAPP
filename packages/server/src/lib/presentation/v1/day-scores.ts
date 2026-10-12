/**
 * SharpIt day scores for V1 Today / Effort (ADR-079): stress surface, Energy Bank, target band.
 * Computed on read from dailyHealth + snapshot — no new persistence table in v1.
 *
 * Callers: handlers/v1/today/handler.ts, handlers/v1/effort/handler.ts (targetBand).
 * API: GET /api/v1/today optional stress|energyBank|targetBand; GET /api/v1/effort targetBand.
 * Schema: no new Prisma tables — reads dailyHealth + athlete snapshot.
 * User: "Implement the plan as specified… Don't stop until you have completed all the to-dos."
 */

import { format } from 'date-fns';
import {
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

export type V1DayScores = {
  stress: V1TodayStress | null;
  energyBank: V1TodayEnergyBank | null;
  targetBand: V1TodayTargetBand | null;
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

/**
 * Loads stress, Energy Bank and target strain band for a training day.
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

  const recentCloses: Array<number | null> = [];
  for (const entry of [...healthEntries].reverse()) {
    const dayId = trainingDayKey(entry.date);
    if (dayId >= trainingDayId) {
      continue;
    }
    const close = runEnergyBankModel({
      readinessScore: entry.recoveryScore ?? null,
      sleepDebtMin: sleepCoach.debt7Min,
      strainScore: null,
      stress: entry.stress ?? null,
      previousClose: recentCloses.at(-1) ?? null,
      hourOfDay: 22,
    }).value;
    recentCloses.push(close);
  }

  const energyResult = runEnergyBankModel({
    readinessScore: readiness,
    sleepDebtMin: sleepCoach.debt7Min,
    strainScore,
    stress: stressValue,
    previousClose: recentCloses.at(-1) ?? null,
    hourOfDay,
  });
  const energyBank =
    isSet(energyResult.value) || energyResult.series.length > 0
      ? projectEnergyBank({
          ...energyResult,
          typicalBaseline: typicalEnergyBaseline(recentCloses),
        })
      : null;

  const cutoff = new Date(refDate);
  cutoff.setDate(cutoff.getDate() - 14);
  const recentStrainScores = dailyStress
    .filter((row) => row.date >= cutoff && row.date < refDate)
    .map((row) => tssToStrainProxy(row.load));

  const band = computeTargetStrainBand({
    readinessScore: readiness,
    recentStrainScores,
    todayStrainScore: strainScore,
  });
  const targetBand = band ? projectTargetBand(band) : null;

  return { stress, energyBank, targetBand };
}
