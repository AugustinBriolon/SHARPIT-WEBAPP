/**
 * Typed absence / pain playbook proposal — athlete approves Appliquer / Modifier / Ignorer.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@sharpit/db/client';
import {
  PLAYBOOK_ACTIONS,
  PLAYBOOK_ACTION_LABELS_FR,
  playbookSuggestsRegenerateWeek,
  playbookTrainingConstraint,
  type PlaybookAction,
} from '@sharpit/app/lib/coach/playbooks/absence-pain-actions';
import { OPEN_ENDED_MEMORY_END_DAY } from '@sharpit/app/lib/coach-memory/core/types';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';
import { createTravelMemoryEntry } from '@sharpit/server/lib/coach-memory/core/service';
import { createTravelContext } from '@sharpit/server/lib/travel-context/service';

function addDaysIso(iso: string, days: number): string {
  const base = toUtcDateOnly(new Date(`${iso}T12:00:00.000Z`));
  const next = new Date(base.getTime() + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}

async function executeProposePlaybookAction(
  athleteId: string,
  input: {
    action: PlaybookAction;
    rationale: string;
    startDate?: string;
    endDate?: string;
    label?: string;
  },
) {
  const today = toUtcDateOnly(new Date());
  const todayIso = today.toISOString().slice(0, 10);
  const startIso = input.startDate ?? todayIso;
  const endIso = input.endDate ?? addDaysIso(startIso, 7);
  const label =
    input.label?.trim() ||
    `${PLAYBOOK_ACTION_LABELS_FR[input.action]} — ${input.rationale.slice(0, 80)}`;
  const constraint = playbookTrainingConstraint(input.action);
  const suggestRegenerateWeek = playbookSuggestsRegenerateWeek(input.action);

  let constraintId: string | null = null;
  if (constraint) {
    const created = await createTravelContext(prisma, athleteId, {
      type: 'CONSTRAINT',
      label,
      startDate: toUtcDateOnly(new Date(`${startIso}T12:00:00.000Z`)),
      endDate: toUtcDateOnly(new Date(`${endIso}T12:00:00.000Z`)),
      note: input.rationale,
      allowedDisciplines: [],
      trainingConstraint: constraint,
      source: 'COACH',
    });
    constraintId = created.id;
  } else {
    await createTravelMemoryEntry(prisma, athleteId, {
      type: 'NOTE',
      label,
      note: `[Playbook ${input.action}] ${input.rationale}`,
      startDate: toUtcDateOnly(new Date(`${startIso}T12:00:00.000Z`)),
      endDate: toUtcDateOnly(new Date(`${OPEN_ENDED_MEMORY_END_DAY}T12:00:00.000Z`)),
      trainingConstraint: 'FULL',
      source: 'COACH',
    });
  }

  return {
    ok: true as const,
    action: input.action,
    label: PLAYBOOK_ACTION_LABELS_FR[input.action],
    constraintId,
    trainingConstraint: constraint,
    suggestRegenerateWeek,
    message: suggestRegenerateWeek
      ? `Action ${PLAYBOOK_ACTION_LABELS_FR[input.action]} enregistrée. Propose de régénérer la semaine.`
      : `Action ${PLAYBOOK_ACTION_LABELS_FR[input.action]} enregistrée.`,
  };
}

export function buildPlaybookCoachTools(athleteId: string) {
  return {
    proposePlaybookAction: tool({
      description:
        "Propose UNE action typée face à une absence multi-jours ou une douleur active (playbooks). Actions : CONTINUE (garder le cap, éventuellement alléger la prochaine séance clé), LIGHTEN (contrainte REDUCED), POSTPONE (reporter l'objectif), RESTART (reprise progressive), PAUSE (stop entraînement structuré). Toujours une seule action primaire + rationale courte liée aux preuves. Validation athlète requise (Appliquer / Modifier / Ignorer).",
      inputSchema: z.object({
        action: z.enum(PLAYBOOK_ACTIONS).describe('Action primaire du playbook.'),
        rationale: z
          .string()
          .min(8)
          .max(400)
          .describe('Une phrase : pourquoi, liée à la charge ou à la douleur.'),
        startDate: z.string().optional().describe('Début yyyy-MM-dd (défaut = aujourd’hui).'),
        endDate: z.string().optional().describe('Fin yyyy-MM-dd (défaut = +7 jours).'),
        label: z.string().max(120).optional().describe('Titre court affiché à l’athlète.'),
      }),
      execute: async (input) => {
        try {
          return await executeProposePlaybookAction(athleteId, input);
        } catch (error) {
          console.error('[coach/proposePlaybookAction]', error);
          return {
            ok: false as const,
            error:
              error instanceof Error ? error.message : "Impossible d'enregistrer l'action playbook",
          };
        }
      },
    }),
  };
}
