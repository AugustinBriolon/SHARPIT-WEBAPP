import { describe, expect, it } from 'vitest';
import { isBarcode, mapOffProduct } from './open-food-facts';

describe('mapOffProduct', () => {
  it('maps a full product, French name first and the first brand only', () => {
    expect(
      mapOffProduct({
        code: '3017620422003',
        product_name: 'Nutella',
        product_name_fr: 'Pâte à tartiner',
        brands: 'Nutella, Ferrero',
        nutriments: {
          'energy-kcal_100g': 539,
          proteins_100g: 6.3,
          carbohydrates_100g: 57.5,
          fat_100g: 30.9,
          sugars_100g: 56.3,
        },
        serving_quantity: '15',
        serving_size: '15 g',
      }),
    ).toEqual({
      barcode: '3017620422003',
      name: 'Pâte à tartiner',
      brand: 'Nutella',
      kcalPer100g: 539,
      proteinPer100g: 6.3,
      carbsPer100g: 57.5,
      fatPer100g: 30.9,
      fiberPer100g: null,
      sugarPer100g: 56.3,
      saltPer100g: null,
      saturatedFatPer100g: null,
      servingGrams: 15,
      servingLabel: '15 g',
      health: expect.objectContaining({
        coverage: 'full',
        nutriScore: null,
        score: expect.any(Number),
      }),
    });
  });

  it('builds the Sharpit health score from Nutri-Score, NOVA, levels and additives', () => {
    const food = mapOffProduct({
      code: '3017620422003',
      product_name: 'Nutella',
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
        sugars_100g: 56.3,
        salt_100g: 0.107,
        'saturated-fat_100g': 10.6,
      },
      nutriscore_grade: 'e',
      nova_group: 4,
      nutrient_levels: {
        sugars: 'high',
        salt: 'low',
        'saturated-fat': 'high',
      },
      additives_tags: ['en:e322', 'en:e471'],
    });
    expect(food?.saltPer100g).toBe(0.107);
    expect(food?.saturatedFatPer100g).toBe(10.6);
    expect(food?.health.nutriScore).toBe('e');
    expect(food?.health.nova).toBe(4);
    expect(food?.health.nutrientFlags.sugars).toBe('high');
    expect(food?.health.coverage).toBe('full');
    expect(food?.health.score).toBeLessThan(40);
  });

  it('keeps a search hit as a summary: additives counted, diets read', () => {
    const food = mapOffProduct(
      {
        code: '3017620422003',
        product_name: 'Nutella',
        nutriments: {
          'energy-kcal_100g': 539,
          proteins_100g: 6.3,
          carbohydrates_100g: 57.5,
          fat_100g: 30.9,
        },
        nutriscore_grade: 'e',
        nutriscore_score: '31',
        additives_n: 2,
        ingredients_n: 9,
        ingredients_analysis_tags: ['en:non-vegan', 'en:vegetarian'],
        allergens_tags: ['en:milk', 'en:nuts'],
      },
      'summary',
    );
    expect(food?.health).toMatchObject({
      detail: 'summary',
      additivesKnown: 'count',
      additiveCount: 2,
      nutriScore: 'e',
      dietFacts: { vegan: 'no', vegetarian: 'yes', gluten: 'absent', milk: 'contains' },
    });
  });

  it('treats a product without readable ingredients as additives unknown', () => {
    const food = mapOffProduct({
      code: '2000000000001',
      product_name: 'Bananes',
      nutriments: {
        'energy-kcal_100g': 89,
        proteins_100g: 1.1,
        carbohydrates_100g: 20,
        fat_100g: 0.3,
      },
      additives_tags: [],
      categories_tags: ['en:fresh-fruits'],
    });
    expect(food?.health.additivesKnown).toBe('unknown');
    expect(food?.health.dietFacts.vegan).toBe('yes');
  });

  it('counts an additive and its sub-variant once', () => {
    const food = mapOffProduct({
      code: '3017620422003',
      product_name: 'Nutella',
      nutriments: {
        'energy-kcal_100g': 539,
        proteins_100g: 6.3,
        carbohydrates_100g: 57.5,
        fat_100g: 30.9,
      },
      additives_tags: ['en:e322', 'en:e322i'],
      ingredients_n: 9,
    });
    expect(food?.health.additives.map((item) => item.code)).toEqual(['E322']);
  });

  it('reads energy from kJ when kcal is missing', () => {
    const food = mapOffProduct({
      code: '12345678',
      product_name: 'Pain',
      brands: ['Boulanger'],
      nutriments: { 'energy-kj_100g': 1046, proteins_100g: 9, carbohydrates_100g: 49, fat_100g: 3 },
    });
    expect(food?.kcalPer100g).toBe(250);
    expect(food?.brand).toBe('Boulanger');
  });

  it('refuses a half-filled product rather than log it as zero', () => {
    expect(mapOffProduct({ code: '12345678', product_name: 'Mystère', nutriments: {} })).toBeNull();
    expect(
      mapOffProduct({
        code: '12345678',
        nutriments: {
          'energy-kcal_100g': 100,
          proteins_100g: 1,
          carbohydrates_100g: 1,
          fat_100g: 1,
        },
      }),
    ).toBeNull();
  });
});

describe('isBarcode', () => {
  it('accepts the lengths a scanner reads', () => {
    expect(isBarcode('12345678')).toBe(true);
    expect(isBarcode('3017620422003')).toBe(true);
    expect(isBarcode('skyr')).toBe(false);
    expect(isBarcode('123456789')).toBe(false);
  });
});
