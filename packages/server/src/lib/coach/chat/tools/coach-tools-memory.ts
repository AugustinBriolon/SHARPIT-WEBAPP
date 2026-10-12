/**
 * Coach tools for durable structured memory (INJURY / PREFERENCE / NOTE — ADR-080).
 * Write tools are gated like setTravelContext (user-approval + COACH_WRITE_TOOLS).
 */

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '@sharpit/db/client';
import {
  OPEN_ENDED_MEMORY_END_DAY,
  type CoachMemoryType,
} from '@sharpit/app/lib/coach-memory/core/types';
import {
  createTravelMemoryEntry,
  deleteCoachMemoryEntry,
  listCoachMemoryEntries,
  updateTravelMemoryEntry,
} from '@sharpit/server/lib/coach-memory/core/service';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';

const NOTE_TYPES = ['INJURY', 'PREFERENCE', 'NOTE'] as const;

function openEndedEndDate(): Date {
  return toUtcDateOnly(new Date(`${OPEN_ENDED_MEMORY_END_DAY}T12:00:00.000Z`));
}

function buildListCoachMemoryTool(athleteId: string) {
  return tool({
    description:
      'Liste la mémoire structurée du coach (déplacements, contraintes, blessures, préférences, notes). Lecture seule.',
    inputSchema: z.object({}),
    execute: async () => {
      const snapshot = await listCoachMemoryEntries(prisma, athleteId);
      return {
        ok: true as const,
        activeId: snapshot.activeId,
        entries: snapshot.entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          label: entry.label,
          note: entry.note,
          startDate: entry.startDate,
          endDate: entry.endDate,
          isActive: entry.isActive,
          trainingConstraint: entry.trainingConstraint,
        })),
      };
    },
  });
}

function buildUpsertCoachMemoryNoteTool(athleteId: string) {
  return tool({
    description:
      "Crée ou met à jour une entrée de mémoire durable (blessure, préférence, note). Pas de diagnostic médical — enregistre seulement ce que l'athlète déclare. Pour un déplacement utilise setTravelContext ; pour une contrainte de charge temporaire sans lieu utilise setTrainingConstraint.",
    inputSchema: z.object({
      id: z.string().optional().describe('Id existant pour mettre à jour ; absent = création.'),
      type: z.enum(NOTE_TYPES).describe('INJURY, PREFERENCE ou NOTE.'),
      label: z.string().min(1).max(200).describe('Titre court.'),
      note: z.string().max(2000).optional().describe('Détail libre.'),
      startDate: z
        .string()
        .optional()
        .describe('Début yyyy-MM-dd (requis pour INJURY ; défaut = aujourd’hui sinon).'),
      endDate: z
        .string()
        .optional()
        .describe('Fin yyyy-MM-dd (requis pour INJURY ; omit pour PREFERENCE/NOTE = ouvert).'),
      trainingConstraint: z
        .enum(['FULL', 'REDUCED', 'MOBILITY_ONLY', 'NONE'])
        .optional()
        .describe('Pour INJURY seulement — capacité d’entraînement pendant la période.'),
    }),
    execute: async (input) => {
      try {
        const today = toUtcDateOnly(new Date());
        const startDate = input.startDate
          ? toUtcDateOnly(new Date(`${input.startDate}T12:00:00.000Z`))
          : today;
        let endDate = openEndedEndDate();
        if (input.endDate !== undefined) {
          endDate = toUtcDateOnly(new Date(`${input.endDate}T12:00:00.000Z`));
        } else if (input.type === 'INJURY') {
          endDate = startDate;
        }

        if (input.type === 'INJURY' && !input.startDate) {
          return {
            ok: false as const,
            error: 'Une date de début est requise pour une blessure.',
          };
        }

        const payload = {
          type: input.type as CoachMemoryType,
          label: input.label,
          note: input.note ?? null,
          startDate,
          endDate,
          trainingConstraint: input.trainingConstraint ?? 'FULL',
          source: 'COACH' as const,
        };

        const entry = input.id
          ? await updateTravelMemoryEntry(prisma, athleteId, input.id, payload)
          : await createTravelMemoryEntry(prisma, athleteId, payload);

        if (!entry) {
          return { ok: false as const, error: 'Entrée introuvable.' };
        }
        return {
          ok: true as const,
          id: entry.id,
          type: entry.type,
          label: entry.label,
          startDate: entry.startDate,
          endDate: entry.endDate,
        };
      } catch (error) {
        console.error('[coach/upsertCoachMemoryNote]', error);
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Impossible d’enregistrer la note',
        };
      }
    },
  });
}

function buildArchiveCoachMemoryNoteTool(athleteId: string) {
  return tool({
    description:
      'Archive (supprime) une entrée de mémoire durable par id. Confirme avec l’athlète avant.',
    inputSchema: z.object({
      id: z.string().describe('Id de l’entrée à archiver.'),
    }),
    execute: async ({ id }) => {
      try {
        await deleteCoachMemoryEntry(prisma, athleteId, id);
        return { ok: true as const, id };
      } catch (error) {
        console.error('[coach/archiveCoachMemoryNote]', error);
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Impossible d’archiver',
        };
      }
    },
  });
}

export function buildMemoryCoachTools(athleteId: string) {
  return {
    listCoachMemory: buildListCoachMemoryTool(athleteId),
    upsertCoachMemoryNote: buildUpsertCoachMemoryNoteTool(athleteId),
    archiveCoachMemoryNote: buildArchiveCoachMemoryNoteTool(athleteId),
  };
}
