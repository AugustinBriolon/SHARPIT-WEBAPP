'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { formatApiErrorMessage, parseApiErrorBody } from '@/client/query/api-error';
import { queryKeys } from '@/client/query/keys';
import { tempId } from '@/client/query/optimistic';
import { sendJson } from '@/client/query/send-json';
import {
  patchFoodLogDay,
  refreshFoodLogReaders,
  rollbackFoodLogDay,
} from '@/hooks/nutrition/food-log-cache';
import { toast } from '@/components/ui/toast';
import {
  savedMealPreviewEntries,
  type FoodLogDayPayload,
  type FoodProductPayload,
  type LoggedEntriesPayload,
  type SavedMealPayload,
  type SavedMealsPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';
import type {
  FoodLogCopyInput,
  RecipeInput,
  SavedMealCreateInput,
} from '@sharpit/app/lib/validators/food-log';
import { apiFetch } from '@sharpit/ui/client/query/api-fetch';

/**
 * What a MyFitnessPal athlete logs with in one tap (ADR-071): a meal copied from yesterday, a meal
 * kept under a name, a recipe made of other foods.
 */

const ENDPOINT = '/api/food-log';

function withEntriesAdded(day: FoodLogDayPayload, entries: FoodLogDayPayload['entries']) {
  return { ...day, entries: [...day.entries, ...entries] };
}

export function useSavedMeals(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.savedMeals,
    enabled,
    queryFn: async () => {
      const res = await apiFetch(`${ENDPOINT}/meals`);
      if (!res.ok) {
        const body = parseApiErrorBody(await res.json().catch(() => null));
        throw new Error(formatApiErrorMessage(body ?? {}, 'Tes repas sont indisponibles.'));
      }
      return (await res.json()) as SavedMealsPayload;
    },
    staleTime: 60_000,
  });
}

export type CopyFoodLogVars = Omit<FoodLogCopyInput, 'toTrainingDayId'>;

/**
 * Copies a meal (or a whole day) into this day. The source may not be in the cache, so the rows
 * arrive with the server's answer; an empty source says so instead of doing nothing silently.
 */
export function useCopyFoodLog(trainingDayId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CopyFoodLogVars) =>
      (await sendJson(`${ENDPOINT}/copy`, 'POST', {
        ...vars,
        toTrainingDayId: trainingDayId,
      })) as LoggedEntriesPayload,
    onSuccess: ({ entries }, vars) => {
      if (entries.length === 0) {
        toast.info(vars.fromMeal ? 'Ce repas était vide.' : 'Rien de noté ce jour-là.');
        return;
      }
      queryClient.setQueryData<FoodLogDayPayload>(queryKeys.foodLogDay(trainingDayId), (day) =>
        day ? withEntriesAdded(day, entries) : day,
      );
    },
    onError: (error) =>
      toast.error('La copie a échoué, rien n’a été ajouté.', {
        description: error instanceof Error ? error.message : undefined,
      }),
    onSettled: () => refreshFoodLogReaders(queryClient, trainingDayId),
  });
}

export function useSaveMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavedMealCreateInput) => {
      const data = (await sendJson(`${ENDPOINT}/meals`, 'POST', input)) as {
        meal: SavedMealPayload;
      };
      return data.meal;
    },
    onSuccess: (meal) => toast.success(`« ${meal.name} » est dans tes repas.`),
    onError: (error) =>
      toast.error('Le repas n’a pas été enregistré.', {
        description: error instanceof Error ? error.message : undefined,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedMeals }),
  });
}

export type LogSavedMealVars = { saved: SavedMealPayload; meal: FoodMealKey };

/** Instant: the saved foods appear in the meal at once, and the server's rows replace them. */
export function useLogSavedMeal(trainingDayId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ saved, meal }: LogSavedMealVars) =>
      sendJson(`${ENDPOINT}/meals/${encodeURIComponent(saved.id)}/log`, 'POST', {
        trainingDayId,
        meal,
      }),
    onMutate: ({ saved, meal }) =>
      patchFoodLogDay(queryClient, trainingDayId, (day) =>
        withEntriesAdded(day, savedMealPreviewEntries(saved, { trainingDayId, meal }, tempId)),
      ),
    onError: (error, _vars, context) =>
      rollbackFoodLogDay(queryClient, trainingDayId, context, error),
    onSettled: () =>
      Promise.all([
        refreshFoodLogReaders(queryClient, trainingDayId),
        queryClient.invalidateQueries({ queryKey: queryKeys.savedMeals }),
      ]),
  });
}

async function removeSavedMealFromList(queryClient: QueryClient, id: string) {
  await queryClient.cancelQueries({ queryKey: queryKeys.savedMeals });
  const previous = queryClient.getQueryData<SavedMealsPayload>(queryKeys.savedMeals);
  if (previous) {
    queryClient.setQueryData<SavedMealsPayload>(queryKeys.savedMeals, {
      meals: previous.meals.filter((meal) => meal.id !== id),
    });
  }
  return { previous };
}

export function useDeleteSavedMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      sendJson(`${ENDPOINT}/meals/${encodeURIComponent(id)}`, 'DELETE'),
    onMutate: (id) => removeSavedMealFromList(queryClient, id),
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.savedMeals, context.previous);
      }
      toast.error('Le repas n’a pas été supprimé.', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.savedMeals }),
  });
}

/** A recipe is an own food: the list and the searches that may show it follow. */
function refreshRecipes(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.ownFoods }),
    queryClient.invalidateQueries({ queryKey: queryKeys.foodSearchAll }),
  ]);
}

export type SaveRecipeVars = { id?: string; input: RecipeInput };

/** Creates a recipe, or replaces one's ingredients when an id is given. */
export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: SaveRecipeVars) => {
      const data = (await (id
        ? sendJson(`${ENDPOINT}/recipes/${encodeURIComponent(id)}`, 'PUT', input)
        : sendJson(`${ENDPOINT}/recipes`, 'POST', input))) as { product: FoodProductPayload };
      return data.product;
    },
    onSettled: () => refreshRecipes(queryClient),
  });
}
