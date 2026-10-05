'use client';

import { useReducer } from 'react';
import {
  foodAddReducer,
  foodSearchListing,
  initialFoodAddState,
  lastGramsFor,
  needsCompletion,
  type FoodAddAction,
  type FoodAddSideStep,
  type FoodAddState,
} from '@/components/nutrition/food-log/food-add-flow-state';
import { useFoodAddTemplates } from '@/components/nutrition/food-log/use-food-add-templates';
import {
  buildCustomFood,
  buildCustomFoodUpdate,
  buildPortionEntry,
  buildQuickEntry,
  type FormResult,
} from '@/components/nutrition/food-log/food-log-forms';
import {
  type AddFoodLogEntryVars,
  useAddFoodLogEntry,
  useCreateCustomFood,
  useDeleteCustomFood,
  useFoodBarcodeLookup,
  useFoodSearch,
  useOwnFoods,
  useUpdateCustomFood,
} from '@/hooks/use-data';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type {
  FoodProductPayload,
  RecentFoodPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';

const SEARCH_DEBOUNCE_MS = 350;

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function useFoodAddSearch(state: FoodAddState, recent: RecentFoodPayload[]) {
  const debounced = useDebouncedValue(state.query, SEARCH_DEBOUNCE_MS);
  const searching = state.open && state.step === 'search';
  const search = useFoodSearch(searching ? debounced : '');
  const results = search.data;
  return {
    results,
    listing: foodSearchListing(state.query, results, recent),
    searchError: state.error ?? errorMessage(search.error),
  };
}

type Dispatch = (action: FoodAddAction) => void;

/** The writes behind the dialog: logging an entry, a barcode read, a custom food. */
function useFoodAddWrites(
  trainingDayId: string,
  dispatch: Dispatch,
  pick: (product: FoodProductPayload) => void,
) {
  const add = useAddFoodLogEntry(trainingDayId);
  const barcode = useFoodBarcodeLookup();
  const customFood = useCreateCustomFood();
  // A form that fails its check stays open with the reason.
  const reject = (message: string) => dispatch({ type: 'fail', message });
  const onError = (error: unknown) => reject(errorMessage(error) ?? 'Saisie invalide.');

  return {
    barcodePending: barcode.isPending,
    customPending: customFood.isPending,
    // Instant: the row appears and the dialog closes; a failure rolls it back with a toast.
    log: (result: FormResult<AddFoodLogEntryVars>) => {
      if (!result.ok) {
        return reject(result.message);
      }
      add.mutate(result.value);
      dispatch({ type: 'close' });
    },
    lookupBarcode: (code: string) => barcode.mutate(code, { onSuccess: pick, onError }),
    createFood: (form: FormData) => {
      const result = buildCustomFood(form);
      if (!result.ok) {
        return reject(result.message);
      }
      customFood.mutate(result.value, { onSuccess: pick, onError });
    },
  };
}

type Confirm = ReturnType<typeof useConfirmDialog>['confirm'];

/** « Mes aliments »: the list, read when the step opens, and the edit and delete behind it. */
function useOwnFoodWrites(state: FoodAddState, dispatch: Dispatch, confirm: Confirm) {
  const own = useOwnFoods(state.open && state.step === 'mine');
  const update = useUpdateCustomFood();
  const remove = useDeleteCustomFood();
  const reject = (error: unknown) =>
    dispatch({ type: 'fail', message: errorMessage(error) ?? 'Saisie invalide.' });

  return {
    ownFoods: own.data?.foods ?? [],
    ownFoodsLoading: own.isPending && state.step === 'mine',
    ownFoodsError: errorMessage(own.error),
    editPending: update.isPending,
    editFood: (product: FoodProductPayload) => dispatch({ type: 'editFood', product }),
    saveFood: (form: FormData) => {
      const result = buildCustomFoodUpdate(form);
      if (!result.ok || !state.editing) {
        return result.ok ? undefined : dispatch({ type: 'fail', message: result.message });
      }
      update.mutate(
        { id: state.editing.id, input: result.value },
        { onSuccess: () => dispatch({ type: 'step', step: 'mine' }), onError: reject },
      );
    },
    deleteFood: async (product: FoodProductPayload) => {
      const confirmed = await confirm({
        title: `Supprimer « ${product.name} » ?`,
        description: 'Tes repas déjà notés gardent leurs valeurs.',
        confirmLabel: 'Supprimer',
        variant: 'destructive',
      });
      if (confirmed) {
        remove.mutate(product.id, { onError: reject });
      }
    },
  };
}

/** Reads a picked search hit by barcode, quietly: on failure the summary score stays shown. */
function useFoodCompletion(dispatch: Dispatch) {
  const lookup = useFoodBarcodeLookup();
  return {
    completing: lookup.isPending,
    complete: (product: FoodProductPayload) => {
      if (needsCompletion(product) && product.barcode) {
        lookup.mutate(product.barcode, {
          onSuccess: (full) => dispatch({ type: 'complete', product: full }),
        });
      }
    },
  };
}

function stateSetters(dispatch: Dispatch) {
  return {
    start: (meal: FoodMealKey) => dispatch({ type: 'start', meal }),
    close: () => dispatch({ type: 'close' }),
    setQuery: (query: string) => dispatch({ type: 'query', query }),
    setGrams: (grams: string) => dispatch({ type: 'grams', grams }),
    setMeal: (meal: FoodMealKey) => dispatch({ type: 'meal', meal }),
    showStep: (step: FoodAddSideStep) => dispatch({ type: 'step', step }),
  };
}

export function useFoodAddFlow(trainingDayId: string, recent: RecentFoodPayload[]) {
  const [state, dispatch] = useReducer(foodAddReducer, undefined, initialFoodAddState);
  const { completing, complete } = useFoodCompletion(dispatch);
  const search = useFoodAddSearch(state, recent);
  const pickProduct = (product: FoodProductPayload) => {
    const logged = [...recent, ...(search.results?.eaten ?? [])];
    dispatch({ type: 'pick', picked: { product, lastGrams: lastGramsFor(logged, product.id) } });
    complete(product);
  };
  const { log, ...writes } = useFoodAddWrites(trainingDayId, dispatch, pickProduct);
  const { confirm, dialog } = useConfirmDialog();
  const context = { meal: state.meal, trainingDayId };

  return {
    state,
    recent,
    ...search,
    ...writes,
    ...useOwnFoodWrites(state, dispatch, confirm),
    ...useFoodAddTemplates({ trainingDayId, state, dispatch, confirm, pick: pickProduct }),
    confirmDialog: dialog,
    ...stateSetters(dispatch),
    pickProduct,
    completing,
    logPortion: () =>
      state.picked && log(buildPortionEntry(state.picked.product, state.grams, context)),
    logQuick: (form: FormData) => log(buildQuickEntry(form, context)),
  };
}

export type FoodAddFlow = ReturnType<typeof useFoodAddFlow>;
