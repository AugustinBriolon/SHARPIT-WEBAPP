import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
vi.mock('@sharpit/server/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitJsonResponse: vi.fn(() => ({ body: { error: 'Trop de requêtes' }, status: 429 })),
  rateLimiters: { foodSearch: {}, nutritionImport: {} },
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/open-food-facts-client', () => ({
  searchOffProducts: vi.fn(),
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/ciqual-search', () => ({
  searchCiqualFoods: vi.fn(() => [{ ciqualCode: 13005 }]),
}));
vi.mock('@sharpit/server/lib/nutrition/analysis/nutrition-analysis-inputs', () => ({
  loadDeclaredDiet: vi.fn().mockResolvedValue({ ids: ['vegan'], labels: ['Végétalien'] }),
}));
vi.mock('@sharpit/server/lib/nutrition/import/mfp-export-import', () => ({
  importMfpExport: vi.fn(),
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-log-service', () => {
  class FoodLogNotFoundError extends Error {}
  return {
    FoodLogNotFoundError,
    addFoodLogEntry: vi.fn(),
    cacheGenericFoods: vi.fn(async () => [{ id: 'banana' }]),
    cacheSearchResults: vi.fn(),
    createCustomFood: vi.fn(),
    deleteCustomFood: vi.fn(),
    deleteFoodLogEntry: vi.fn(),
    findProductByBarcode: vi.fn(),
    getNutritionTargets: vi.fn(),
    listFoodLogDay: vi.fn(),
    listOwnFoods: vi.fn(),
    recentFoods: vi.fn(),
    searchEatenFoods: vi.fn(async () => []),
    searchOwnFoods: vi.fn(),
    servedProduct: vi.fn((product: object) => ({ ...product, served: true })),
    setNutritionTargets: vi.fn(),
    updateCustomFood: vi.fn(),
    updateFoodLogEntry: vi.fn(),
  };
});

const BASE = 'https://api.sharpit.app/api/food-log';

function json(method: string, path: string, body: unknown) {
  return new NextRequest(`${BASE}${path}`, { method, body: JSON.stringify(body) });
}

const service = () => import('@sharpit/server/lib/nutrition/food-log/food-log-service');

describe('/api/food-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('reads a day with its targets and recent foods', async () => {
    const { GET } = await import('./handler');
    const log = await service();
    vi.mocked(log.listFoodLogDay).mockResolvedValue([]);
    vi.mocked(log.getNutritionTargets).mockResolvedValue({ kcal: 2600 } as never);
    vi.mocked(log.recentFoods).mockResolvedValue([]);

    const response = await GET(new NextRequest(`${BASE}?trainingDayId=2026-10-01`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      trainingDayId: '2026-10-01',
      entries: [],
      targets: { kcal: 2600 },
      recent: [],
    });
    expect(log.listFoodLogDay).toHaveBeenCalledWith('athlete-1', '2026-10-01', {
      ids: ['vegan'],
      labels: ['Végétalien'],
    });
  });

  it('asks for the day', async () => {
    const { GET } = await import('./handler');
    expect((await GET(new NextRequest(BASE))).status).toBe(400);
  });

  it('logs a valid entry and refuses an invalid one', async () => {
    const { POST } = await import('./handler');
    const log = await service();
    vi.mocked(log.addFoodLogEntry).mockResolvedValue({ id: 'e1' } as never);

    const created = await POST(
      json('POST', '', { trainingDayId: '2026-10-01', meal: 'LUNCH', grams: 120, productId: 'p1' }),
    );
    expect(created.status).toBe(201);

    const refused = await POST(json('POST', '', { trainingDayId: '2026-10-01', meal: 'LUNCH' }));
    expect(refused.status).toBe(400);
    expect(log.addFoodLogEntry).toHaveBeenCalledTimes(1);
  });

  it("answers 404 for a food or entry that is not the athlete's", async () => {
    const { POST } = await import('./handler');
    const log = await service();
    vi.mocked(log.addFoodLogEntry).mockRejectedValue(
      new log.FoodLogNotFoundError('Aliment introuvable'),
    );

    const response = await POST(
      json('POST', '', { trainingDayId: '2026-10-01', meal: 'LUNCH', grams: 120, productId: 'x' }),
    );

    expect(response.status).toBe(404);
  });

  it('deletes an entry', async () => {
    const { DELETE } = await import('./[id]/handler');
    const log = await service();

    const response = await DELETE(new NextRequest(`${BASE}/e1`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'e1' }),
    });

    expect(response.status).toBe(204);
    expect(log.deleteFoodLogEntry).toHaveBeenCalledWith('athlete-1', 'e1');
  });
});

