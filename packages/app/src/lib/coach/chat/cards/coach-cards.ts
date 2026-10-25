/**
 * The coach's native cards (ADR-111): what the model hands the app to draw, beside its prose.
 *
 * Each card is the input of a display tool (`presentWorkout`, `suggestFollowUps`): the AI SDK
 * validates it against these schemas before the tool runs, so a card that reaches the client is
 * already whole. The tool's output carries `schemaVersion`; the Swift models
 * (`CoachCards.swift`) decode the same shapes, pinned by the fixtures next to this file.
 *
 * Never code, HTML or markup: plain fields the app lays out itself. Targets (paces, watts, heart
 * rates) are not authored either — a step names its effort and the app derives the numbers.
 */
import { z } from 'zod';
import { coachEndurancePrescriptionSchema } from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import { coachStrengthPrescriptionSchema } from '@sharpit/app/lib/planned-session/strength/strength-prescription';

export const COACH_CARDS_SCHEMA_VERSION = 1;

const sessionTypeEnum = z.enum(['RUN', 'BIKE', 'SWIM', 'STRENGTH']);
const sessionIntensityEnum = z.enum([
  'RECOVERY',
  'ENDURANCE',
  'TEMPO',
  'THRESHOLD',
  'VO2MAX',
  'RACE',
]);

/** The fields of a workout card, the sport's enum left to the caller (narrowed to practiced sports). */
export function coachWorkoutCardSchemaFor<TType extends z.ZodType<string>>(type: TType) {
  return z.object({
    type,
    title: z.string().trim().min(1).max(80).describe('Titre court de la séance.'),
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe('Objectif de la séance en une phrase (ce qu’elle développe, pourquoi maintenant).'),
    intensity: sessionIntensityEnum.optional().describe('Intensité dominante.'),
    durationMin: z.number().min(5).max(420).optional().describe('Durée totale estimée.'),
    load: z.number().min(0).max(400).optional().describe('TSS estimé.'),
    endurancePrescription: coachEndurancePrescriptionSchema
      .optional()
      .describe('Déroulé structuré pour RUN, BIKE et SWIM. Omettre pour STRENGTH.'),
    strengthPrescription: coachStrengthPrescriptionSchema
      .optional()
      .describe('OBLIGATOIRE si type=STRENGTH : exercices avec séries/reps/repos.'),
    warnings: z
      .array(z.string().trim().min(1).max(160))
      .max(3)
      .describe(
        'Précautions ou adaptations liées à CET athlète (douleur déclarée, fatigue, donnée manquante). [] si aucune.',
      ),
  });
}

export const coachWorkoutCardSchema = coachWorkoutCardSchemaFor(sessionTypeEnum);
export type CoachWorkoutCard = z.infer<typeof coachWorkoutCardSchema>;

export const coachFollowUpsSchema = z.object({
  suggestions: z
    .array(z.string().trim().min(2).max(80))
    .min(1)
    .max(3)
    .describe(
      'Questions que l’athlète pourrait poser ensuite, écrites à sa place (« Et si je n’ai que 45 min ? »).',
    ),
});
export type CoachFollowUps = z.infer<typeof coachFollowUpsSchema>;

/** What a display tool answers: nothing to read back, only the contract it was drawn with. */
export type CoachCardOutput =
  { ok: true; schemaVersion: typeof COACH_CARDS_SCHEMA_VERSION } | { ok: false; error: string };

/** A strength card without its exercises, or an endurance card with them, cannot be drawn. */
export function coachWorkoutCardProblem(card: CoachWorkoutCard): string | null {
  if (card.type === 'STRENGTH' && !card.strengthPrescription) {
    return 'strengthPrescription manquante pour une séance STRENGTH.';
  }
  if (card.type !== 'STRENGTH' && card.strengthPrescription) {
    return 'strengthPrescription réservée aux séances STRENGTH.';
  }
  if (card.type === 'STRENGTH' && card.endurancePrescription) {
    return 'endurancePrescription réservée à RUN, BIKE et SWIM.';
  }
  return null;
}
