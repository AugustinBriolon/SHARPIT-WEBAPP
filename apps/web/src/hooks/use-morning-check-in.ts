'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { apiFetch } from '@sharpit/ui/client/query/api-fetch';
import { mapSorenessUiToDomain } from '@sharpit/app/lib/journal/morning-wellness-scale';
import {
  MORNING_CHECKIN_SAVE_ERROR,
  beginOptimisticMorningSave,
  confirmOptimisticMorningSave,
  createMorningCheckInState,
  isCheckInReminderVisible,
  openMorningCheckInSheet,
  closeMorningCheckInSheet,
  rollbackOptimisticMorningSave,
  updateMorningCheckInDraft,
  type MorningCheckInUiState,
  type MorningWellnessDraft,
} from '@sharpit/app/lib/journal/morning-wellness-optimistic';
import { toast } from '@/components/ui/toast';

type Action =
  | { type: 'hydrate'; completed: boolean }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'draft'; draft: MorningWellnessDraft }
  | { type: 'optimistic'; draft: MorningWellnessDraft }
  | { type: 'confirm' }
  | { type: 'rollback' };

function reducer(state: MorningCheckInUiState, action: Action): MorningCheckInUiState {
  switch (action.type) {
    case 'hydrate':
      return createMorningCheckInState(action.completed);
    case 'open':
      return openMorningCheckInSheet(state);
    case 'close':
      return closeMorningCheckInSheet(state);
    case 'draft':
      return updateMorningCheckInDraft(state, action.draft);
    case 'optimistic':
      return beginOptimisticMorningSave(state, action.draft);
    case 'confirm':
      return confirmOptimisticMorningSave(state);
    case 'rollback':
      return rollbackOptimisticMorningSave(state);
    default:
      return state;
  }
}

async function fetchStatus(): Promise<boolean> {
  const res = await apiFetch('/api/v1/wellness-checkin/status');
  if (!res.ok) {
    throw new Error('status');
  }
  const data = (await res.json()) as { completed?: boolean };
  return Boolean(data.completed);
}

async function postCheckIn(draft: MorningWellnessDraft): Promise<void> {
  const res = await apiFetch('/api/v1/wellness-checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mood: draft.mood,
      energyLevel: draft.energyLevel,
      perceivedSoreness: mapSorenessUiToDomain(draft.perceivedSoreness),
      stressLevel: draft.stressLevel,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
    }),
  });
  if (!res.ok) {
    throw new Error('submit');
  }
}

/**
 * Instant UX for « Ressenti du jour »: Enregistrer patches UI immediately
 * (badge off, sheet closed). Draft stays in React memory only — never Web Storage.
 */
export function useMorningCheckIn() {
  const [state, dispatch] = useReducer(reducer, false, createMorningCheckInState);
  const [statusReady, setStatusReady] = useState(false);
  const inflightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const completed = await fetchStatus();
        if (!cancelled) {
          dispatch({ type: 'hydrate', completed });
        }
      } catch {
        if (!cancelled) {
          dispatch({ type: 'hydrate', completed: true });
        }
      } finally {
        if (!cancelled) {
          setStatusReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDraft = useCallback((draft: MorningWellnessDraft) => {
    dispatch({ type: 'draft', draft });
  }, []);

  const open = useCallback(() => {
    dispatch({ type: 'open' });
  }, []);

  const close = useCallback(() => {
    dispatch({ type: 'close' });
  }, []);

  const save = useCallback((draft: MorningWellnessDraft) => {
    if (inflightRef.current) {
      return;
    }
    inflightRef.current = true;
    // Happy path first: close + hide badge before the network round-trip.
    dispatch({ type: 'optimistic', draft });
    void (async () => {
      try {
        await postCheckIn(draft);
        dispatch({ type: 'confirm' });
      } catch {
        dispatch({ type: 'rollback' });
        toast.error(MORNING_CHECKIN_SAVE_ERROR);
      } finally {
        inflightRef.current = false;
      }
    })();
  }, []);

  return {
    statusReady,
    state,
    reminderVisible: statusReady && isCheckInReminderVisible(state),
    open,
    close,
    setDraft,
    save,
  };
}