describe('/api/food-log/foods', () => {
  beforeEach(() => vi.clearAllMocks());

  it('searches own foods, Ciqual and Open Food Facts, and says when OFF is down', async () => {
    const { GET } = await import('./foods/handler');
    const log = await service();
    const { searchOffProducts } =
      await import('@sharpit/server/lib/nutrition/food-log/open-food-facts-client');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(log.searchOwnFoods).mockResolvedValue([{ id: 'own' }] as never);
    vi.mocked(searchOffProducts).mockRejectedValue(new Error('503'));

    const body = await (await GET(new NextRequest(`${BASE}/foods?q=skyr`))).json();

    expect(body).toEqual({
      eaten: [],
      own: [{ id: 'own', served: true }],
      generic: [{ id: 'banana', served: true }],
      products: [],
      offUnavailable: true,
    });
  });

  it('lists the foods already eaten first, and not again below', async () => {
    const { GET } = await import('./foods/handler');
    const log = await service();
    const { searchOffProducts } =
      await import('@sharpit/server/lib/nutrition/food-log/open-food-facts-client');
    vi.mocked(log.searchEatenFoods).mockResolvedValue([
      { product: { id: 'banana' }, timesEaten: 12, lastGrams: 120 },
    ] as never);
    vi.mocked(log.searchOwnFoods).mockResolvedValue([]);
    vi.mocked(searchOffProducts).mockResolvedValue([]);
    vi.mocked(log.cacheSearchResults).mockResolvedValue([{ id: 'nectar' }] as never);

    const body = await (await GET(new NextRequest(`${BASE}/foods?q=banane`))).json();

    expect(body).toEqual({
      eaten: [{ product: { id: 'banana', served: true }, timesEaten: 12, lastGrams: 120 }],
      own: [],
      generic: [],
      products: [{ id: 'nectar', served: true }],
      offUnavailable: false,
    });
  });

  it('refuses a one-letter search', async () => {
    const { GET } = await import('./foods/handler');
    expect((await GET(new NextRequest(`${BASE}/foods?q=s`))).status).toBe(400);
  });

  it('answers 404 for a barcode Open Food Facts does not know, 400 for a non-barcode', async () => {
    const { GET } = await import('./foods/barcode/[code]/handler');
    const log = await service();
    vi.mocked(log.findProductByBarcode).mockResolvedValue(null);
    const read = (code: string) =>
      GET(new NextRequest(`${BASE}/foods/barcode/${code}`), { params: Promise.resolve({ code }) });

    expect((await read('3017620422003')).status).toBe(404);
    expect((await read('abc')).status).toBe(400);
  });
});

describe('/api/food-log/targets', () => {
  it("saves the targets and gives today's row its goals", async () => {
    const { PUT } = await import('./targets/handler');
    const log = await service();
    vi.mocked(log.setNutritionTargets).mockResolvedValue({ kcal: 2600 } as never);

    const response = await PUT(json('PUT', '/targets?trainingDayId=2026-10-01', { kcal: 2600 }));

    expect(response.status).toBe(200);
    expect(log.setNutritionTargets).toHaveBeenCalledWith('athlete-1', { kcal: 2600 }, '2026-10-01');
  });
});

describe('/api/food-log/targets in percent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses a split that does not add up to 100', async () => {
    const { PUT } = await import('./targets/handler');
    const log = await service();

    const response = await PUT(
      json('PUT', '/targets?trainingDayId=2026-10-01', {
        mode: 'PERCENT',
        kcal: 2600,
        proteinPct: 30,
        carbsPct: 50,
        fatPct: 25,
      }),
    );

    expect(response.status).toBe(400);
    expect(log.setNutritionTargets).not.toHaveBeenCalled();
  });
});

describe('/api/food-log/foods/mine and /foods/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the athlete's own foods", async () => {
    const { GET } = await import('./foods/mine/handler');
    const log = await service();
    vi.mocked(log.listOwnFoods).mockResolvedValue([{ id: 'mine' }] as never);

    expect(await (await GET()).json()).toEqual({ foods: [{ id: 'mine', served: true }] });
    expect(log.listOwnFoods).toHaveBeenCalledWith('athlete-1');
  });

  it('edits an own food, 404 when it is not the athlete’s, and deletes one', async () => {
    const { PATCH, DELETE } = await import('./foods/[id]/handler');
    const log = await service();
    const params = { params: Promise.resolve({ id: 'mine' }) };
    vi.mocked(log.updateCustomFood).mockResolvedValueOnce({ id: 'mine' } as never);

    expect((await PATCH(json('PATCH', '/foods/mine', { kcalPer100g: 120 }), params)).status).toBe(
      200,
    );
    expect(log.updateCustomFood).toHaveBeenCalledWith('athlete-1', 'mine', { kcalPer100g: 120 });

    vi.mocked(log.updateCustomFood).mockRejectedValueOnce(new log.FoodLogNotFoundError('x'));
    expect((await PATCH(json('PATCH', '/foods/x', { name: 'X' }), params)).status).toBe(404);
    expect((await PATCH(json('PATCH', '/foods/mine', {}), params)).status).toBe(400);

    const deleted = await DELETE(new NextRequest(`${BASE}/foods/mine`), params);
    expect(deleted.status).toBe(204);
    expect(log.deleteCustomFood).toHaveBeenCalledWith('athlete-1', 'mine');
  });
});

describe('/api/food-log/import/myfitnesspal', () => {
  const upload = (file?: File) => {
    const form = new FormData();
    if (file) {
      form.set('file', file);
    }
    return new NextRequest(`${BASE}/import/myfitnesspal`, { method: 'POST', body: form });
  };

  it('imports the uploaded export and answers what it read', async () => {
    const { POST } = await import('./import/myfitnesspal/handler');
    const { importMfpExport } =
      await import('@sharpit/server/lib/nutrition/import/mfp-export-import');
    const result = {
      importedDays: 2,
      firstDay: '2026-09-30',
      lastDay: '2026-10-01',
      skippedRows: 0,
    };
    vi.mocked(importMfpExport).mockResolvedValue(result);

    const response = await POST(upload(new File(['Date,Meal,Calories'], 'Nutrition.csv')));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(importMfpExport).toHaveBeenCalledWith('athlete-1', expect.any(Uint8Array));
  });

  it('asks for a file, and says why an unreadable one is refused', async () => {
    const { POST } = await import('./import/myfitnesspal/handler');
    const { importMfpExport } =
      await import('@sharpit/server/lib/nutrition/import/mfp-export-import');
    const { MfpExportFormatError } = await import('@sharpit/app/lib/nutrition/import/mfp-export');
    vi.mocked(importMfpExport).mockRejectedValue(new MfpExportFormatError('Pas un export'));

    expect((await POST(upload())).status).toBe(400);
    const refused = await POST(upload(new File(['x'], 'x.csv')));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: 'Pas un export' });
  });
});
