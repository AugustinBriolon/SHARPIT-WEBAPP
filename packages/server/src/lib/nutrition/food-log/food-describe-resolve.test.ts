import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  searchEatenFoods,
  searchOwnFoods,
  cacheGenericFoods,
  cacheSearchResults,
  searchCiqualFoods,
  searchOffProducts,
} = vi.hoisted(() => ({
  searchEatenFoods: vi.fn(),
  searchOwnFoods: vi.fn(),
  cacheGenericFoods: vi.fn(),
  cacheSearchResults: vi.fn(),
  searchCiqualFoods: vi.fn(),
  searchOffProducts: vi.fn(),
}));

vi.mock('./food-log-service', () => ({
  searchEatenFoods,
  searchOwnFoods,
  cacheGenericFoods,
  cacheSearchResults,
}));
vi.mock('./ciqual-search', () => ({ searchCiqualFoods }));
vi.mock('./open-food-facts-client', () => ({ searchOffProducts }));

import {
  isPlausibleMatch,
  resolveDescribedFoods,
  resolveDescribedName,
} from './food-describe-resolve';

function product(id: string, name: string, brand: string | null = null) {
  return {
    id,
    name,
    brand,
    source: 'CIQUAL',
    kcalPer100g: 100,
    proteinPer100g: 5,
    carbsPer100g: 10,
    fatPer100g: 2,
  };
}

describe('resolveDescribedName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchEatenFoods.mockResolvedValue([]);
    searchOwnFoods.mockResolvedValue([]);
    searchCiqualFoods.mockReturnValue([]);
    cacheGenericFoods.mockImplementation(async (foods: unknown[]) => foods);
    searchOffProducts.mockResolvedValue([]);
    cacheSearchResults.mockImplementation(async (foods: unknown[]) => foods);
  });

  it('prefers an already eaten food over Ciqual', async () => {
    searchEatenFoods.mockResolvedValue([
      { product: product('e1', 'Brocoli vapeur maison'), timesEaten: 3, lastGrams: 120 },
    ]);
    searchCiqualFoods.mockReturnValue([product('c1', 'Brocoli, cru')]);

    await expect(resolveDescribedName('ath-1', 'brocolis')).resolves.toEqual({
      product: expect.objectContaining({ id: 'e1' }),
      match: 'eaten',
    });
    expect(searchOffProducts).not.toHaveBeenCalled();
  });

  it('uses an own food when nothing was eaten under that name', async () => {
    searchOwnFoods.mockResolvedValue([product('o1', 'Pain turc maison', null)]);

    await expect(resolveDescribedName('ath-1', 'pain turc')).resolves.toEqual({
      product: expect.objectContaining({ id: 'o1' }),
      match: 'own',
    });
  });

  it('falls back to Ciqual for a generic name', async () => {
    searchCiqualFoods.mockReturnValue([
      product('c1', 'Pommes de terre frites, à l’huile, salées'),
      product('c2', 'Frites de pommes de terre'),
    ]);
    cacheGenericFoods.mockResolvedValue([
      product('c2', 'Frites de pommes de terre'),
      product('c1', 'Pommes de terre frites, à l’huile, salées'),
    ]);

    await expect(resolveDescribedName('ath-1', 'frites')).resolves.toEqual({
      product: expect.objectContaining({ id: 'c2' }),
      match: 'generic',
    });
  });

  it('uses Open Food Facts only when Ciqual has no confident match', async () => {
    searchOffProducts.mockResolvedValue([product('p1', 'Skyr nature Danone', 'Danone')]);
    cacheSearchResults.mockResolvedValue([product('p1', 'Skyr nature Danone', 'Danone')]);

    await expect(resolveDescribedName('ath-1', 'skyr danone')).resolves.toEqual({
      product: expect.objectContaining({ id: 'p1' }),
      match: 'product',
    });
  });

  it('returns null when no source is confident enough', async () => {
    searchCiqualFoods.mockReturnValue([product('c1', 'Sauce pour pâtes à la viande')]);
    cacheGenericFoods.mockResolvedValue([product('c1', 'Sauce pour pâtes à la viande')]);

    await expect(resolveDescribedName('ath-1', 'plat mystère du chef')).resolves.toBeNull();
  });
});

describe('resolveDescribedFoods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchEatenFoods.mockResolvedValue([]);
    searchOwnFoods.mockResolvedValue([]);
    searchCiqualFoods.mockReturnValue([]);
    cacheGenericFoods.mockResolvedValue([]);
    searchOffProducts.mockResolvedValue([]);
    cacheSearchResults.mockResolvedValue([]);
  });

  const item = {
    name: 'Dish of the day',
    searchName: 'plat du jour',
    grams: 400,
    kcalPer100g: 150,
    proteinPer100g: 10,
    carbsPer100g: 20,
    fatPer100g: 5,
  };

  it('keeps the LLM item when nothing matches', async () => {
    await expect(resolveDescribedFoods('ath-1', [item])).resolves.toEqual([
      { item, product: null, match: null },
    ]);
  });

  it('searches the catalogs with the French table name, not the name shown', async () => {
    await resolveDescribedFoods('ath-1', [item]);
    expect(searchCiqualFoods).toHaveBeenCalledWith('plat du jour', 5);
    expect(searchOwnFoods).toHaveBeenCalledWith('ath-1', 'plat du jour');
  });

  it('keeps the estimate when the only match is another food under the same word', async () => {
    const rice = { ...item, searchName: 'riz', kcalPer100g: 135 };
    const raw = { ...product('c1', 'Riz blanc, cru'), kcalPer100g: 352 };
    searchCiqualFoods.mockReturnValue([raw]);
    cacheGenericFoods.mockResolvedValue([raw]);

    await expect(resolveDescribedFoods('ath-1', [rice])).resolves.toEqual([
      { item: rice, product: null, match: null },
    ]);
  });

  it('links the food of the same energy past one that is not', async () => {
    const rice = { ...item, searchName: 'riz', kcalPer100g: 135 };
    const raw = { ...product('c1', 'Riz blanc, cru'), kcalPer100g: 352 };
    const cooked = { ...product('c2', 'Riz blanc, cuit, non salé'), kcalPer100g: 145 };
    searchCiqualFoods.mockReturnValue([raw, cooked]);
    cacheGenericFoods.mockResolvedValue([raw, cooked]);

    const [resolved] = await resolveDescribedFoods('ath-1', [rice]);
    expect(resolved).toMatchObject({ product: { id: 'c2' }, match: 'generic' });
  });
});

describe('isPlausibleMatch', () => {
  it('accepts two readings of the same food', () => {
    expect(isPlausibleMatch(150, 134)).toBe(true);
    expect(isPlausibleMatch(250, 303)).toBe(true);
  });

  it('accepts light foods whatever their ratio', () => {
    expect(isPlausibleMatch(25, 12)).toBe(true);
  });

  it('refuses a food of another energy', () => {
    expect(isPlausibleMatch(135, 352)).toBe(false);
    expect(isPlausibleMatch(700, 250)).toBe(false);
  });
});
