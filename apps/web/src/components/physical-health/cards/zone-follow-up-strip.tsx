'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { PhysicalStatus } from '@prisma/client';
import { usePhysicalNoteMutations, usePhysicalNotes } from '@/hooks/use-physical';
import { useClientNow } from '@/hooks/use-client-now';
import {
  resolutionSuggested,
  ZONE_STRATEGY_DETAILS,
  ZONE_STRATEGY_LABELS,
  zoneStrategy,
} from '@sharpit/app/lib/physical-health/zone-follow-up';

const ACTION_CLASS =
  'chip-surface text-foreground/80 hover:text-foreground inline-flex min-h-11 items-center rounded-full px-4 py-2 text-xs font-medium transition-colors lg:min-h-9 lg:px-3.5 lg:py-1.5';

/** The card reads the Condition mirror: refresh it once the declaration changed. */
function useSetZoneStatus(noteId: string) {
  const queryClient = useQueryClient();
  const { update } = usePhysicalNoteMutations();
  return (status: PhysicalStatus) =>
    update.mutate(
      { id: noteId, data: { status } },
      {
        onSettled: () =>
          void queryClient.invalidateQueries({ queryKey: ['presentation', 'physical-health'] }),
      },
    );
}

/**
 * What the declared zone does to the plan, and the lifecycle actions (ADR-068): close it when
 * its readings have been silent for two weeks, reopen it on a relapse.
 */
export function ZoneFollowUpStrip({ legacyNoteId }: { legacyNoteId: string | null }) {
  const now = useClientNow();
  const notesQuery = usePhysicalNotes();
  const note = legacyNoteId ? notesQuery.data?.find((n) => n.id === legacyNoteId) : undefined;
  const setStatus = useSetZoneStatus(legacyNoteId ?? '');
  if (!note || !now) {
    return null;
  }
  const strategy = zoneStrategy(note, now);
  const suggestResolution = resolutionSuggested(note, now);

  return (
    <div className="space-y-2 pb-2">
      <p className="text-xs">
        <span className="text-foreground font-medium">{ZONE_STRATEGY_LABELS[strategy]}</span>
        <span className="text-muted-foreground"> · {ZONE_STRATEGY_DETAILS[strategy]}</span>
      </p>
      {suggestResolution ? (
        <p className="text-muted-foreground text-xs">
          Aucune douleur depuis au moins deux semaines. C’est derrière toi ?
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {note.status !== 'RESOLVED' ? (
          <button className={ACTION_CLASS} type="button" onClick={() => setStatus('RESOLVED')}>
            Marquer résolue
          </button>
        ) : null}
        {note.status === 'ACTIVE' ? (
          <button className={ACTION_CLASS} type="button" onClick={() => setStatus('MONITORING')}>
            Passer sous surveillance
          </button>
        ) : null}
        {note.status === 'RESOLVED' ? (
          <button className={ACTION_CLASS} type="button" onClick={() => setStatus('ACTIVE')}>
            Ça revient
          </button>
        ) : null}
      </div>
    </div>
  );
}
