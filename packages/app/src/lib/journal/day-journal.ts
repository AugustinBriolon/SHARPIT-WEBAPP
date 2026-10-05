/**
 * Day-journal entries — subjective context for coaching reads.
 * Source of truth: DB (`AthleteDayJournal`). localStorage is an optimistic cache.
 */

import {
  DAY_CONTEXT_FACTOR_IDS,
  type DayContextFactorId,
  isDayContextFactorId,
  isPriorNightFactor,
} from '@sharpit/app/lib/journal/day-context-factors';
import { isCustomTrackableId } from '@sharpit/app/lib/journal/journal-trackables';
import { apiFetch } from '@sharpit/app/lib/api/api-fetch';

export type DayJournalFactorState = 'unset' | 'no' | 'yes';

export type DayJournalFactorKey = DayContextFactorId | string;

export type DayJournalEntry = {
  trainingDayId: string;
  factors: Partial<Record<DayJournalFactorKey, DayJournalFactorState>>;
  moodLabel: string | null;
  hydrationMl: number | null;
  caffeineMg: number | null;
  /** Minutes behind the wheel; absent from entries written before it existed. */
  drivingMinutes?: number | null;
  updatedAt: string;
};

export const DAY_JOURNAL_STORAGE_KEY = 'sharpit.dayJournal.v1';

export type DayJournalStore = {
  version: 1;
  byDay: Record<string, DayJournalEntry>;
};

export function emptyDayJournalEntry(trainingDayId: string): DayJournalEntry {
  return {
    trainingDayId,
    factors: {},
    moodLabel: null,
    hydrationMl: null,
    caffeineMg: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function parseDayJournalStore(raw: unknown): DayJournalStore {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, byDay: {} };
  }
  const record = raw as { version?: unknown; byDay?: unknown };
  if (record.version !== 1 || !record.byDay || typeof record.byDay !== 'object') {
    return { version: 1, byDay: {} };
  }
  const byDay: Record<string, DayJournalEntry> = {};
  for (const [dayId, value] of Object.entries(record.byDay as Record<string, unknown>)) {
    const parsed = parseDayJournalEntry(dayId, value);
    if (parsed) {
      byDay[dayId] = parsed;
    }
  }
  return { version: 1, byDay };
}

function isDayJournalFactorState(state: unknown): state is DayJournalFactorState {
  return state === 'unset' || state === 'no' || state === 'yes';
}

function isValidDayJournalFactorKey(key: string): boolean {
  return isDayContextFactorId(key) || isCustomTrackableId(key);
}

function parseDayJournalFactors(
  raw: unknown,
): Partial<Record<DayJournalFactorKey, DayJournalFactorState>> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const factors: Partial<Record<DayJournalFactorKey, DayJournalFactorState>> = {};
  for (const [key, state] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidDayJournalFactorKey(key) || !isDayJournalFactorState(state)) {
      continue;
    }
    factors[key] = state;
  }
  return factors;
}

function parseOptionalString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

function parseOptionalNumber(raw: unknown): number | null {
  return typeof raw === 'number' ? raw : null;
}

export function parseDayJournalEntry(dayId: string, raw: unknown): DayJournalEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  return {
    trainingDayId: dayId,
    factors: parseDayJournalFactors(record.factors),
    moodLabel: parseOptionalString(record.moodLabel),
    hydrationMl: parseOptionalNumber(record.hydrationMl),
    caffeineMg: parseOptionalNumber(record.caffeineMg) ?? 0,
    drivingMinutes: parseOptionalNumber(record.drivingMinutes),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

export function readDayJournalStore(
  storage: Pick<Storage, 'getItem'> | null | undefined = typeof window === 'undefined'
    ? null
    : window.localStorage,
): DayJournalStore {
  if (!storage) {
    return { version: 1, byDay: {} };
  }
  try {
    const raw = storage.getItem(DAY_JOURNAL_STORAGE_KEY);
    if (!raw) {
      return { version: 1, byDay: {} };
    }
    return parseDayJournalStore(JSON.parse(raw) as unknown);
  } catch {
    return { version: 1, byDay: {} };
  }
}

export function writeDayJournalStore(
  store: DayJournalStore,
  storage: Pick<Storage, 'setItem'> | null | undefined = typeof window === 'undefined'
    ? null
    : window.localStorage,
): void {
  if (!storage) {
    return;
  }
  storage.setItem(DAY_JOURNAL_STORAGE_KEY, JSON.stringify(store));
}

export function upsertDayJournalEntry(
  store: DayJournalStore,
  entry: DayJournalEntry,
): DayJournalStore {
  return {
    version: 1,
    byDay: {
      ...store.byDay,
      [entry.trainingDayId]: {
        ...entry,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

export async function fetchDayJournalEntryFromServer(
  trainingDayId: string,
): Promise<DayJournalEntry | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const res = await apiFetch(`/api/day-journal?day=${encodeURIComponent(trainingDayId)}`);
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { entry?: unknown };
    const parsed = parseDayJournalEntry(trainingDayId, data.entry);
    return parsed;
  } catch {
    return null;
  }
}

export async function persistDayJournalEntryToServer(
  entry: DayJournalEntry,
  signal?: AbortSignal,
): Promise<DayJournalEntry | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const res = await apiFetch('/api/day-journal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trainingDayId: entry.trainingDayId,
        factors: entry.factors,
        moodLabel: entry.moodLabel,
        hydrationMl: entry.hydrationMl,
        caffeineMg: entry.caffeineMg,
        drivingMinutes: entry.drivingMinutes ?? null,
      }),
      signal,
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { entry?: unknown };
    return parseDayJournalEntry(entry.trainingDayId, data.entry);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    return null;
  }
}

