import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FoodLogSection, type FoodLogSectionProps } from './food-log-section';
import { FoodPortionStep } from './food-portion-step';
import { FoodSearchResults } from './food-search-results';
import { FoodRecipeStep, ingredientHits } from './food-recipe-step';
import { FoodSavedMealsStep } from './food-saved-meals-step';
import { NutritionTargetsForm } from './nutrition-targets-dialog';
import {
  groupEntriesByMeal,
  type FoodLogEntryPayload,
  type FoodProductPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';
import { OPEN_FOOD_FACTS_ATTRIBUTION } from '@sharpit/app/lib/nutrition/food-log/open-food-facts';

const noop = () => {};
const ACTIONS = { onAdd: noop, onEdit: noop, onDelete: noop };

const SKYR: FoodProductPayload = {
  id: 'skyr',
  source: 'OFF',
  name: 'Skyr nature',
  brand: 'Isey',
  kcalPer100g: 62,
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0.2,
  servingGrams: 150,
  servingLabel: '1 pot',
};

const ENTRY: FoodLogEntryPayload = {
  id: 'e1',
  date: '2026-10-01T00:00:00.000Z',
  meal: 'BREAKFAST',
  productId: 'skyr',
  name: 'Skyr nature',
  brand: 'Isey',
  grams: 150,
  kcal: 93,
  protein: 16.5,
  carbs: 6,
  fat: 0.3,
};

function section(props: Partial<FoodLogSectionProps>) {
  return renderToStaticMarkup(
    createElement(FoodLogSection, {
      display: 'log',
      groups: groupEntriesByMeal([]),
      importedMeals: [],
      actions: ACTIONS,
      onTargets: noop,
      onAddFirst: noop,
      ...props,
    }),
  );
}

describe('FoodLogSection', () => {
  it('invites the first meal on an empty day, with no provider to connect', () => {
    const html = section({ display: 'empty' });

    expect(html).toContain('Rien de noté pour cette journée');
    expect(html).toContain('Ajouter un premier repas');
    expect(html).toContain('Objectifs');
    expect(html).not.toContain('Connecte');
    expect(html).not.toContain('MyFitnessPal');
  });

  it('offers to copy yesterday on an empty day, only when it can', () => {
    expect(section({ display: 'empty' })).not.toContain('Copier hier');
    expect(section({ display: 'empty', onCopyDay: noop })).toContain('Copier hier');
  });

  it('gives each meal its menu once copy and save are wired', () => {
    const html = section({
      groups: groupEntriesByMeal([ENTRY]),
      actions: { ...ACTIONS, onCopyYesterday: noop, onSaveMeal: noop },
    });
    expect(html).toContain('aria-label="Plus d’actions : Petit-déjeuner"');
    expect(section({ groups: groupEntriesByMeal([ENTRY]) })).not.toContain('Plus d’actions');
  });

  it('lists each meal with its entries, edit and delete, and an add action', () => {
    const html = section({ groups: groupEntriesByMeal([ENTRY]) });

    expect(html).toContain('Petit-déjeuner');
    expect(html).toContain('Déjeuner');
    expect(html).toContain('Collations');
    expect(html).toContain('Skyr nature');
    expect(html).toContain('150 g');
    expect(html).toContain('93 kcal');
    expect(html).toContain('aria-label="Modifier Skyr nature"');
    expect(html).toContain('aria-label="Supprimer Skyr nature"');
    expect(html).toContain('aria-label="Ajouter un aliment : Dîner"');
  });

  it('offers the MyFitnessPal sync only when it is linked', () => {
    expect(section({})).not.toContain('MyFitnessPal');
    expect(section({ mfpSync: { syncing: false, onSync: noop } })).toContain('MyFitnessPal');
  });

  it('reads a day only MyFitnessPal filled, and still lets the athlete add', () => {
    const imported = [
      {
        name: 'lunch',
        label: 'Déjeuner',
        calories: 700,
        protein: 30,
        carbs: 80,
        fat: 20,
        entries: [],
      },
    ];
    const html = section({ display: 'imported', importedMeals: imported });

    expect(html).toContain('Importé de MyFitnessPal');
    expect(html).toContain('700 kcal');
    expect(html).toContain('Ajouter un aliment');
  });

  it('never claims an empty day when the log could not be read', () => {
    const html = section({ display: 'empty', unavailable: true });

    expect(html).toContain('indisponible');
    expect(html).not.toContain('Rien de noté');
  });
});

describe('FoodSearchResults', () => {
  it('lists own foods first, then Open Food Facts with its attribution', () => {
    const own = { ...SKYR, id: 'mine', source: 'CUSTOM' as const, name: 'Granola maison' };
    const html = renderToStaticMarkup(
      createElement(FoodSearchResults, {
        listing: 'results',
        results: { own: [own], products: [SKYR], offUnavailable: false },
        recent: [],
        error: null,
        onPick: noop,
      }),
    );

    expect(html.indexOf('Granola maison')).toBeLessThan(html.indexOf('Skyr nature'));
    expect(html).toContain(OPEN_FOOD_FACTS_ATTRIBUTION);
    expect(html).toContain('62 kcal / 100 g');
  });

  it('lists recent foods before a search, without the attribution of an empty OFF list', () => {
    const html = renderToStaticMarkup(
      createElement(FoodSearchResults, {
        listing: 'recent',
        results: undefined,
        recent: [{ product: { ...SKYR, source: 'CUSTOM' }, lastGrams: 150 }],
        error: null,
        onPick: noop,
      }),
    );

    expect(html).toContain('Récents');
    expect(html).toContain('Skyr nature');
  });

  it('says when Open Food Facts is down', () => {
    const html = renderToStaticMarkup(
      createElement(FoodSearchResults, {
        listing: 'results',
        results: { own: [], products: [], offUnavailable: true },
        recent: [],
        error: null,
        onPick: noop,
      }),
    );

    expect(html).toContain('Open Food Facts ne répond pas');
  });
});

const HEALTH = {
  score: 31,
  scoreVersion: 2,
  grade: 'mediocre',
  coverage: 'full',
  nutriScore: 'd',
  nutriScoreEstimated: false,
  nova: 4,
  nutrientFlags: { sugars: 'high', salt: 'high', saturatedFat: 'low' },
  additives: [{ code: 'E250', name: 'Nitrite de sodium', risk: 'high' }],
  additivesKnown: 'list',
  additiveCount: 1,
  highlights: [
    { key: 'salt_high', tone: 'negative', label: 'Trop salé', detail: '2,1 g/100 g' },
    { key: 'protein_rich', tone: 'positive', label: 'Riche en protéines', detail: '21 g/100 g' },
  ],
  dietFacts: { vegan: 'no', vegetarian: 'no', gluten: 'absent', milk: 'unknown' },
  detail: 'full',
  dietFit: [
    {
      diet: 'vegetarian',
      label: 'Végétarien',
      status: 'incompatible',
      reason: 'Contient des ingrédients non végétariens',
    },
  ],
} as NonNullable<FoodProductPayload['health']>;

describe('Sharpit score', () => {
  it('lists generic foods with Ciqual credited, each row with its score and broken diets', () => {
    const banana = {
      ...SKYR,
      id: 'banana',
      source: 'CIQUAL' as const,
      brand: null,
      name: 'Banane, pulpe, crue',
      health: { ...HEALTH, score: 91, grade: 'excellent' as const, dietFit: [] },
    };
    const html = renderToStaticMarkup(
      createElement(FoodSearchResults, {
        listing: 'results',
        results: {
          own: [],
          generic: [banana],
          products: [{ ...SKYR, health: HEALTH }],
          offUnavailable: false,
        },
        recent: [],
        error: null,
        onPick: noop,
      }),
    );

    expect(html.indexOf('Aliments de base')).toBeLessThan(html.indexOf('Produits'));
    expect(html).toContain('Aliment de base · 62 kcal / 100 g');
    expect(html).toContain('Table Ciqual 2020, Anses (Licence Ouverte)');
    expect(html).toContain('Score Sharpit 91, Excellent');
    expect(html).toContain('Hors régime : Végétarien');
  });

  it('reads the score on the portion: summary, diets, reasons, additives and method', () => {
    const html = renderToStaticMarkup(
      createElement(FoodPortionStep, {
        picked: { product: { ...SKYR, health: HEALTH }, lastGrams: null },
        grams: '100',
        meal: 'LUNCH',
        error: null,
        onGrams: noop,
        onMeal: noop,
        onSubmit: noop,
      }),
    );

    for (const text of [
      'Médiocre',
      '1 point à surveiller',
      'Nutri-Score D · NOVA 4',
      'Mon régime',
      'Trop salé',
      '2,1 g/100 g',
      'Points forts',
      '1 additif',
      'Comment est calculé le score ?',
      'Indicateur Sharpit, pas un avis médical.',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('says the additives are being read while a search hit completes', () => {
    const html = renderToStaticMarkup(
      createElement(FoodPortionStep, {
        picked: {
          product: { ...SKYR, health: { ...HEALTH, additivesKnown: 'count', additiveCount: 2 } },
          lastGrams: null,
        },
        grams: '100',
        meal: 'LUNCH',
        error: null,
        completing: true,
        onGrams: noop,
        onMeal: noop,
        onSubmit: noop,
      }),
    );

    expect(html).toContain('2 additifs, lecture du détail…');
  });

  it('shows no score block for a food without one', () => {
    const html = renderToStaticMarkup(
      createElement(FoodPortionStep, {
        picked: { product: { ...SKYR, health: { ...HEALTH, coverage: 'none' } }, lastGrams: null },
        grams: '100',
        meal: 'LUNCH',
        error: null,
        onGrams: noop,
        onMeal: noop,
        onSubmit: noop,
      }),
    );

    expect(html).not.toContain('Score Sharpit');
  });
});

describe('FoodPortionStep', () => {
  it('offers the portion presets, previews the nutrients and credits Open Food Facts', () => {
    const html = renderToStaticMarkup(
      createElement(FoodPortionStep, {
        picked: { product: SKYR, lastGrams: 200 },
        grams: '150',
        meal: 'BREAKFAST',
        error: null,
        onGrams: noop,
        onMeal: noop,
        onSubmit: noop,
      }),
    );

    expect(html).toContain('100 g');
    expect(html).toContain('1 pot');
    expect(html).toContain('Dernière fois · 200 g');
    expect(html).toContain('93 kcal');
    expect(html).toContain(OPEN_FOOD_FACTS_ATTRIBUTION);
    expect(html).toContain('Ajouter');
  });
});

const TARGETS = {
  mode: 'GRAMS' as const,
  kcal: 2600,
  proteinG: 150,
  carbsG: null,
  fatG: 70,
  proteinPct: null,
  carbsPct: null,
  fatPct: null,
};

function targetsForm(editor: Partial<Parameters<typeof NutritionTargetsForm>[0]['editor']>) {
  return renderToStaticMarkup(
    createElement(NutritionTargetsForm, {
      targets: TARGETS,
      editor: {
        mode: 'GRAMS',
        split: { kcal: '2600', proteinPct: '25', carbsPct: '50', fatPct: '20' },
        reading: {
          total: 95,
          balanced: false,
          grams: { proteinPct: 163, carbsPct: 325, fatPct: 58 },
        },
        error: null,
        canSave: true,
        setMode: noop,
        patchSplit: noop,
        save: noop,
        ...editor,
      },
    }),
  );
}

describe('NutritionTargetsForm', () => {
  it('has one field per target in grams, opened on the saved values', () => {
    const html = targetsForm({});

    expect(html).toContain('Grammes');
    expect(html).toContain('name="kcal"');
    expect(html).toContain('value="2600"');
    expect(html).toContain('value="150"');
    expect(html).toContain('name="carbsG"');
    expect(html).toContain('Enregistrer');
  });

  it('in percent, shows the grams each share buys and a total that must reach 100', () => {
    const html = targetsForm({ mode: 'PERCENT', canSave: false });

    expect(html).toContain('name="proteinPct"');
    expect(html).toContain('163 g');
    expect(html).toContain('Total : 95 %');
    expect(html).toContain('il faut 100 %');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});

describe('FoodSavedMealsStep', () => {
  const SAVED = {
    id: 'm1',
    name: 'Petit-déj du dimanche',
    items: [
      {
        productId: 'skyr',
        name: 'Skyr nature',
        brand: 'Isey',
        grams: 150,
        kcal: 93,
        protein: 16.5,
        carbs: 6,
        fat: 0.3,
        fiber: null,
        sugar: null,
      },
    ],
    kcal: 93,
    protein: 16.5,
    carbs: 6,
    fat: 0.3,
    health: null,
    updatedAt: '2026-10-05T08:00:00.000Z',
  };

  it('lists each saved meal with its foods and energy, and a delete', () => {
    const html = renderToStaticMarkup(
      createElement(FoodSavedMealsStep, {
        meals: [SAVED],
        loading: false,
        error: null,
        onLog: noop,
        onDelete: noop,
      }),
    );
    expect(html).toContain('Petit-déj du dimanche');
    expect(html).toContain('1 aliment · 93 kcal');
    expect(html).toContain('aria-label="Supprimer Petit-déj du dimanche"');
  });

  it('says where a saved meal comes from when there is none', () => {
    const html = renderToStaticMarkup(
      createElement(FoodSavedMealsStep, {
        meals: [],
        loading: false,
        error: null,
        onLog: noop,
        onDelete: noop,
      }),
    );
    expect(html).toContain('Enregistrer ce repas');
  });
});

describe('FoodRecipeStep', () => {
  it('opens an edited recipe on its ingredients and its live label', () => {
    const html = renderToStaticMarkup(
      createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        createElement(FoodRecipeStep, {
          recipe: {
            ...SKYR,
            id: 'r1',
            source: 'CUSTOM',
            name: 'Bol skyr',
            recipe: {
              ingredients: [{ ...SKYR, productId: 'skyr', grams: 200 }],
              cookedGrams: null,
              servings: 2,
              totalGrams: 200,
            },
          },
          pending: false,
          error: null,
          onSubmit: noop,
        }),
      ),
    );
    expect(html).toContain('value="Bol skyr"');
    expect(html).toContain('aria-label="Grammes de Skyr nature"');
    expect(html).toContain('62 kcal');
    expect(html).toContain('1 part · 100 g · 62 kcal');
    expect(html).toContain('Enregistrer la recette');
  });

  it('never offers a recipe as its own ingredient', () => {
    const hits = ingredientHits(
      { own: [{ ...SKYR, id: 'r1' }], products: [SKYR], offUnavailable: false },
      'r1',
    );
    expect(hits.map((product) => product.id)).toEqual(['skyr']);
  });
});
