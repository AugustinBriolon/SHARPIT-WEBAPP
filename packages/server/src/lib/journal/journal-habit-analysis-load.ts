/**
 * Load joined journal × DailyHealth series, and the daily training load, for habit analysis.
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { parseDayJournalEntry } from '@sharpit/app/lib/journal/day-journal';
import {
  LATE_COFFEE_FACTOR_ID,
  lateCoffeeFactor,
} from '@sharpit/app/lib/journal/journal-caffeine-timing';
import { athleteTimeZone, minuteOnDay } from '@sharpit/server/lib/athlete-time-zone';
import {
  buildJournalHabitFindings,
  recordedFactorValue,
  shiftTrainingDayId,
  type JournalAnalysisDay,
  type JournalHabitFinding,
  type RecordedFactor,
} from '@sharpit/app/lib/journal/journal-habit-analysis';
import { dayHasJournalSignal } from '@sharpit/app/lib/journal/journal-limits';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';
import { loadDailyTrainingStressEntries } from '@sharpit/server/lib/training/pmc/pmc-server';

export function trainingDayIdFromDate(date: Date): string {
  return toUtcDateOnly(date).toISOString().slice(0, 10);
}

/** Recorded yes/no states from a journal `factors` JSON bag; unset is dropped. */
export function parseRecordedFactors(raw: unknown): Record<string, RecordedFactor | null> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const factors: Record<string, RecordedFactor | null> = {};
  for (const [id, state] of Object.entries(raw as Record<string, unknown>)) {
    const recorded = recordedFactorValue(typeof state === 'string' ? state : null);
    if (recorded !== null) {
      factors[id] = recorded;
    }
  }
  return factors;
}

const JOURNAL_ROW_SELECT = {
  trainingDayId: true,
  factors: true,
  moodLabel: true,
  hydrationMl: true,
  caffeineMg: true,
  caffeineLoggedAt: true,
  drivingMinutes: true,
  updatedAt: true,
} as const;

export const HEALTH_ROW_SELECT = {
  date: true,
  sleepMinutes: true,
  sleepBedtimeMin: true,
  recoveryScore: true,
  bodyBattery: true,
} as const;

type JournalRow = Prisma.AthleteDayJournalGetPayload<{ select: typeof JOURNAL_ROW_SELECT }>;
type HealthRow = Prisma.DailyHealthGetPayload<{ select: typeof HEALTH_ROW_SELECT }>;

function indexHealthByDay(rows: readonly HealthRow[]): Map<string, HealthRow> {
  const healthByDay = new Map<string, HealthRow>();
  for (const row of rows) {
    healthByDay.set(trainingDayIdFromDate(row.date), row);
  }
  return healthByDay;
}

function healthOutcomes(
  health: HealthRow | undefined,
): Pick<JournalAnalysisDay, 'sleepMinutes' | 'recoveryScore' | 'bodyBattery'> {
  return {
    sleepMinutes: health?.sleepMinutes ?? null,
    recoveryScore: health?.recoveryScore ?? null,
    bodyBattery: health?.bodyBattery ?? null,
  };
}

/**
 * The day's caffeine timing as a factor (ADR-139): its last coffee against the bedtime of the night
 * after it, the one the analysis reads the day's habits on.
 */
function caffeineTimingFactors(
  row: JournalRow,
  healthByDay: Map<string, HealthRow>,
  timeZone: string,
): Record<string, RecordedFactor> {
  const nextDay = shiftTrainingDayId(row.trainingDayId, 1);
  const late = lateCoffeeFactor({
    caffeineMg: row.caffeineMg,
    lastCoffeeMinute: row.caffeineLoggedAt
      ? minuteOnDay(row.caffeineLoggedAt, row.trainingDayId, timeZone)
      : null,
    nextBedtimeMinute: (nextDay && healthByDay.get(nextDay)?.sleepBedtimeMin) ?? null,
  });
  return late ? { [LATE_COFFEE_FACTOR_ID]: late } : {};
}

/** Null when the day carries no explicit athlete signal. */
function toAnalysisDay(
  row: JournalRow,
  healthByDay: Map<string, HealthRow>,
  timeZone: string,
): JournalAnalysisDay | null {
  const entry = parseDayJournalEntry(row.trainingDayId, {
    trainingDayId: row.trainingDayId,
    factors: row.factors,
    moodLabel: row.moodLabel,
    hydrationMl: row.hydrationMl,
    caffeineMg: row.caffeineMg,
    drivingMinutes: row.drivingMinutes,
    updatedAt: row.updatedAt.toISOString(),
  });
  if (!entry || !dayHasJournalSignal(entry)) {
    return null;
  }
  return {
    trainingDayId: row.trainingDayId,
    factors: {
      ...parseRecordedFactors(entry.factors),
      ...caffeineTimingFactors(row, healthByDay, timeZone),
    },
    ...healthOutcomes(healthByDay.get(row.trainingDayId)),
  };
}

export async function loadJournalAnalysisSeries(
  prisma: PrismaClient,
  athleteId: string,
): Promise<JournalAnalysisDay[]> {
  const [journals, healthRows, timeZone] = await Promise.all([
    prisma.athleteDayJournal.findMany({ where: { athleteId }, select: JOURNAL_ROW_SELECT }),
    prisma.dailyHealth.findMany({ where: { athleteId }, select: HEALTH_ROW_SELECT }),
    athleteTimeZone(athleteId),
  ]);

  const healthByDay = indexHealthByDay(healthRows);
  const days: JournalAnalysisDay[] = [];
  for (const row of journals) {
    const day = toAnalysisDay(row, healthByDay, timeZone);
    if (day) {
      days.push(day);
    }
  }

  return days.sort((a, b) => a.trainingDayId.localeCompare(b.trainingDayId));
}

const DAY_MS = 86_400_000;

/** Calendar days from the first to the last signalled day, inclusive. */
export function countDaysInSpan(series: readonly JournalAnalysisDay[]): number {
  const first = series[0]?.trainingDayId;
  const last = series[series.length - 1]?.trainingDayId;
  if (!first || !last) {
    return 0;
  }
  return Math.round((Date.parse(last) - Date.parse(first)) / DAY_MS) + 1;
}

/** TSS per training day, from the same source as the PMC (the Core's Training Stress). */
export async function loadDailyLoadByDay(athleteId: string): Promise<Map<string, number>> {
  const entries = await loadDailyTrainingStressEntries(athleteId);
  return new Map(entries.map(({ date, load }) => [trainingDayIdFromDate(date), load]));
}

export async function loadJournalHabitFindings(
  prisma: PrismaClient,
  athleteId: string,
): Promise<{ daysWithSignal: number; daysInSpan: number; findings: JournalHabitFinding[] }> {
  const [series, loadByDay] = await Promise.all([
    loadJournalAnalysisSeries(prisma, athleteId),
    loadDailyLoadByDay(athleteId),
  ]);
  return {
    daysWithSignal: series.length,
    daysInSpan: countDaysInSpan(series),
    findings: buildJournalHabitFindings(series, { loadByDay }),
  };
}
