import { describe, expect, it } from 'vitest';
import {
  foodAddReducer,
  foodSearchListing,
  initialFoodAddState,
  lastGramsFor,
  needsCompletion,
  previousFoodAddStep,
} from './food-add-flow-state';
import type { FoodProductPayload } from '@sharpit/app/lib/nutrition/food-log/food-log-day';

const SKYR = {
  id: 'skyr',
  source: 'OFF',
  name: 'Skyr',
  kcalPer100g: 62,
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0.2,
  servingGrams: 150,
} as FoodProductPayload;
const RECENT = [{ product: SKYR, lastGrams: 180 }];
const RESULTS = { own: [], products: [SKYR], offUnavailable: false };

describe('foodAddReducer', () => {
  it('opens on the search, for the meal it was started from', () => {
    const state = foodAddReducer(initialFoodAddState(), { type: 'start', meal: 'DINNER' });
    expect(state).toMatchObject({ open: true, step: 'search', meal: 'DINNER', query: '' });
  });

  it('moves to the portion with the last weight logged, and back to search', () => {
    const open = foodAddReducer(initialFoodAddState(), { type: 'start', meal: 'LUNCH' });
    const picked = foodAddReducer(open, {
      type: 'pick',
      picked: { product: SKYR, lastGrams: 180 },
    });
    expect(picked).toMatchObject({ step: 'portion', grams: '180' });
    expect(foodAddReducer(picked, { type: 'step', step: 'search' })).toMatchObject({
      step: 'search',
      picked: null,
    });
  });

  it('closes without resetting the step, so the closing dialog does not flash', () => {
    const quick = foodAddReducer(
      foodAddReducer(initialFoodAddState(), { type: 'start', meal: 'LUNCH' }),
      { type: 'step', step: 'quick' },
    );
    expect(foodAddReducer(quick, { type: 'close' })).toMatchObject({ open: false, step: 'quick' });
  });

  it('clears an error as soon as the athlete types again', () => {
    const failed = foodAddReducer(initialFoodAddState(), { type: 'fail', message: 'Inconnu' });
    expect(foodAddReducer(failed, { type: 'query', query: 'sk' }).error).toBeNull();
    expect(foodAddReducer(failed, { type: 'grams', grams: '12' }).error).toBeNull();
  });
});

describe('search hit completion', () => {
  const summary = {
    ...SKYR,
    barcode: '5690845000621',
    health: { detail: 'summary' },
  } as FoodProductPayload;

  it('reads by barcode only an OFF search hit scored from its summary', () => {
    expect(needsCompletion(summary)).toBe(true);
    expect(needsCompletion({ ...summary, health: { detail: 'full' } } as FoodProductPayload)).toBe(
      false,
    );
    expect(needsCompletion({ ...summary, source: 'CIQUAL' })).toBe(false);
    expect(needsCompletion({ ...summary, barcode: null })).toBe(false);
  });

  it('swaps in the full product only while the athlete is still on it', () => {
    const picked = foodAddReducer(initialFoodAddState(), {
      type: 'pick',
      picked: { product: summary, lastGrams: null },
    });
    const full = { ...summary, name: 'Skyr complet' };
    expect(foodAddReducer(picked, { type: 'complete', product: full }).picked?.product.name).toBe(
      'Skyr complet',
    );
    const other = foodAddReducer(picked, { type: 'complete', product: { ...full, id: 'other' } });
    expect(other).toBe(picked);
  });
});

describe('foodSearchListing', () => {
  it('lists recent foods before typing', () => {
    expect(foodSearchListing('', undefined, RECENT)).toBe('recent');
    expect(foodSearchListing('', undefined, [])).toBe('hint');
  });

  it('hints below two characters and shows results once there are some', () => {
    expect(foodSearchListing('s', RESULTS, RECENT)).toBe('hint');
    expect(foodSearchListing('sky', undefined, RECENT)).toBe('hint');
    expect(foodSearchListing('sky', RESULTS, RECENT)).toBe('results');
  });
});

describe('lastGramsFor', () => {
  it('finds the weight last logged for a product', () => {
    expect(lastGramsFor(RECENT, 'skyr')).toBe(180);
    expect(lastGramsFor(RECENT, 'other')).toBeNull();
  });
});

describe('Mes aliments', () => {
  it('opens the own foods, edits one, and goes back to the list rather than the search', () => {
    const open = foodAddReducer(initialFoodAddState(), { type: 'start', meal: 'LUNCH' });
    const mine = foodAddReducer(open, { type: 'step', step: 'mine' });
    const editing = foodAddReducer(mine, { type: 'editFood', product: SKYR });

    expect(editing).toMatchObject({ step: 'editFood', editing: SKYR });
    expect(previousFoodAddStep(editing.step)).toBe('mine');
    expect(previousFoodAddStep('portion')).toBe('search');
    expect(foodAddReducer(editing, { type: 'step', step: 'mine' })).toMatchObject({
      step: 'mine',
      editing: null,
    });
  });
});
