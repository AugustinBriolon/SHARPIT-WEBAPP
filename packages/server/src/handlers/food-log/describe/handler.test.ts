import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getCurrentAthleteId = vi.fn();
const isProAthlete = vi.fn();
const athleteHasAiProcessingConsent = vi.fn();
const checkRateLimit = vi.fn();
const describeMealFromText = vi.fn();
const resolveDescribedFoods = vi.fn();
const loadDeclaredDiet = vi.fn();
const servedProduct = vi.fn((product: object) => ({ ...product, served: true }));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({ getCurrentAthleteId }));
vi.mock('@sharpit/server/lib/access/is-pro-athlete', () => ({ isProAthlete }));
vi.mock('@sharpit/server/lib/privacy/consent-store', () => ({ athleteHasAiProcessingConsent }));
vi.mock('@sharpit/server/lib/rate-limit', () => ({
  checkRateLimit,
  rateLimiters: { foodDescribe: {} },
  rateLimitJsonResponse: (result: { retryAfterSeconds: number }) => ({
    body: { error: 'Trop de requêtes', retryAfterSeconds: result.retryAfterSeconds },
    status: 429,
  }),
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-describe', () => ({
  describeMealFromText,
  FoodDescribeEmptyError: class FoodDescribeEmptyError extends Error {},
  FoodDescribeUnavailableError: class FoodDescribeUnavailableError extends Error {},
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-describe-resolve', () => ({
  resolveDescribedFoods,
}));
vi.mock('@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs', () => ({
  loadDeclaredDiet,
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-log-service', () => ({
  servedProduct,
}));

describe('POST /api/v1/food-log/describe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentAthleteId.mockResolvedValue('ath-1');
    isProAthlete.mockResolvedValue(true);
    athleteHasAiProcessingConsent.mockResolvedValue(true);
    checkRateLimit.mockResolvedValue({ ok: true });
    loadDeclaredDiet.mockResolvedValue({ vegetarian: false, vegan: false });
  });

  it('returns 403 when the athlete is not Pro', async () => {
    isProAthlete.mockResolvedValue(false);
    const { POST } = await import('./handler');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/food-log/describe', {
        method: 'POST',
        body: JSON.stringify({ description: 'Steak frites et salade verte' }),
      }),
    );
    expect(response.status).toBe(403);
    expect(describeMealFromText).not.toHaveBeenCalled();
  });

  it('returns estimated macros when no product matched', async () => {
    const item = {
      name: 'Faux-filet',
      searchName: 'faux-filet',
      grams: 300,
      kcalPer100g: 200,
      proteinPer100g: 25,
      carbsPer100g: 0,
      fatPer100g: 10,
    };
    describeMealFromText.mockResolvedValue({ dishes: [{ name: 'Faux-filet', items: [item] }] });
    resolveDescribedFoods.mockResolvedValue([{ item, product: null, match: null }]);
    const { POST } = await import('./handler');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/food-log/describe', {
        method: 'POST',
        body: JSON.stringify({ description: 'Faux-filet 300 g avec frites' }),
      }),
    );
    expect(response.status).toBe(200);
    const served = {
      name: 'Faux-filet',
      grams: 300,
      kcal: 600,
      protein: 75,
      carbs: 0,
      fat: 30,
      per100g: { kcal: 200, protein: 25, carbs: 0, fat: 10 },
      product: null,
      match: null,
    };
    await expect(response.json()).resolves.toEqual({
      dishes: [{ name: 'Faux-filet', items: [served] }],
      items: [served],
    });
  });

  it('answers each dish with its own foods, and the same foods flat', async () => {
    const food = (name: string) => ({
      name,
      searchName: name,
      grams: 100,
      kcalPer100g: 100,
      proteinPer100g: 5,
      carbsPer100g: 10,
      fatPer100g: 4,
    });
    describeMealFromText.mockResolvedValue({
      dishes: [
        { name: 'Œuf mayonnaise', items: [food('Œuf dur'), food('Mayonnaise')] },
        { name: 'Lasagnes bolognaise', items: [food('Lasagnes')] },
        { name: 'Mousse au chocolat', items: [food('Mousse au chocolat')] },
      ],
    });
    resolveDescribedFoods.mockImplementation(async (_athleteId: string, items: object[]) =>
      items.map((item) => ({ item, product: null, match: null })),
    );
    const { POST } = await import('./handler');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/food-log/describe', {
        method: 'POST',
        body: JSON.stringify({
          description: 'Un œuf mayo en entrée, des lasagnes et une mousse au chocolat',
        }),
      }),
    );
    const body = await response.json();
    expect(body.dishes.map((dish: { name: string }) => dish.name)).toEqual([
      'Œuf mayonnaise',
      'Lasagnes bolognaise',
      'Mousse au chocolat',
    ]);
    expect(body.dishes.map((dish: { items: unknown[] }) => dish.items.length)).toEqual([2, 1, 1]);
    expect(body.items.map((item: { name: string }) => item.name)).toEqual([
      'Œuf dur',
      'Mayonnaise',
      'Lasagnes',
      'Mousse au chocolat',
    ]);
  });

  it('returns the matched product and catalog macros when resolved', async () => {
    const item = {
      name: 'brocolis',
      searchName: 'brocoli',
      grams: 200,
      kcalPer100g: 35,
      proteinPer100g: 3,
      carbsPer100g: 4,
      fatPer100g: 0.5,
    };
    const product = {
      id: 'c1',
      name: 'Brocoli, cru',
      brand: null,
      source: 'CIQUAL',
      kcalPer100g: 34,
      proteinPer100g: 2.8,
      carbsPer100g: 6.6,
      fatPer100g: 0.4,
    };
    describeMealFromText.mockResolvedValue({ dishes: [{ name: 'Brocolis', items: [item] }] });
    resolveDescribedFoods.mockResolvedValue([{ item, product, match: 'generic' }]);
    const { POST } = await import('./handler');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/food-log/describe', {
        method: 'POST',
        body: JSON.stringify({ description: 'Brocolis vapeur 200 g' }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      name: 'Brocoli, cru',
      grams: 200,
      kcal: 68,
      protein: 5.6,
      carbs: 13.2,
      fat: 0.8,
      match: 'generic',
      product: { id: 'c1', served: true },
    });
  });
});
