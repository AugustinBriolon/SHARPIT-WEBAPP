import { describe, expect, it } from 'vitest';

import {
  MORNING_CHECKIN_SAVE_ERROR,
  beginOptimisticMorningSave,
  confirmOptimisticMorningSave,
  createMorningCheckInState,
  isCheckInReminderVisible,
  openMorningCheckInSheet,
  rollbackOptimisticMorningSave,
  type MorningWellnessDraft,
} from './morning-wellness-optimistic';

/** Demo fixture only — not real athlete health data. */
const DEMO_DRAFT: MorningWellnessDraft = {
  mood: 4,
  energyLevel: 3,
  perceivedSoreness: 2,
  stressLevel: 2,
  notes: 'nuit ok (démo)',
};

describe('morning wellness optimistic Instant UX', () => {
  it('hides the reminder badge immediately on Enregistrer (optimistic)', () => {
    let state = createMorningCheckInState(false);
    state = openMorningCheckInSheet(state);
    expect(isCheckInReminderVisible(state)).toBe(true);

    state = beginOptimisticMorningSave(state, DEMO_DRAFT);

    expect(state.completed).toBe(true);
    expect(state.optimistic).toBe(true);
    expect(state.sheetOpen).toBe(false);
    expect(isCheckInReminderVisible(state)).toBe(false);
    expect(state.draft).toEqual(DEMO_DRAFT);
  });

  it('finalises after server confirmation and drops the in-memory draft', () => {
    let state = beginOptimisticMorningSave(createMorningCheckInState(false), DEMO_DRAFT);
    state = confirmOptimisticMorningSave(state);

    expect(state.completed).toBe(true);
    expect(state.optimistic).toBe(false);
    expect(state.sheetOpen).toBe(false);
    expect(state.draft).toBeNull();
    expect(isCheckInReminderVisible(state)).toBe(false);
  });

  it('on failure restores badge, reopens sheet and keeps the same draft', () => {
    let state = beginOptimisticMorningSave(createMorningCheckInState(false), DEMO_DRAFT);
    state = rollbackOptimisticMorningSave(state);

    expect(state.completed).toBe(false);
    expect(state.optimistic).toBe(false);
    expect(state.sheetOpen).toBe(true);
    expect(state.draft).toEqual(DEMO_DRAFT);
    expect(isCheckInReminderVisible(state)).toBe(true);
    expect(MORNING_CHECKIN_SAVE_ERROR).toBe('Pas enregistré, réessaie');
  });

  it('never implies Web Storage — draft lives only on the state object', () => {
    const state = beginOptimisticMorningSave(createMorningCheckInState(false), DEMO_DRAFT);
    expect(state.draft?.notes).toBe('nuit ok (démo)');
    // Contract: callers must not write draft to localStorage / sessionStorage.
    expect(Object.keys(state)).not.toContain('storageKey');
  });
});
