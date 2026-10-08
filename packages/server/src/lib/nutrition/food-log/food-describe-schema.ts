import { z } from 'zod';

/** One food line the model extracts from a free-text meal description. Values are per 100 g. */
export const foodDescribeItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  grams: z.number().finite().min(1).max(5_000),
  kcalPer100g: z.number().finite().min(0).max(900),
  proteinPer100g: z.number().finite().min(0).max(100),
  carbsPer100g: z.number().finite().min(0).max(100),
  fatPer100g: z.number().finite().min(0).max(100),
});

export const foodDescribeResultSchema = z.object({
  items: z.array(foodDescribeItemSchema).min(1).max(12),
});

export type FoodDescribeItem = z.infer<typeof foodDescribeItemSchema>;
export type FoodDescribeResult = z.infer<typeof foodDescribeResultSchema>;

export const foodDescribeRequestSchema = z.object({
  description: z.string().trim().min(8).max(2_000),
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
