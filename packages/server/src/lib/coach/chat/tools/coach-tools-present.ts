import { tool } from 'ai';
import type { PracticedSportId } from '@sharpit/app/lib/practiced-sports';
import {
  COACH_CARDS_SCHEMA_VERSION,
  coachFollowUpsSchema,
  coachWorkoutCardProblem,
  coachWorkoutCardSchemaFor,
  type CoachCardOutput,
  type CoachWorkoutCard,
} from '@sharpit/app/lib/coach/chat/cards/coach-cards';
import { coachTypeEnumForSports, rejectIfSportNotPracticed } from './coach-tools-shared';

const DRAWN: CoachCardOutput = { ok: true, schemaVersion: COACH_CARDS_SCHEMA_VERSION };

/**
 * Display tools (ADR-111): the app draws their input as a native card. They write nothing and
 * read nothing — the zod schema is the whole check — and a turn ends once one of them is called
 * (`coachChatGenerationSettings`), so a card never costs another model step.
 */
export function buildPresentCoachTools(
  practicedSports: readonly PracticedSportId[],
  proposalTypeEnum: ReturnType<typeof coachTypeEnumForSports>,
) {
  return {
    presentWorkout: tool({
      description:
        "Affiche UNE séance proposée sous forme de carte native (déroulé, durée, intensité, précautions). N'ajoute RIEN au plan : c'est une proposition à lire. Pour l'enregistrer, l'athlète le demande et tu appelles createPlannedSession.",
      inputSchema: coachWorkoutCardSchemaFor(proposalTypeEnum),
      execute: async (input): Promise<CoachCardOutput> => {
        const rejected = rejectIfSportNotPracticed(input.type, practicedSports);
        if (rejected) {
          return rejected;
        }
        const problem = coachWorkoutCardProblem(input as CoachWorkoutCard);
        return problem ? { ok: false, error: problem } : DRAWN;
      },
    }),
    suggestFollowUps: tool({
      description:
        'Propose 1 à 3 questions de suite, affichées en boutons sous ta réponse. À appeler en DERNIER, une seule fois, quand une suite naturelle existe.',
      inputSchema: coachFollowUpsSchema,
      execute: async (): Promise<CoachCardOutput> => DRAWN,
    }),
  };
}
