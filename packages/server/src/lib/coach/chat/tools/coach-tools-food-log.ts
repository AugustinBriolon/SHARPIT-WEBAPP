import { tool } from 'ai';
import { z } from 'zod';
import { FOOD_MEALS } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import { executeLogFoodsTool } from './coach-tools-food-log-executor';
import { coachToolFailure } from './coach-tools-shared';

/**
 * Per-100 g ranges match the food-log own-food API (`customFoodSchema`): kcal and macros
 * 0…1000. Grams match entry create (`positive`…5000).
 */
const foodLogItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe('Nom court de l’aliment en français, tel que l’athlète le décrit (ex. frites).'),
  grams: z
    .number()
    .finite()
    .positive()
    .max(5_000)
    .describe(
      'Portion en grammes. Si l’athlète donne une quantité (ex. 100 g), utilise EXACTEMENT cette valeur ; sinon estime.',
    ),
  kcalPer100g: z
    .number()
    .finite()
    .min(0)
    .max(1_000)
    .describe('Énergie pour 100 g (estimation si l’aliment n’est pas trouvé en catalogue).'),
  proteinPer100g: z.number().finite().min(0).max(1_000),
  carbsPer100g: z.number().finite().min(0).max(1_000),
  fatPer100g: z.number().finite().min(0).max(1_000),
});

export const logFoodsInputSchema = z.object({
  date: z
    .string()
    .describe(
      'Jour du journal yyyy-MM-dd. Calcule depuis la date ISO du contexte : « hier » = veille, « avant-hier » = J-2, date citée = ce jour. Ne mets JAMAIS aujourd’hui si l’athlète parle d’un autre jour.',
    ),
  meal: z
    .enum(FOOD_MEALS)
    .describe(
      'Repas cible : petit-déj → BREAKFAST, déjeuner → LUNCH, dîner/diner → DINNER, collation/snack → SNACKS ; sinon selon l’heure.',
    ),
  items: z
    .array(foodLogItemSchema)
    .min(1)
    .max(12)
    .describe('Aliments distincts à ajouter, avec grammes et macros /100 g estimés.'),
});

export type LogFoodsInput = z.infer<typeof logFoodsInputSchema>;

/** Writes foods into the SharpIt food log after the athlete validates the card. */
export function buildLogFoodsTool(athleteId: string) {
  return tool({
    description:
      'Ajoute un ou plusieurs aliments au journal alimentaire SharpIt (un repas, aujourd’hui ou un jour passé). Respecte le jour (hier / date), le repas et les grammes donnés par l’athlète. Une carte propose le repas et les grammes : l’athlète peut les ajuster avant de valider (pas la date). Ne pas inventer de produits hors de ce qu’il décrit.',
    inputSchema: logFoodsInputSchema,
    execute: async (input, { toolCallId }) => {
      try {
        return await executeLogFoodsTool(athleteId, input, { toolCallId });
      } catch (error) {
        // Do not log meal content / tool input — only a short failure tag.
        console.error('[coach] logFoods failed');
        return coachToolFailure("Impossible d'ajouter ces aliments au journal", error);
      }
    },
  });
}

export function buildFoodLogCoachTools(athleteId: string) {
  return {
    logFoods: buildLogFoodsTool(athleteId),
  };
}
