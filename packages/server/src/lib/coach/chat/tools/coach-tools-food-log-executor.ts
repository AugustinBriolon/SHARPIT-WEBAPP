import { addFoodLogEntry } from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { resolveDescribedName } from '@sharpit/server/lib/nutrition/food-log/food-describe-resolve';
import { portionFromPer100g } from '@sharpit/server/lib/nutrition/food-log/food-describe-schema';
import type { LogFoodsInput } from './coach-tools-food-log';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type LogFoodsResult = {
  ok: true;
  date: string;
  meal: LogFoodsInput['meal'];
  count: number;
  items: Array<{
    name: string;
    grams: number;
    matched: boolean;
    match: string | null;
  }>;
};

/**
 * Resolve each proposed food (eaten → own → Ciqual → OFF), then log it. Unmatched lines keep the
 * coach's estimated macros as a quick add.
 */
export async function executeLogFoodsTool(
  athleteId: string,
  input: LogFoodsInput,
): Promise<LogFoodsResult | { ok: false; error: string }> {
  if (!DATE_RE.test(input.date)) {
    return { ok: false, error: 'Date du journal invalide (yyyy-MM-dd).' };
  }
  if (input.items.length === 0) {
    return { ok: false, error: 'Aucun aliment à ajouter.' };
  }

  const logged: LogFoodsResult['items'] = [];

  for (const item of input.items) {
    const grams = Math.min(5_000, Math.max(1, Math.round(item.grams)));
    const linked = await resolveDescribedName(athleteId, item.name);
    if (linked) {
      await addFoodLogEntry(athleteId, {
        trainingDayId: input.date,
        meal: input.meal,
        grams,
        productId: linked.product.id,
      });
      logged.push({
        name: linked.product.name,
        grams,
        matched: true,
        match: linked.match,
      });
      continue;
    }

    const portion = portionFromPer100g({
      name: item.name.trim().slice(0, 120),
      grams,
      kcalPer100g: item.kcalPer100g,
      proteinPer100g: item.proteinPer100g,
      carbsPer100g: item.carbsPer100g,
      fatPer100g: item.fatPer100g,
    });
    await addFoodLogEntry(athleteId, {
      trainingDayId: input.date,
      meal: input.meal,
      grams,
      quick: {
        name: portion.name,
        kcal: portion.kcal,
        protein: portion.protein,
        carbs: portion.carbs,
        fat: portion.fat,
      },
    });
    logged.push({
      name: portion.name,
      grams,
      matched: false,
      match: null,
    });
  }

  return {
    ok: true,
    date: input.date,
    meal: input.meal,
    count: logged.length,
    items: logged,
  };
}
