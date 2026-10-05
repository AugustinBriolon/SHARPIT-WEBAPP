import { describe, expect, it } from 'vitest';
import type { FoodProductPayload } from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import {
  buildRecipeInput,
  recipeDraftFrom,
  recipeDraftPreview,
  withIngredient,
  withIngredientGrams,
  withoutIngredient,
} from './recipe-draft';

const RICE: FoodProductPayload = {
  id: 'rice',
  source: 'CIQUAL',
  name: 'Riz blanc, cru',
  kcalPer100g: 350,
  proteinPer100g: 7,
  carbsPer100g: 78,
  fatPer100g: 1,
};
const CHICKEN: FoodProductPayload = {
  id: 'chicken',
  source: 'CIQUAL',
  name: 'Poulet, filet',
  kcalPer100g: 110,
  proteinPer100g: 23,
  carbsPer100g: 0,
  fatPer100g: 2,
  servingGrams: 150,
};

describe('recipe draft', () => {
  it('adds a food once, at its serving or 100 g', () => {
    let draft = withIngredient(recipeDraftFrom(null), RICE);
    draft = withIngredient(draft, CHICKEN);
    draft = withIngredient(draft, RICE);
    expect(draft.ingredients.map((item) => [item.food.productId, item.grams])).toEqual([
      ['rice', '100'],
      ['chicken', '150'],
    ]);
  });

  it('previews the label from the grams typed, over the cooked weight', () => {
    let draft = withIngredient(withIngredient(recipeDraftFrom(null), RICE), CHICKEN);
    draft = withIngredientGrams(draft, 'chicken', '100');
    expect(recipeDraftPreview(draft)).toMatchObject({ kcalPer100g: 230, totalGrams: 200 });
    expect(recipeDraftPreview({ ...draft, cookedGrams: '400', servings: '2' })).toMatchObject({
      kcalPer100g: 115,
      servingGrams: 200,
    });
    expect(
      recipeDraftPreview(withoutIngredient(withoutIngredient(draft, 'rice'), 'chicken')),
    ).toBeNull();
  });

  it('reopens a saved recipe as it was built', () => {
    const draft = recipeDraftFrom({
      ...RICE,
      id: 'r1',
      source: 'CUSTOM',
      name: 'Riz au poulet',
      recipe: {
        ingredients: [{ ...RICE, productId: 'rice', grams: 120 }],
        cookedGrams: 300,
        servings: null,
        totalGrams: 300,
      },
    });
    expect(draft).toMatchObject({ name: 'Riz au poulet', cookedGrams: '300', servings: '' });
    expect(draft.ingredients[0]?.grams).toBe('120');
  });

  it('says what is missing before it reaches the server', () => {
    const empty = recipeDraftFrom(null);
    expect(buildRecipeInput(empty)).toEqual({ ok: false, message: 'Donne un nom à ta recette.' });
    expect(buildRecipeInput({ ...empty, name: 'Bol' })).toEqual({
      ok: false,
      message: 'Ajoute au moins un ingrédient.',
    });
    const draft = withIngredientGrams(withIngredient({ ...empty, name: 'Bol' }, RICE), 'rice', '');
    expect(buildRecipeInput(draft)).toEqual({
      ok: false,
      message: 'Indique les grammes de « Riz blanc, cru ».',
    });
  });

  it('builds the input the server reads', () => {
    const draft = {
      ...withIngredient(recipeDraftFrom(null), RICE),
      name: 'Riz',
      cookedGrams: '250,5',
      servings: '',
    };
    expect(buildRecipeInput(draft)).toEqual({
      ok: true,
      value: {
        name: 'Riz',
        ingredients: [{ productId: 'rice', grams: 100 }],
        cookedGrams: 250.5,
        servings: null,
      },
    });
  });
});
