import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_DIET_FACTS,
  assessDietFit,
  dietFactsFromOff,
  type OffDietTags,
} from './food-diet-fit';

const NO_TAGS: OffDietTags = {
  ingredientsAnalysis: null,
  allergens: null,
  traces: null,
  labels: null,
  categories: null,
  ingredientCount: null,
};

const ALL_DIETS = {
  ids: ['vegan', 'vegetarian', 'gluten_free', 'dairy_free', 'keto', 'low_carb'],
  labels: [
    'Végétalien',
    'Végétarien',
    'Sans gluten',
    'Sans produits laitiers',
    'Cétogène',
    'Pauvre en glucides',
  ],
};

describe('dietFactsFromOff', () => {
  it('reads a spread with milk and nuts', () => {
    const facts = dietFactsFromOff({
      ...NO_TAGS,
      ingredientsAnalysis: ['en:palm-oil', 'en:non-vegan', 'en:vegetarian'],
      allergens: ['en:milk', 'en:nuts'],
      traces: [],
      ingredientCount: 8,
    });
    expect(facts).toEqual({ vegan: 'no', vegetarian: 'yes', gluten: 'absent', milk: 'contains' });
  });

  it('trusts a gluten-free label and reports traces', () => {
    expect(dietFactsFromOff({ ...NO_TAGS, labels: ['en:no-gluten'] }).gluten).toBe('certified');
    expect(dietFactsFromOff({ ...NO_TAGS, traces: ['en:gluten'], ingredientCount: 3 }).gluten).toBe(
      'traces',
    );
  });

  it('says nothing about allergens when no ingredient was read', () => {
    expect(dietFactsFromOff(NO_TAGS)).toEqual(UNKNOWN_DIET_FACTS);
  });

  it('treats a bare fruit as plant-only', () => {
    const facts = dietFactsFromOff({ ...NO_TAGS, categories: ['en:fresh-fruits', 'en:bananas'] });
    expect(facts).toEqual({ vegan: 'yes', vegetarian: 'yes', gluten: 'absent', milk: 'absent' });
  });
});

describe('assessDietFit', () => {
  it('answers each declared diet with a status and a reason', () => {
    const fit = assessDietFit(
      { vegan: 'no', vegetarian: 'yes', gluten: 'traces', milk: 'contains' },
      57.5,
      ALL_DIETS,
    );
    expect(fit.map((item) => [item.diet, item.status])).toEqual([
      ['vegan', 'incompatible'],
      ['vegetarian', 'compatible'],
      ['gluten_free', 'uncertain'],
      ['dairy_free', 'incompatible'],
      ['keto', 'incompatible'],
      ['low_carb', 'incompatible'],
    ]);
    expect(fit[0]!.label).toBe('Végétalien');
    expect(fit[3]!.reason).toBe('Contient du lait');
    expect(fit[4]!.reason).toBe('57,5 g de glucides/100 g');
  });

  it('reads carbohydrates per 100 g for keto and low carb', () => {
    const diets = { ids: ['keto', 'low_carb'], labels: ['Cétogène', 'Pauvre en glucides'] };
    expect(assessDietFit(UNKNOWN_DIET_FACTS, 3, diets).map((item) => item.status)).toEqual([
      'compatible',
      'compatible',
    ]);
    expect(assessDietFit(UNKNOWN_DIET_FACTS, 8, diets).map((item) => item.status)).toEqual([
      'uncertain',
      'compatible',
    ]);
  });

  it('skips a diet it cannot judge and answers nothing without diets', () => {
    expect(assessDietFit(UNKNOWN_DIET_FACTS, 10, { ids: ['paleo'], labels: ['Paléo'] })).toEqual(
      [],
    );
    expect(assessDietFit(UNKNOWN_DIET_FACTS, 10, { ids: [], labels: [] })).toEqual([]);
  });
});
