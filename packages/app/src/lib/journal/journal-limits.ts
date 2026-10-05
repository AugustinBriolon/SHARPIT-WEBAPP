/**
 * Journal trackable caps + analysis readiness gates (presentation / prefs only).
 */

import {
  JOURNAL_BUILTIN_TRACKABLE_IDS,
  type JournalBuiltinTrackableId,
} from '@sharpit/app/lib/journal/journal-trackables';
import type { DayJournalEntry, DayJournalFactorState } from '@sharpit/app/lib/journal/day-journal';
import type { JournalPrefs } from '@sharpit/app/lib/journal/journal-prefs';

/** Free: lean tracking. Pro: unlimited enabled trackables (+ customs). */
export const JOURNAL_ENABLED_LIMIT_FREE = 10;

/** Calendar days with ≥1 real journal signal before analyses unlock. */
export const JOURNAL_ANALYSIS_MIN_DAYS = 7;

const DEFAULT_ON: ReadonlySet<JournalBuiltinTrackableId> = new Set([
  'metric_caffeine',
  'metric_mood',
  'metric_hydration',
  'late_meal',
  'device_in_bed',
]);

/** Free returns a number; Pro returns null (uncapped). */
export function journalEnabledLimit(isPro: boolean): number | null {
  return isPro ? null : JOURNAL_ENABLED_LIMIT_FREE;
}

export function countEnabledTrackables(prefs: JournalPrefs): number {
  let count = 0;
  for (const id of JOURNAL_BUILTIN_TRACKABLE_IDS) {
    if (prefs.enabled[id]) {
      count += 1;
    }
  }
  for (const item of prefs.customItems) {
    if (item.enabled) {
      count += 1;
    }
  }
  return count;
}

export function canEnableAnotherTrackable(prefs: JournalPrefs, isPro: boolean): boolean {
  const limit = journalEnabledLimit(isPro);
  if (limit === null) {
    return true;
  }
  return countEnabledTrackables(prefs) < limit;
}

/**
 * Persist gate: strip customs for free, trim enables down to the free cap.
 * Pro is uncapped (customs kept). Prefer keeping the lean default set when trimming.
 */
export function enforceJournalPrefsLimits(prefs: JournalPrefs, isPro: boolean): JournalPrefs {
  if (isPro) {
    return prefs;
  }

  const withoutCustoms = { ...prefs, customItems: [] };
  const limit = JOURNAL_ENABLED_LIMIT_FREE;
  let count = countEnabledTrackables(withoutCustoms);
  if (count <= limit) {
    return withoutCustoms;
  }

  const enabled = { ...withoutCustoms.enabled };

  const disableBuiltin = (preferNonDefault: boolean) => {
    for (const id of [...JOURNAL_BUILTIN_TRACKABLE_IDS].reverse()) {
      if (count <= limit) {
        return;
      }
      if (!enabled[id]) {
        continue;
      }
      if (preferNonDefault && DEFAULT_ON.has(id)) {
        continue;
      }
      enabled[id] = false;
      count -= 1;
    }
  };

  disableBuiltin(true);
  disableBuiltin(false);

  return {
    ...withoutCustoms,
    enabled,
    customItems: [],
  };
}

function isRecordedFactor(state: DayJournalFactorState | undefined): boolean {
  return state === 'yes' || state === 'no';
}

/** Null / unset / caffeine 0 do not count — only explicit athlete signals. */
export function dayHasJournalSignal(entry: DayJournalEntry): boolean {
  if (entry.moodLabel) {
    return true;
  }
  if (entry.hydrationMl !== null) {
    return true;
  }
  if (entry.caffeineMg !== null && entry.caffeineMg > 0) {
    return true;
  }
  if ((entry.drivingMinutes ?? 0) > 0) {
    return true;
  }
  return Object.values(entry.factors).some(isRecordedFactor);
}

export function isJournalAnalysisReady(daysWithSignal: number): boolean {
  return daysWithSignal >= JOURNAL_ANALYSIS_MIN_DAYS;
}
