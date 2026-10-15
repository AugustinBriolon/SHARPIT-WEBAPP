/**
 * Instant UX for the morning « Ressenti du jour » sheet.
 *
 * Optimistic save closes the sheet and hides the reminder badge immediately.
 * Server confirmation finalises; failure restores badge + sheet with the same
 * in-memory draft (never localStorage / sessionStorage — health input).
 */

import type { WellnessUiScore } from '@sharpit/app/lib/journal/morning-wellness-scale';

/** Short FR toast when the network / server rejects the save. */
export const MORNING_CHECKIN_SAVE_ERROR = 'Pas enregistré, réessaie';

/** In-memory draft only — never persist to Web Storage. */
export type MorningWellnessDraft = {
  mood: WellnessUiScore;
  energyLevel: WellnessUiScore;
  perceivedSoreness: WellnessUiScore;
  stressLevel: WellnessUiScore;
  notes: string;
};

export type MorningCheckInUiState = {
  /** True when completed on the server or optimistically while the POST is in flight. */
  completed: boolean;
  /** True between optimistic apply and server settle. */
  optimistic: boolean;
  sheetOpen: boolean;
  /** Athlete input held in React memory for reopen-on-failure. */
  draft: MorningWellnessDraft | null;
};

export function createMorningCheckInState(completed: boolean): MorningCheckInUiState {
  return {
    completed,
    optimistic: false,
    sheetOpen: false,
    draft: null,
  };
}

/** Reminder bell / badge / notification indicator for today's check-in. */
export function isCheckInReminderVisible(state: MorningCheckInUiState): boolean {
  return !state.completed;
}

export function openMorningCheckInSheet(state: MorningCheckInUiState): MorningCheckInUiState {
  return { ...state, sheetOpen: true };
}

export function closeMorningCheckInSheet(state: MorningCheckInUiState): MorningCheckInUiState {
  return { ...state, sheetOpen: false };
}

/**
 * Athlete taps Enregistrer: close immediately, hide reminder, keep draft for rollback.
 * Does not clear the draft — failure must reopen with the same input.
 */
export function beginOptimisticMorningSave(
  state: MorningCheckInUiState,
  draft: MorningWellnessDraft,
): MorningCheckInUiState {
  return {
    completed: true,
    optimistic: true,
    sheetOpen: false,
    draft,
  };
}

/** Server confirmed — draft may be dropped; reminder stays hidden. */
export function confirmOptimisticMorningSave(_state: MorningCheckInUiState): MorningCheckInUiState {
  return {
    completed: true,
    optimistic: false,
    sheetOpen: false,
    draft: null,
  };
}

/**
 * Server / network failed — badge back, sheet reopens, draft preserved.
 * Caller shows {@link MORNING_CHECKIN_SAVE_ERROR}.
 */
export function rollbackOptimisticMorningSave(state: MorningCheckInUiState): MorningCheckInUiState {
  return {
    completed: false,
    optimistic: false,
    sheetOpen: true,
    draft: state.draft,
  };
}

export function updateMorningCheckInDraft(
  state: MorningCheckInUiState,
  draft: MorningWellnessDraft,
): MorningCheckInUiState {
  return { ...state, draft };
}
