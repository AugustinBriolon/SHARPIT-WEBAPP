import { z } from 'zod';

/** One food line the model extracts from a free-text meal description. Values are per 100 g. */
export const foodDescribeItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** The food as a French composition table writes it: what the catalogs are searched with. */
  searchName: z.string().trim().min(1).max(120),
  grams: z.number().finite().min(1).max(5_000),
  kcalPer100g: z.number().finite().min(0).max(900),
  proteinPer100g: z.number().finite().min(0).max(100),
  carbsPer100g: z.number().finite().min(0).max(100),
  fatPer100g: z.number().finite().min(0).max(100),
});

/** One dish of the description — a starter, a main, a dessert — estimated on its own. */
export const foodDescribeDishSchema = z.object({
  /** Logged as the group's label, hence its limit (ADR-134). */
  name: z.string().trim().min(1).max(80),
  items: z.array(foodDescribeItemSchema).min(1).max(8),
});

export const foodDescribeResultSchema = z.object({
  dishes: z.array(foodDescribeDishSchema).min(1).max(8),
});

export type FoodDescribeItem = z.infer<typeof foodDescribeItemSchema>;
export type FoodDescribeDish = z.infer<typeof foodDescribeDishSchema>;
export type FoodDescribeResult = z.infer<typeof foodDescribeResultSchema>;

export const foodDescribeRequestSchema = z.object({
  description: z.string().trim().min(3).max(2_000),
});

export type FoodDescribeRequest = z.infer<typeof foodDescribeRequestSchema>;

/** Portion macros for a quick-add entry (same contract as `FoodQuickAdd`). */
export function portionFromPer100g(item: {
  name: string;
  grams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
}): {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const factor = item.grams / 100;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    name: item.name,
    grams: Math.round(item.grams),
    kcal: Math.round(item.kcalPer100g * factor),
    protein: round1(item.proteinPer100g * factor),
    carbs: round1(item.carbsPer100g * factor),
    fat: round1(item.fatPer100g * factor),
  };
}

type Per100g = Pick<
  FoodDescribeItem,
  'kcalPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'
>;

/** Energy below what the macros alone bring is impossible; this far under, it is a model slip. */
const ATWATER_TOLERANCE = 0.85;

/**
 * Figures a food can physically have: at most 100 g of macros in 100 g, and never less energy
 * than those macros bring (4/4/9 kcal per gram). More energy than the macros is left alone:
 * alcohol (7 kcal/g) is not one of the three.
 */
export function coherentPer100g<T extends Per100g>(item: T): T {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const total = item.proteinPer100g + item.carbsPer100g + item.fatPer100g;
  const scale = total > 100 ? 100 / total : 1;
  const protein = round1(item.proteinPer100g * scale);
  const carbs = round1(item.carbsPer100g * scale);
  const fat = round1(item.fatPer100g * scale);
  const fromMacros = 4 * protein + 4 * carbs + 9 * fat;
  const kcal =
    item.kcalPer100g < fromMacros * ATWATER_TOLERANCE ? Math.round(fromMacros) : item.kcalPer100g;
  return {
    ...item,
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbsPer100g: carbs,
    fatPer100g: fat,
  };
}
