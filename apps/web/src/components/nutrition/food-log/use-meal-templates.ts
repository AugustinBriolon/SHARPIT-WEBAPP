'use client';

import { useState } from 'react';
import { useCopyFoodLog, useSaveMeal } from '@/hooks/use-data';
import {
  previousTrainingDay,
  type FoodLogMealGroup,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';

/** A meal or the whole day copied from the day before, and a meal kept under a name (ADR-071). */
export function useMealTemplates(trainingDayId: string) {
  const copy = useCopyFoodLog(trainingDayId);
  const save = useSaveMeal();
  const [saving, setSaving] = useState<FoodLogMealGroup | null>(null);
  const fromTrainingDayId = previousTrainingDay(trainingDayId);

  return {
    copyMealFromYesterday: (meal: FoodMealKey) =>
      copy.mutate({ fromTrainingDayId, fromMeal: meal }),
    copyDayFromYesterday: () => copy.mutate({ fromTrainingDayId }),
    savingMeal: saving,
    openSaveMeal: setSaving,
    closeSaveMeal: () => setSaving(null),
    // The dialog closes on the tap; the toast says when the meal is kept, or why not.
    saveMeal: (name: string) => {
      if (saving) {
        save.mutate({ name, trainingDayId, meal: saving.meal });
      }
      setSaving(null);
    },
  };
}
