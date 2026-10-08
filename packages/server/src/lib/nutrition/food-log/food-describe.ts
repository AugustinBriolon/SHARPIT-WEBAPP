import { generateText, Output } from 'ai';
import {
  COACH_STRUCTURED_MODEL,
  coachAnalysisGatewayOptions,
  isCoachConfigured,
} from '@sharpit/server/lib/ai';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import {
  foodDescribeResultSchema,
  type FoodDescribeItem,
  type FoodDescribeResult,
} from './food-describe-schema';

export const FOOD_DESCRIBE_SYSTEM = `Tu es un assistant nutrition pour SharpIt (athlètes francophones).
L'athlète décrit un repas en texte libre. Tu le découpes en aliments distincts, pesables séparément.

Règles:
- Une ligne = un aliment (ex. faux-filet, frites, brocolis — pas un seul plat composite).
- Estime les grammes consommés et les macros pour 100 g (valeurs réalistes Ciqual / cuisine).
- Noms courts en français, sans marque inventée.
- Ignore boissons sans énergie significative sauf si l'athlète les cite clairement.
- Maximum 12 lignes. Si la description est trop vague, fais des hypothèses raisonnables et reste conservateur sur les portions.
- Ne réponds qu'avec l'objet JSON demandé.`;

export function formatFoodDescribePrompt(description: string): string {
  return `Description du repas:\n\n${description.trim()}`;
}

export class FoodDescribeUnavailableError extends Error {
  constructor() {
    super('La description de repas est indisponible pour le moment.');
    this.name = 'FoodDescribeUnavailableError';
  }
}

export class FoodDescribeEmptyError extends Error {
  constructor() {
    super('Aucun aliment n’a pu être déduit. Reformule avec les plats et les quantités.');
    this.name = 'FoodDescribeEmptyError';
  }
}

export async function describeMealFromText(input: {
  athleteId: string;
  description: string;
}): Promise<FoodDescribeResult> {
  if (!isCoachConfigured()) {
    throw new FoodDescribeUnavailableError();
  }

  const { output, usage } = await generateText({
    model: COACH_STRUCTURED_MODEL,
    output: Output.object({ schema: foodDescribeResultSchema }),
    system: FOOD_DESCRIBE_SYSTEM,
    prompt: formatFoodDescribePrompt(input.description),
    providerOptions: coachAnalysisGatewayOptions,
  });
  void recordAiUsage(input.athleteId, 'analysis', usage);

  if (!output?.items?.length) {
    throw new FoodDescribeEmptyError();
  }

  return { items: output.items.map(normalizeItem) };
}

function normalizeItem(item: FoodDescribeItem): FoodDescribeItem {
  return {
    name: item.name.trim().slice(0, 120),
    grams: Math.min(5_000, Math.max(1, Math.round(item.grams))),
    kcalPer100g: clamp(item.kcalPer100g, 0, 900),
    proteinPer100g: clamp(item.proteinPer100g, 0, 100),
    carbsPer100g: clamp(item.carbsPer100g, 0, 100),
    fatPer100g: clamp(item.fatPer100g, 0, 100),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}
