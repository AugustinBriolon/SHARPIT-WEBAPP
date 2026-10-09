import { tool } from 'ai';
import { z } from 'zod';
import { travelDisciplineEnumForSports } from './coach-tools-shared';
import {
  executeSetTrainingConstraintTool,
  executeSetTravelContextTool,
} from './coach-tools-executors';

function buildSetTravelContextTool(
  athleteId: string,
  proposalTravelEnum: ReturnType<typeof travelDisciplineEnumForSports>,
) {
  return tool({
    description:
      "Enregistre un contexte voyage (ville + dates) pour pré-remplir les séances outdoor et améliorer les prévisions météo. À utiliser quand l'athlète mentionne des vacances, un déplacement ou un camp d'entraînement — c'est-à-dire qu'il n'est pas chez lui — ET seulement si ce déplacement n'est pas déjà dans le contexte système (« Déplacements / voyages »). Si la capacité d'entraînement est réduite sans déplacement (maladie, blessure, semaine de travail chargée), utilise setTrainingConstraint à la place.",
    inputSchema: z.object({
      locationLabel: z.string().describe("Ville ou lieu (ex. Les Sables-d'Olonne)."),
      startDate: z.string().describe('Date de début yyyy-MM-dd.'),
      endDate: z.string().describe('Date de fin yyyy-MM-dd.'),
      label: z.string().optional().describe('Titre court (ex. Vacances juillet).'),
      note: z.string().optional(),
      allowedDisciplines: z
        .array(proposalTravelEnum)
        .optional()
        .describe(
          'Sports possibles pendant le voyage. MOBILITY = mobilité/étirements. Vide = tout autorisé.',
        ),
      noStructuredTraining: z
        .boolean()
        .optional()
        .describe('true = aucun sport structuré pendant le voyage.'),
      trainingConstraint: z
        .enum(['FULL', 'REDUCED', 'MOBILITY_ONLY', 'NONE'])
        .optional()
        .describe(
          'Optionnel si allowedDisciplines est fourni (déduit automatiquement). MOBILITY_ONLY si uniquement mobilité.',
        ),
      applyToPlannedSessions: z
        .boolean()
        .optional()
        .describe('Appliquer aux séances planifiées dans la période (défaut true).'),
    }),
    execute: async (input) => {
      try {
        return await executeSetTravelContextTool(athleteId, input);
      } catch (error) {
        console.error('[coach/setTravelContext]', error);
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Impossible de créer le contexte voyage',
        };
      }
    },
  });
}

function buildSetTrainingConstraintTool(
  athleteId: string,
  proposalTravelEnum: ReturnType<typeof travelDisciplineEnumForSports>,
) {
  // Approval is declared in coachChatGenerationSettings.toolApproval
  // (`setTrainingConstraint: 'user-approval'`), same as setTravelContext.
  return tool({
    description:
      "Enregistre une contrainte temporaire (dates + capacité d'entraînement réduite) SANS lieu — à utiliser quand l'athlète n'est PAS en déplacement mais a une capacité réduite : maladie, blessure, semaine de travail chargée, etc. Si l'athlète mentionne être ailleurs que chez lui, utilise setTravelContext à la place.",
    inputSchema: z.object({
      startDate: z.string().describe('Date de début yyyy-MM-dd.'),
      endDate: z.string().describe('Date de fin yyyy-MM-dd.'),
      label: z.string().optional().describe('Titre court (ex. Tendinite genou).'),
      note: z.string().optional(),
      allowedDisciplines: z
        .array(proposalTravelEnum)
        .optional()
        .describe(
          'Sports encore possibles pendant cette période. MOBILITY = mobilité/étirements. Vide = tout autorisé.',
        ),
      noStructuredTraining: z
        .boolean()
        .optional()
        .describe('true = aucun sport structuré pendant cette période.'),
      trainingConstraint: z
        .enum(['FULL', 'REDUCED', 'MOBILITY_ONLY', 'NONE'])
        .optional()
        .describe(
          'Optionnel si allowedDisciplines est fourni (déduit automatiquement). MOBILITY_ONLY si uniquement mobilité.',
        ),
    }),
    execute: async (input) => {
      try {
        return await executeSetTrainingConstraintTool(athleteId, input);
      } catch (error) {
        console.error('[coach/setTrainingConstraint]', error);
        return {
          ok: false as const,
          error: error instanceof Error ? error.message : 'Impossible de créer la contrainte',
        };
      }
    },
  });
}

export function buildContextCoachTools(
  athleteId: string,
  proposalTravelEnum: ReturnType<typeof travelDisciplineEnumForSports>,
) {
  return {
    setTravelContext: buildSetTravelContextTool(athleteId, proposalTravelEnum),
    setTrainingConstraint: buildSetTrainingConstraintTool(athleteId, proposalTravelEnum),
  };
}
