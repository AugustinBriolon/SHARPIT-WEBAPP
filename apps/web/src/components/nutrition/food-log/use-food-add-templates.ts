'use client';

import type {
  FoodAddAction,
  FoodAddState,
} from '@/components/nutrition/food-log/food-add-flow-state';
import { buildRecipeInput, type RecipeDraft } from '@/components/nutrition/food-log/recipe-draft';
import {
  useDeleteSavedMeal,
  useLogSavedMeal,
  useSavedMeals,
  useSaveRecipe,
} from '@/hooks/use-data';
import type {
  FoodProductPayload,
  SavedMealPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';

type Dispatch = (action: FoodAddAction) => void;

type Confirm = (options: {
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: 'default' | 'destructive';
}) => Promise<boolean>;

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** « Mes repas » and the recipe builder behind the add dialog (ADR-071). */
export function useFoodAddTemplates({
  trainingDayId,
  state,
  dispatch,
  confirm,
  pick,
}: {
  trainingDayId: string;
  state: FoodAddState;
  dispatch: Dispatch;
  confirm: Confirm;
  pick: (product: FoodProductPayload) => void;
}) {
  const saved = useSavedMeals(state.open && state.step === 'meals');
  const logSaved = useLogSavedMeal(trainingDayId);
  const removeSaved = useDeleteSavedMeal();
  const recipe = useSaveRecipe();
  const reject = (error: unknown) =>
    dispatch({ type: 'fail', message: errorMessage(error) ?? 'Saisie invalide.' });

  return {
    savedMeals: saved.data?.meals ?? [],
    savedMealsLoading: saved.isPending && state.step === 'meals',
    savedMealsError: errorMessage(saved.error),
    // Instant: the foods appear in the meal and the dialog closes; a failure rolls them back.
    logSavedMeal: (meal: SavedMealPayload) => {
      logSaved.mutate({ saved: meal, meal: state.meal });
      dispatch({ type: 'close' });
    },
    deleteSavedMeal: async (meal: SavedMealPayload) => {
      const confirmed = await confirm({
        title: `Supprimer « ${meal.name} » ?`,
        description: 'Les repas déjà notés restent dans ton journal.',
        confirmLabel: 'Supprimer',
        variant: 'destructive',
      });
      if (confirmed) {
        removeSaved.mutate(meal.id);
      }
    },
    recipePending: recipe.isPending,
    /** A new recipe goes on to its portion; an edited one returns to « Mes aliments ». */
    saveRecipe: (draft: RecipeDraft) => {
      const result = buildRecipeInput(draft);
      if (!result.ok) {
        return dispatch({ type: 'fail', message: result.message });
      }
      const id = state.step === 'editFood' ? state.editing?.id : undefined;
      recipe.mutate(
        { id, input: result.value },
        {
          onSuccess: (product) => (id ? dispatch({ type: 'step', step: 'mine' }) : pick(product)),
          onError: reject,
        },
      );
    },
  };
}
