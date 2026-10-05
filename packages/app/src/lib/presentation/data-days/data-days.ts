import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { toTrainingDayId } from '@sharpit/app/lib/training/pmc/pmc';

/**
 * Which days carry data for a drill-down — drives the date selector's availability dot.
 *
 * Pure and client-safe: the route and the date selector share the domain list and
 * the range contract from here; Prisma access lives in `data-days-server.ts`.
 */

export const DATA_DAYS_DOMAINS = [
  'sleep',
  'recovery',
  'effort',
  'adaptation',
  'nutrition',
  'journal',
] as const;

export type DataDaysDomain = (typeof DATA_DAYS_DOMAINS)[number];

/** A wider range would let one request scan an athlete's whole history. */
export const DATA_DAYS_MAX_RANGE_DAYS = 92;

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface DataDaysHealthRow {
  date: Date;
  sleepMinutes: number | null;
  hrv: number | null;
  restingHr: number | null;
  recoveryScore: number | null;
  bodyBattery: number | null;
}

export interface DataDaysNutritionRow {
  date: Date;
  calories: number;
}

export interface DataDaysJournalRow {
  trainingDayId: string;
  factors: unknown;
  moodLabel: string | null;
  hydrationMl: number | null;
  caffeineMg: number | null;
  drivingMinutes?: number | null;
}

export interface DataDaysSources {
  health: readonly DataDaysHealthRow[];
  /** Activity start instants — mapped to their training day like the PMC does. */
  activityDates: readonly Date[];
  nutrition: readonly DataDaysNutritionRow[];
  /** Journal days the athlete wrote; absent when the domain does not read them. */
  journal?: readonly DataDaysJournalRow[];
  /** Days with a morning check-in — the journal's mood lives there, not on the journal row. */
  checkinDays?: readonly string[];
}

export interface DataDaysRequest {
  domain: DataDaysDomain;
  from: string;
  to: string;
}

export type DataDaysRequestParse =
  { ok: true; request: DataDaysRequest } | { ok: false; error: string };

export function isDataDaysDomain(value: string | null): value is DataDaysDomain {
  return value !== null && (DATA_DAYS_DOMAINS as readonly string[]).includes(value);
}

/** Which raw sources a domain reads — the loader skips the others. */
export function dataDaysSourcesFor(domain: DataDaysDomain): {
  health: boolean;
  activities: boolean;
  nutrition: boolean;
  journal: boolean;
} {
  return {
    health: domain === 'sleep' || domain === 'recovery' || domain === 'adaptation',
    activities: domain === 'effort' || domain === 'adaptation',
    nutrition: domain === 'nutrition',
    journal: domain === 'journal',
  };
}

/**
 * A journal day counts once something was answered: a factor set to yes or no, a mood, a
 * caffeine, hydration or driving value. A row whose factors were all reset to « unset » is empty.
 */
export function journalDayHasAnswer(row: DataDaysJournalRow): boolean {
  const measured = [row.hydrationMl, row.caffeineMg, row.drivingMinutes];
  if (row.moodLabel || measured.some((value) => (value ?? 0) > 0)) {
    return true;
  }
  if (!row.factors || typeof row.factors !== 'object') {
    return false;
  }
  return Object.values(row.factors as Record<string, unknown>).some(
    (value) => value === 'yes' || value === 'no',
  );
}

function hasSleepSignal(row: DataDaysHealthRow): boolean {
  return row.sleepMinutes !== null && row.sleepMinutes > 0;
}

function hasRecoverySignal(row: DataDaysHealthRow): boolean {
  return (
    row.hrv !== null ||
    row.restingHr !== null ||
    row.recoveryScore !== null ||
    row.bodyBattery !== null
  );
}

function healthDayKeys(
  rows: readonly DataDaysHealthRow[],
  predicate: (row: DataDaysHealthRow) => boolean,
): string[] {
  return rows.filter(predicate).map((row) => dayKeyFromDate(row.date));
}

function domainDayKeys(domain: DataDaysDomain, sources: DataDaysSources): string[] {
  switch (domain) {
    case 'sleep':
      return healthDayKeys(sources.health, hasSleepSignal);
    case 'recovery':
      return healthDayKeys(sources.health, hasRecoverySignal);
    case 'effort':
      return sources.activityDates.map(toTrainingDayId);
    case 'adaptation':
      return [
        ...healthDayKeys(sources.health, (row) => hasSleepSignal(row) || hasRecoverySignal(row)),
        ...sources.activityDates.map(toTrainingDayId),
      ];
    case 'nutrition':
      return sources.nutrition
        .filter((row) => row.calories > 0)
        .map((row) => dayKeyFromDate(row.date));
    case 'journal':
      return [
        ...(sources.journal ?? []).filter(journalDayHasAnswer).map((row) => row.trainingDayId),
        ...(sources.checkinDays ?? []),
      ];
  }
}

/** Sorted, de-duplicated `YYYY-MM-DD` keys inside `[from, to]`. */
export function collectDataDays(
  domain: DataDaysDomain,
  sources: DataDaysSources,
  range: { from: string; to: string },
): string[] {
  const keys = domainDayKeys(domain, sources).filter((key) => key >= range.from && key <= range.to);
  return [...new Set(keys)].sort();
}

function parseDayKey(raw: string | null): Date | null {
  if (!raw || !DAY_KEY_PATTERN.test(raw)) {
    return null;
  }
  const parsed = parseISO(raw);
  return isValid(parsed) ? parsed : null;
}

export function parseDataDaysRequest(searchParams: URLSearchParams): DataDaysRequestParse {
  const domain = searchParams.get('domain');
  if (!isDataDaysDomain(domain)) {
    return { ok: false, error: `domain doit valoir ${DATA_DAYS_DOMAINS.join(' | ')}` };
  }
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const fromDate = parseDayKey(from);
  const toDate = parseDayKey(to);
  if (!from || !to || !fromDate || !toDate) {
    return { ok: false, error: 'from et to sont requis au format YYYY-MM-DD' };
  }
  const span = differenceInCalendarDays(toDate, fromDate) + 1;
  if (span < 1) {
    return { ok: false, error: 'from doit précéder to' };
  }
  if (span > DATA_DAYS_MAX_RANGE_DAYS) {
    return { ok: false, error: `Plage limitée à ${DATA_DAYS_MAX_RANGE_DAYS} jours` };
  }
  return { ok: true, request: { domain, from, to } };
}
