import { describe, expect, it } from 'vitest';
import { foodHighlights, type HighlightInput } from './food-health-highlights';

const neutral: HighlightInput = {
  kcal: 200,
  protein: 2,
  fiber: 1,
  sugars: 8,
  salt: 0.8,
  saturatedFat: 3,
  levels: { sugars: 'moderate', salt: 'moderate', saturatedFat: 'moderate' },
  nova: 3,
  additives: [{ code: 'E330', name: 'Acide citrique', risk: 'none' }],
  isSportsNutrition: false,
};

function keys(input: HighlightInput): string[] {
  return foodHighlights(input).map((item) => item.key);
}

describe('foodHighlights', () => {
  it('says nothing about an unremarkable food', () => {
    expect(foodHighlights(neutral)).toEqual([]);
  });

  it('names what to watch, worst first, with the amount', () => {
    const items = foodHighlights({
      ...neutral,
      kcal: 520,
      salt: 2.1,
      levels: { sugars: 'moderate', salt: 'high', saturatedFat: 'moderate' },
      nova: 4,
      additives: [{ code: 'E250', name: 'Nitrite de sodium', risk: 'high' }],
    });
    expect(items.map((item) => item.key)).toEqual([
      'additives_high',
      'salt_high',
      'ultra_processed',
      'energy_dense',
    ]);
    expect(items[1]).toEqual({
      key: 'salt_high',
      tone: 'negative',
      label: 'Trop salé',
      detail: '2,1 g/100 g',
    });
    expect(items[0]!.detail).toBe('Nitrite de sodium');
  });

  it('applies the EU protein and fibre claims', () => {
    expect(keys({ ...neutral, kcal: 100, protein: 6 })).toContain('protein_rich');
    expect(keys({ ...neutral, kcal: 200, protein: 7 })).toContain('protein_source');
    expect(keys({ ...neutral, fiber: 6.5 })).toContain('fiber_rich');
    expect(keys({ ...neutral, fiber: 3.2 })).toContain('fiber_source');
  });

  it('praises a raw, additive-free, low-sugar food', () => {
    expect(
      keys({
        ...neutral,
        levels: { sugars: 'low', salt: 'low', saturatedFat: 'low' },
        nova: 1,
        additives: [],
      }),
    ).toEqual(['sugars_low', 'salt_low', 'saturatedFat_low', 'unprocessed', 'additive_free']);
  });

  it('does not call an unknown additive list additive-free', () => {
    expect(keys({ ...neutral, additives: null })).not.toContain('additive_free');
  });

  it('puts the effort note first for sports nutrition', () => {
    expect(keys({ ...neutral, isSportsNutrition: true })[0]).toBe('sports_nutrition');
  });
});
