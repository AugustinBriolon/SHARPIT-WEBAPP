import { describe, expect, it } from 'vitest';
import {
  buildCustomFood,
  buildEntryUpdate,
  buildPortionEntry,
  buildQuickEntry,
  buildCustomFoodUpdate,
  buildTargets,
  parseDecimal,
  portionPreview,
  readTargetSplit,
  targetFieldValue,
  targetSplitDraft,
} from './food-log-forms';
import type {
  FoodLogEntryPayload,
  FoodProductPayload,
} from '@sharpit/app/lib/nutrition/food-log/food-log-day';

const SKYR: FoodProductPayload = {
  id: 'skyr',
  source: 'OFF',
  name: 'Skyr',
  brand: 'Isey',
  kcalPer100g: 62,
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0.2,
};
const CONTEXT = { meal: 'BREAKFAST' as const, trainingDayId: '2026-10-01' };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(fields).forEach(([name, value]) => data.set(name, value));
  return data;
}

describe('parseDecimal', () => {
  it('reads a comma as a decimal point and a blank as unset', () => {
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('  ')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal('abc')).toBeNaN();
  });
});

describe('portionPreview', () => {
  it('follows the typed weight, and waits for one that reads as a weight', () => {
    expect(portionPreview(SKYR, '150')).toMatchObject({ kcal: 93, protein: 16.5 });
    expect(portionPreview(SKYR, '')).toBeNull();
    expect(portionPreview(SKYR, '0')).toBeNull();
  });
});

describe('buildPortionEntry', () => {
  it('logs the product at the weight, with the nutrients the row shows meanwhile', () => {
    const result = buildPortionEntry(SKYR, '150', CONTEXT);
    expect(result).toEqual({
      ok: true,
      value: {
        input: { ...CONTEXT, grams: 150, productId: 'skyr' },
        preview: {
          name: 'Skyr',
          brand: 'Isey',
          kcal: 93,
          protein: 16.5,
          carbs: 6,
          fat: 0.3,
          fiber: null,
          sugar: null,
          health: null,
        },
      },
    });
  });

  it('refuses a blank weight rather than logging zero', () => {
    expect(buildPortionEntry(SKYR, '', CONTEXT)).toEqual({
      ok: false,
      message: 'Vérifie le champ « Quantité ».',
    });
  });
});

describe('buildQuickEntry', () => {
  it('needs a name and calories; macros default to zero', () => {
    const result = buildQuickEntry(form({ name: 'Pizza', kcal: '650', grams: '300' }), CONTEXT);
    expect(result.ok && result.value.input.quick).toEqual({
      name: 'Pizza',
      kcal: 650,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(buildQuickEntry(form({ name: 'Pizza', grams: '300' }), CONTEXT)).toEqual({
      ok: false,
      message: 'Vérifie le champ « Calories ».',
    });
  });
});

describe('buildEntryUpdate', () => {
  const entry = { id: 'e1', grams: 150, meal: 'LUNCH' } as FoodLogEntryPayload;

  it('sends only what changed', () => {
    expect(buildEntryUpdate(entry, { grams: '200', meal: 'LUNCH' })).toEqual({
      ok: true,
      value: { id: 'e1', grams: 200 },
    });
    expect(buildEntryUpdate(entry, { grams: '150', meal: 'DINNER' })).toEqual({
      ok: true,
      value: { id: 'e1', meal: 'DINNER' },
    });
  });

  it('sends nothing when nothing changed, and refuses a blank weight', () => {
    expect(buildEntryUpdate(entry, { grams: '150', meal: 'LUNCH' })).toEqual({
      ok: true,
      value: null,
    });
    expect(buildEntryUpdate(entry, { grams: '', meal: 'LUNCH' }).ok).toBe(false);
  });
});

describe('buildCustomFood', () => {
  it('reads a food per 100 g, the brand, serving and label details optional', () => {
    const result = buildCustomFood(
      form({
        name: 'Granola maison',
        brand: '',
        kcalPer100g: '450',
        proteinPer100g: '12',
        carbsPer100g: '55,5',
        fatPer100g: '18',
        saltPer100g: '0,4',
        servingGrams: '',
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Granola maison',
        brand: null,
        kcalPer100g: 450,
        proteinPer100g: 12,
        carbsPer100g: 55.5,
        fatPer100g: 18,
        fiberPer100g: null,
        sugarPer100g: null,
        saltPer100g: 0.4,
        saturatedFatPer100g: null,
        servingGrams: null,
      },
    });
  });
});

describe('buildTargets', () => {
  it('clears a blank target and checks the others', () => {
    expect(buildTargets(form({ kcal: '2600', proteinG: '150', carbsG: '', fatG: '70' }))).toEqual({
      ok: true,
      value: { mode: 'GRAMS', kcal: 2600, proteinG: 150, carbsG: null, fatG: 70 },
    });
    expect(buildTargets(form({ kcal: '200', proteinG: '', carbsG: '', fatG: '' }))).toEqual({
      ok: false,
      message: 'Vérifie le champ « Calories ».',
    });
  });

  it('opens each field on the saved target, blank when unset', () => {
    expect(targetFieldValue(2600)).toBe('2600');
    expect(targetFieldValue(null)).toBe('');
  });
});

describe('targets in percent', () => {
  it('sends a split of the calories once it adds up to 100', () => {
    const split = { kcal: '2600', proteinPct: '25', carbsPct: '50', fatPct: '25' };
    expect(buildTargets(form(split), 'PERCENT')).toEqual({
      ok: true,
      value: { mode: 'PERCENT', kcal: 2600, proteinPct: 25, carbsPct: 50, fatPct: 25 },
    });
    expect(buildTargets(form({ ...split, fatPct: '20' }), 'PERCENT')).toEqual({
      ok: false,
      message: 'La répartition fait 95 %, elle doit faire 100 %.',
    });
  });

  it('reads the total and the grams each share buys as it is typed', () => {
    expect(readTargetSplit({ kcal: '2600', proteinPct: '25', carbsPct: '50', fatPct: '' })).toEqual(
      {
        total: 75,
        balanced: false,
        grams: { proteinPct: 163, carbsPct: 325, fatPct: null },
      },
    );
  });

  it('opens on the saved split, else on the grams read as shares', () => {
    const grams = {
      mode: 'GRAMS' as const,
      kcal: 2600,
      proteinG: 163,
      carbsG: 325,
      fatG: 72,
      proteinPct: null,
      carbsPct: null,
      fatPct: null,
    };
    expect(targetSplitDraft(grams)).toEqual({
      kcal: '2600',
      proteinPct: '25',
      carbsPct: '50',
      fatPct: '25',
    });
    expect(targetSplitDraft(null)).toEqual({ kcal: '', proteinPct: '', carbsPct: '', fatPct: '' });
  });
});

describe('buildCustomFoodUpdate', () => {
  it('sends the edited food, a blank serving or label detail clearing it', () => {
    expect(
      buildCustomFoodUpdate(
        form({
          name: 'Porridge',
          brand: '',
          kcalPer100g: '140',
          proteinPer100g: '5',
          carbsPer100g: '22',
          fatPer100g: '3,2',
          servingGrams: '',
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        name: 'Porridge',
        brand: null,
        kcalPer100g: 140,
        proteinPer100g: 5,
        carbsPer100g: 22,
        fatPer100g: 3.2,
        fiberPer100g: null,
        sugarPer100g: null,
        saltPer100g: null,
        saturatedFatPer100g: null,
        servingGrams: null,
      },
    });
  });
});
