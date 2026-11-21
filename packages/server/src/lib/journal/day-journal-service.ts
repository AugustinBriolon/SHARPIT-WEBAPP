import { isUniqueViolation } from '@sharpit/server/lib/prisma-errors';
import { athleteTimeZone, minuteOnDay } from '@sharpit/server/lib/athlete-time-zone';
import type { PrismaClient } from '@prisma/client';
import {
  emptyDayJournalEntry,
  type DayJournalEntry,
  type DayJournalFactorState,
} from '@sharpit/app/lib/journal/day-journal';
import {
  isDayContextFactorId,
  type DayContextFactorId,
} from '@sharpit/app/lib/journal/day-context-factors';

export type DayJournalWriteInput = {
  trainingDayId: string;
  factors?: DayJournalEntry['factors'];
  moodLabel?: string | null;
  hydrationMl?: number | null;
  caffeineMg?: number | null;
  /** When the last coffee was had, minutes after local midnight; absent: now on a rise. */
  caffeineMinute?: number | null;
  drivingMinutes?: number | null;
};

function parseFactors(raw: unknown): DayJournalEntry['factors'] {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const factors: DayJournalEntry['factors'] = {};
  for (const [key, state] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDayContextFactorId(key)) {
      continue;
    }
    if (state === 'unset' || state === 'no' || state === 'yes') {
      factors[key as DayContextFactorId] = state as DayJournalFactorState;
    }
  }
  return factors;
}

export function rowToDayJournalEntry(row: {
  trainingDayId: string;
  factors: unknown;
  moodLabel: string | null;
  hydrationMl: number | null;
  caffeineMg: number | null;
  caffeineMinute?: number | null;
  drivingMinutes?: number | null;
  updatedAt: Date;
}): DayJournalEntry {
  return {
    trainingDayId: row.trainingDayId,
    factors: parseFactors(row.factors),
    moodLabel: row.moodLabel,
    hydrationMl: row.hydrationMl,
    caffeineMg: row.caffeineMg ?? 0,
    caffeineMinute: row.caffeineMinute ?? null,
    drivingMinutes: row.drivingMinutes ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getDayJournalEntry(
  prisma: PrismaClient,
  athleteId: string,
  trainingDayId: string,
): Promise<DayJournalEntry> {
  const row = await prisma.athleteDayJournal.findUnique({
    where: { athleteId_trainingDayId: { athleteId, trainingDayId } },
  });
  if (!row) {
    return emptyDayJournalEntry(trainingDayId);
  }
  return rowToDayJournalEntry(row);
}

type ExistingDayJournalRow = {
  factors: unknown;
  moodLabel: string | null;
  hydrationMl: number | null;
  caffeineMg: number | null;
  drivingMinutes?: number | null;
} | null;

function resolveOptionalField<T>(
  inputValue: T | undefined,
  existingValue: T | null | undefined,
): T | null {
  if (inputValue !== undefined) {
    return inputValue;
  }
  return existingValue ?? null;
}

function mergeDayJournalWrite(
  existing: ExistingDayJournalRow,
  input: DayJournalWriteInput,
): {
  factors: DayJournalEntry['factors'];
  moodLabel: string | null;
  hydrationMl: number | null;
  caffeineMg: number | null;
  drivingMinutes: number | null;
} {
  return {
    factors: input.factors ?? parseFactors(existing?.factors) ?? {},
    moodLabel: resolveOptionalField(input.moodLabel, existing?.moodLabel),
    hydrationMl: resolveOptionalField(input.hydrationMl, existing?.hydrationMl),
    caffeineMg: resolveOptionalField(input.caffeineMg, existing?.caffeineMg),
    drivingMinutes: resolveOptionalField(input.drivingMinutes, existing?.drivingMinutes),
  };
}

/**
 * Two writes on a day not yet stored both try to create it; the loser is run again, and now
 * merges onto the winner's row instead of failing.
 */
export async function upsertDayJournalEntryDb(
  prisma: PrismaClient,
  athleteId: string,
  input: DayJournalWriteInput,
): Promise<DayJournalEntry> {
  try {
    return await writeDayJournalEntry(prisma, athleteId, input);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    return writeDayJournalEntry(prisma, athleteId, input);
  }
}

/**
 * When the day's last coffee was had (ADR-138). A time the athlete gives wins; otherwise a rise
 * is a coffee had now — on today only, a coffee noted for another day has no time to assume — and a
 * lower or equal total keeps the time already there. No caffeine left clears it.
 */
export function nextCaffeineMinute(
  existing: { caffeineMg: number | null; caffeineMinute?: number | null } | null,
  caffeineMg: number | null,
  given: number | null | undefined,
  nowMinuteOnDay: number | null,
): number | null {
  if (!caffeineMg || caffeineMg <= 0) {
    return null;
  }
  if (given !== undefined) {
    return given;
  }
  if (caffeineMg > (existing?.caffeineMg ?? 0)) {
    return nowMinuteOnDay;
  }
  return existing?.caffeineMinute ?? null;
}

async function writeDayJournalEntry(
  prisma: PrismaClient,
  athleteId: string,
  input: DayJournalWriteInput,
): Promise<DayJournalEntry> {
  const existing = await prisma.athleteDayJournal.findUnique({
    where: {
      athleteId_trainingDayId: { athleteId, trainingDayId: input.trainingDayId },
    },
  });

  const { factors, moodLabel, hydrationMl, caffeineMg, drivingMinutes } = mergeDayJournalWrite(
    existing,
    input,
  );

  // « Now » is read on the athlete's clock only when a coffee is added without a time.
  const addsCoffeeNow =
    input.caffeineMinute === undefined && (caffeineMg ?? 0) > (existing?.caffeineMg ?? 0);
  const nowMinute = addsCoffeeNow
    ? minuteOnDay(new Date(), input.trainingDayId, await athleteTimeZone(athleteId, prisma))
    : null;
  const caffeineMinute = nextCaffeineMinute(existing, caffeineMg, input.caffeineMinute, nowMinute);

  const row = await prisma.athleteDayJournal.upsert({
    where: {
      athleteId_trainingDayId: { athleteId, trainingDayId: input.trainingDayId },
    },
    create: {
      athleteId,
      trainingDayId: input.trainingDayId,
      factors,
      moodLabel,
      hydrationMl,
      caffeineMg,
      caffeineMinute,
      drivingMinutes,
    },
    update: {
      factors,
      moodLabel,
      hydrationMl,
      caffeineMg,
      caffeineMinute,
      drivingMinutes,
    },
  });

  return rowToDayJournalEntry(row);
}