function isDayJournalEntryEmpty(entry: DayJournalEntry): boolean {
  return (
    !entry.moodLabel &&
    entry.hydrationMl === null &&
    (entry.caffeineMg === null || entry.caffeineMg === 0) &&
    !entry.drivingMinutes &&
    Object.keys(entry.factors).length === 0
  );
}

function hasDayJournalData(entry: DayJournalEntry): boolean {
  return (
    Boolean(entry.moodLabel) ||
    entry.hydrationMl !== null ||
    (entry.caffeineMg !== null && entry.caffeineMg > 0) ||
    (entry.drivingMinutes ?? 0) > 0 ||
    Object.keys(entry.factors).length > 0
  );
}

async function migrateLocalDayJournalIfNeeded(
  local: DayJournalEntry,
  remote: DayJournalEntry,
): Promise<DayJournalEntry> {
  if (!isDayJournalEntryEmpty(remote) || !hasDayJournalData(local)) {
    return remote;
  }
  const pushed = await persistDayJournalEntryToServer(local);
  return pushed ?? local;
}

/**
 * Load journal for a day: show local cache immediately, prefer DB when available.
 * If DB is empty and local has content, push local once (one-shot migration).
 */
export async function loadDayJournalEntry(trainingDayId: string): Promise<DayJournalEntry> {
  const local = readDayJournalStore().byDay[trainingDayId] ?? emptyDayJournalEntry(trainingDayId);
  const remote = await fetchDayJournalEntryFromServer(trainingDayId);
  if (!remote) {
    return local;
  }
  return migrateLocalDayJournalIfNeeded(local, remote);
}

export async function saveDayJournalEntry(entry: DayJournalEntry): Promise<DayJournalEntry> {
  const withStamp: DayJournalEntry = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  writeDayJournalStore(upsertDayJournalEntry(readDayJournalStore(), withStamp));
  const remote = await persistDayJournalEntryToServer(withStamp);
  if (remote) {
    writeDayJournalStore(upsertDayJournalEntry(readDayJournalStore(), remote));
    return remote;
  }
  return withStamp;
}

export function cycleFactorState(
  current: DayJournalFactorState | undefined,
): DayJournalFactorState {
  if (!current || current === 'unset') {
    return 'yes';
  }
  if (current === 'yes') {
    return 'no';
  }
  return 'unset';
}

/** Factors shown as ternary toggles on the journal page (day signals only). */
export const JOURNAL_TOGGLE_FACTOR_IDS: readonly DayContextFactorId[] =
  DAY_CONTEXT_FACTOR_IDS.filter(
    (id) => id !== 'mood_low' && id !== 'hydration_low' && id !== 'coffee',
  );

export const JOURNAL_PRIOR_NIGHT_FACTOR_IDS: readonly DayContextFactorId[] =
  JOURNAL_TOGGLE_FACTOR_IDS.filter((id) => isPriorNightFactor(id));

/** « 45 min », « 1 h 30 », « — min » when nothing was said. */
export function formatDrivingMinutes(minutes: number | null): string {
  if (minutes === null || minutes <= 0) {
    return minutes === 0 ? '0 min' : '— min';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const rest = minutes % 60;
  return rest === 0
    ? `${minutes / 60} h`
    : `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}`;
}
