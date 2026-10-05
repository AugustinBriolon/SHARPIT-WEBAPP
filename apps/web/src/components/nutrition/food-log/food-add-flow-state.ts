import {
  defaultPortionGrams,
  type FoodProductPayload,
  type FoodSearchPayload,
  type RecentFoodPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import type { FoodMealKey } from '@sharpit/app/lib/nutrition/food-log/food-log-math';

/**
 * The add-food dialog as a state machine: search (or barcode) → portion, with the quick add, the
 * custom food, the athlete's own foods (« Mes aliments », where one is edited), their saved meals
 * (« Mes repas ») and the recipe builder as side steps (ADR-071). Pure, so every transition is
 * tested without rendering.
 */

export type FoodAddStep =
  'search' | 'portion' | 'quick' | 'custom' | 'mine' | 'editFood' | 'meals' | 'recipe';

/** The steps a button opens directly; the portion and the edit carry what they act on. */
export type FoodAddSideStep = Exclude<FoodAddStep, 'portion' | 'editFood'>;

export type PickedFood = { product: FoodProductPayload; lastGrams: number | null };

export type FoodAddState = {
  open: boolean;
  step: FoodAddStep;
  meal: FoodMealKey;
  query: string;
  picked: PickedFood | null;
  /** The own food (or recipe) being edited, on the `editFood` step. */
  editing: FoodProductPayload | null;
  grams: string;
  error: string | null;
};

export type FoodAddAction =
  | { type: 'start'; meal: FoodMealKey }
  | { type: 'close' }
  | { type: 'query'; query: string }
  | { type: 'pick'; picked: PickedFood }
  | { type: 'complete'; product: FoodProductPayload }
  | { type: 'grams'; grams: string }
  | { type: 'meal'; meal: FoodMealKey }
  | { type: 'step'; step: FoodAddSideStep }
  | { type: 'editFood'; product: FoodProductPayload }
  | { type: 'fail'; message: string };

export function initialFoodAddState(): FoodAddState {
  return {
    open: false,
    step: 'search',
    meal: 'BREAKFAST',
    query: '',
    picked: null,
    editing: null,
    grams: '',
    error: null,
  };
}

function pickedState(state: FoodAddState, picked: PickedFood): FoodAddState {
  return {
    ...state,
    step: 'portion',
    picked,
    grams: String(defaultPortionGrams(picked.product, picked.lastGrams)),
    error: null,
  };
}

export function foodAddReducer(state: FoodAddState, action: FoodAddAction): FoodAddState {
  switch (action.type) {
    case 'start':
      return { ...initialFoodAddState(), open: true, meal: action.meal };
    // Only the visibility flips, so the closing dialog does not flash its first step.
    case 'close':
      return { ...state, open: false };
    case 'query':
      return { ...state, query: action.query, error: null };
    case 'pick':
      return pickedState(state, action.picked);
    // The full product read by barcode replaces the search hit, if the athlete is still on it.
    case 'complete':
      return state.picked?.product.id === action.product.id
        ? { ...state, picked: { ...state.picked, product: action.product } }
        : state;
    case 'grams':
      return { ...state, grams: action.grams, error: null };
    case 'meal':
      return { ...state, meal: action.meal };
    case 'step':
      return { ...state, step: action.step, picked: null, editing: null, error: null };
    case 'editFood':
      return { ...state, step: 'editFood', editing: action.product, error: null };
    case 'fail':
      return { ...state, error: action.message };
    default:
      return state;
  }
}

export type FoodSearchListing = 'recent' | 'hint' | 'results';

/** Recent foods before typing, a hint below two characters, results once there is a search. */
export function foodSearchListing(
  query: string,
  results: FoodSearchPayload | undefined,
  recent: RecentFoodPayload[],
): FoodSearchListing {
  const typed = query.trim();
  if (!typed) {
    return recent.length > 0 ? 'recent' : 'hint';
  }
  return typed.length >= 2 && results ? 'results' : 'hint';
}

/** Where « back » leads: an edited food or recipe returns to « Mes aliments », the rest to search. */
export function previousFoodAddStep(step: FoodAddStep): 'search' | 'mine' {
  return step === 'editFood' ? 'mine' : 'search';
}

/** A search hit scored from OFF's summary: its barcode read brings the additive list (ADR-063). */
export function needsCompletion(product: FoodProductPayload): boolean {
  return product.source === 'OFF' && !!product.barcode && product.health?.detail === 'summary';
}

/** The weight last logged for a product, so a search pick offers it like a recent one. */
export function lastGramsFor(recent: RecentFoodPayload[], productId: string): number | null {
  return recent.find((item) => item.product.id === productId)?.lastGrams ?? null;
}
