import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    foodLogEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    foodProduct: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dailyNutrition: { upsert: vi.fn(), deleteMany: vi.fn() },
    athleteProfile: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('@sharpit/server/lib/engines/observation-engine', () => ({
  observationEngine: { ingest: vi.fn() },
}));
vi.mock('./open-food-facts-client', () => ({ fetchOffProduct: vi.fn() }));

const SKYR = {
  id: 'p-skyr',
  source: 'OFF',
  barcode: '5690845000621',
  name: 'Skyr',
  brand: 'Isey',
  kcalPer100g: 62,
  proteinPer100g: 11,
  carbsPer100g: 4,
  fatPer100g: 0.2,
  fiberPer100g: null,
  sugarPer100g: 4,
  saltPer100g: 0.1,
  saturatedFatPer100g: 0.1,
  health: {
    score: 80,
    scoreVersion: 2,
    coverage: 'full',
    detail: 'full',
    dietFacts: { vegan: 'no', vegetarian: 'yes', gluten: 'absent', milk: 'contains' },
  },
  fetchedAt: new Date(),
};

const MAPPED_SKYR = {
  barcode: SKYR.barcode,
  name: SKYR.name,
  brand: SKYR.brand,
  kcalPer100g: SKYR.kcalPer100g,
  proteinPer100g: SKYR.proteinPer100g,
  carbsPer100g: SKYR.carbsPer100g,
  fatPer100g: SKYR.fatPer100g,
  fiberPer100g: null,
  sugarPer100g: SKYR.sugarPer100g,
  saltPer100g: SKYR.saltPer100g,
  saturatedFatPer100g: SKYR.saturatedFatPer100g,
  servingGrams: null,
  servingLabel: null,
  health: SKYR.health,
};

const DAY = new Date('2026-10-01T00:00:00.000Z');

function storedEntry(patch: object = {}) {
  return {
    id: 'e1',
    athleteId: 'athlete-1',
    date: DAY,
    meal: 'BREAKFAST',
    productId: 'p-skyr',
    name: 'Skyr',
    brand: 'Isey',
    grams: 150,
    kcal: 93,
    protein: 16.5,
    carbs: 6,
    fat: 0.3,
    fiber: null,
    sugar: 6,
    createdAt: DAY,
    ...patch,
  };
}

async function setup() {
  const { prisma } = await import('@sharpit/db/client');
  const service = await import('./food-log-service');
  const { observationEngine } = await import('@sharpit/server/lib/engines/observation-engine');
  vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValue({
    nutritionTargetKcal: 2600,
    nutritionTargetProteinG: 140,
    nutritionTargetCarbsG: null,
    nutritionTargetFatG: null,
  } as never);
  return { prisma, service, observationEngine };
}

describe('food log service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('logs a portion of a product, snapshotting its nutrients, then rebuilds the day', async () => {
    const { prisma, service, observationEngine } = await setup();
    vi.mocked(prisma.foodProduct.findFirst).mockResolvedValue(SKYR as never);
    vi.mocked(prisma.foodLogEntry.create).mockResolvedValue(storedEntry() as never);
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([storedEntry()] as never);

    await service.addFoodLogEntry('athlete-1', {
      trainingDayId: '2026-10-01',
      meal: 'BREAKFAST',
      grams: 150,
      productId: 'p-skyr',
    });

    expect(prisma.foodLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kcal: 93, protein: 16.5, name: 'Skyr', productId: 'p-skyr' }),
    });
    expect(prisma.dailyNutrition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          athleteId_date_provider: { athleteId: 'athlete-1', date: DAY, provider: 'sharpit' },
        },
        create: expect.objectContaining({ calories: 93, goalCalories: 2600, goalProtein: 140 }),
      }),
    );
    expect(observationEngine.ingest).toHaveBeenCalledWith(
      'athlete-1',
      expect.objectContaining({
        type: 'NUTRITION',
        source: 'MANUAL',
        energyKcal: 93,
        entryCount: 1,
      }),
    );
  });

  it("never logs another athlete's own food", async () => {
    const { prisma, service } = await setup();
    vi.mocked(prisma.foodProduct.findFirst).mockResolvedValue(null);

    await expect(
      service.addFoodLogEntry('athlete-1', {
        trainingDayId: '2026-10-01',
        meal: 'LUNCH',
        grams: 100,
        productId: 'someone-elses',
      }),
    ).rejects.toBeInstanceOf(service.FoodLogNotFoundError);
    expect(prisma.foodProduct.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'someone-elses',
        OR: [{ source: { in: ['OFF', 'CIQUAL'] } }, { ownerId: 'athlete-1' }],
      },
    });
    expect(prisma.foodLogEntry.create).not.toHaveBeenCalled();
  });

  it('drops the day row when its last entry is deleted', async () => {
    const { prisma, service, observationEngine } = await setup();
    vi.mocked(prisma.foodLogEntry.findFirst).mockResolvedValue(storedEntry() as never);
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([]);

    await service.deleteFoodLogEntry('athlete-1', 'e1');

    expect(prisma.dailyNutrition.deleteMany).toHaveBeenCalledWith({
      where: { athleteId: 'athlete-1', date: DAY, provider: 'sharpit' },
    });
    expect(prisma.dailyNutrition.upsert).not.toHaveBeenCalled();
    expect(observationEngine.ingest).not.toHaveBeenCalled();
  });

  it('rescales a quick add by its own kcal per gram', async () => {
    const { prisma, service } = await setup();
    const quick = storedEntry({ productId: null, grams: 200, kcal: 400, protein: 20 });
    vi.mocked(prisma.foodLogEntry.findFirst).mockResolvedValue(quick as never);
    vi.mocked(prisma.foodLogEntry.update).mockResolvedValue(quick as never);
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([quick] as never);

    await service.updateFoodLogEntry('athlete-1', 'e1', { grams: 100 });

    expect(prisma.foodLogEntry.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ grams: 100, kcal: 200, protein: 10 }),
    });
  });

  it('serves a fresh cached barcode without calling Open Food Facts', async () => {
    const { prisma, service } = await setup();
    const { fetchOffProduct } = await import('./open-food-facts-client');
    vi.mocked(prisma.foodProduct.findUnique).mockResolvedValue(SKYR as never);

    expect(await service.findProductByBarcode('5690845000621')).toBe(SKYR);
    expect(fetchOffProduct).not.toHaveBeenCalled();
  });

  it('keeps a stale cached product when Open Food Facts is down', async () => {
    const { prisma, service } = await setup();
    const { fetchOffProduct } = await import('./open-food-facts-client');
    const stale = { ...SKYR, fetchedAt: new Date('2025-01-01') };
    vi.mocked(prisma.foodProduct.findUnique).mockResolvedValue(stale as never);
    vi.mocked(fetchOffProduct).mockRejectedValue(new Error('503'));

    expect(await service.findProductByBarcode('5690845000621')).toBe(stale);
  });

  it('stores a percent split in grams too, so every reader keeps reading grams', async () => {
    const { prisma, service } = await setup();
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([]);

    await service.setNutritionTargets(
      'athlete-1',
      { mode: 'PERCENT', kcal: 2600, proteinPct: 25, carbsPct: 50, fatPct: 25 },
      '2026-10-01',
    );

    expect(prisma.athleteProfile.update).toHaveBeenCalledWith({
      where: { id: 'athlete-1' },
      data: {
        nutritionTargetMode: 'PERCENT',
        nutritionTargetKcal: 2600,
        nutritionTargetProteinPct: 25,
        nutritionTargetCarbsPct: 50,
        nutritionTargetFatPct: 25,
        nutritionTargetProteinG: 163,
        nutritionTargetCarbsG: 325,
        nutritionTargetFatG: 72,
      },
    });
  });

  it('forgets the split when the athlete goes back to grams', async () => {
    const { prisma, service } = await setup();
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([]);

    await service.setNutritionTargets('athlete-1', { proteinG: 150 }, '2026-10-01');

    expect(prisma.athleteProfile.update).toHaveBeenCalledWith({
      where: { id: 'athlete-1' },
      data: {
        nutritionTargetMode: 'GRAMS',
        nutritionTargetProteinPct: null,
        nutritionTargetCarbsPct: null,
        nutritionTargetFatPct: null,
        nutritionTargetProteinG: 150,
      },
    });
  });

  it("edits and deletes only the athlete's own food", async () => {
    const { prisma, service } = await setup();
    vi.mocked(prisma.foodProduct.findFirst).mockResolvedValueOnce({ id: 'mine' } as never);
    vi.mocked(prisma.foodProduct.findUniqueOrThrow).mockResolvedValueOnce({
      id: 'mine',
      sugarPer100g: 4,
      saltPer100g: null,
      saturatedFatPer100g: null,
    } as never);

    await service.updateCustomFood('athlete-1', 'mine', { kcalPer100g: 120 });

    expect(prisma.foodProduct.findFirst).toHaveBeenCalledWith({
      where: { id: 'mine', ownerId: 'athlete-1', source: 'CUSTOM' },
      select: { id: true },
    });
    expect(prisma.foodProduct.update).toHaveBeenCalledWith({
      where: { id: 'mine' },
      data: expect.objectContaining({
        kcalPer100g: 120,
        health: expect.objectContaining({ coverage: 'partial', scoreVersion: 2 }),
      }),
    });

    vi.mocked(prisma.foodProduct.findFirst).mockResolvedValueOnce(null);
    await expect(service.deleteCustomFood('athlete-1', 'skyr')).rejects.toBeInstanceOf(
      service.FoodLogNotFoundError,
    );
    expect(prisma.foodProduct.delete).not.toHaveBeenCalled();
  });

  it('attaches a live Sharpit score to the day, refreshing products that still lack one', async () => {
    const { prisma, service } = await setup();
    const { fetchOffProduct } = await import('./open-food-facts-client');
    const unscored = {
      ...SKYR,
      health: null,
      fetchedAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    const scored = { ...SKYR, health: { ...SKYR.health, score: 72 } };
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([
      { ...storedEntry(), product: unscored },
    ] as never);
    vi.mocked(prisma.foodProduct.findUnique).mockResolvedValue(unscored as never);
    vi.mocked(fetchOffProduct).mockResolvedValue({
      ...MAPPED_SKYR,
      health: scored.health,
    } as never);
    vi.mocked(prisma.foodProduct.upsert).mockResolvedValue(scored as never);

    const day = await service.listFoodLogDay('athlete-1', '2026-10-01');

    expect(day).toEqual([
      expect.objectContaining({
        id: 'e1',
        health: expect.objectContaining({ score: 72, scoreVersion: 2, dietFit: [] }),
      }),
    ]);
  });

  it('re-reads OFF for a product cached from a search hit, to get its additives', async () => {
    const { prisma, service } = await setup();
    const { fetchOffProduct } = await import('./open-food-facts-client');
    const summary = { ...SKYR, health: { ...SKYR.health, detail: 'summary' } };
    vi.mocked(prisma.foodProduct.findUnique).mockResolvedValue(summary as never);
    vi.mocked(fetchOffProduct).mockResolvedValue(MAPPED_SKYR as never);
    vi.mocked(prisma.foodProduct.upsert).mockResolvedValue(SKYR as never);

    expect(await service.findProductByBarcode(SKYR.barcode)).toBe(SKYR);
    expect(fetchOffProduct).toHaveBeenCalledWith(SKYR.barcode);
  });

  it('keeps a current product as stored when a search hit comes back', async () => {
    const { prisma, service } = await setup();
    const outdated = { ...SKYR, id: 'p-old', barcode: '111', health: { scoreVersion: 1 } };
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([SKYR, outdated] as never);
    vi.mocked(prisma.foodProduct.upsert).mockResolvedValue({ ...outdated, id: 'p-new' } as never);

    const cached = await service.cacheSearchResults([
      MAPPED_SKYR,
      { ...MAPPED_SKYR, barcode: '111' },
    ] as never);

    expect(cached.map((product) => product.id)).toEqual(['p-skyr', 'p-new']);
    expect(prisma.foodProduct.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.foodProduct.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { barcode: '111' } }),
    );
  });

  it('caches a Ciqual food once, keeping a current row as stored', async () => {
    const { prisma, service } = await setup();
    const { ciqualFoodByCode } = await import('./ciqual-search');
    const banana = ciqualFoodByCode(13005)!;
    const egg = ciqualFoodByCode(22000) ?? { ...banana, ciqualCode: 22000 };
    const stored = { id: 'p-banana', ciqualCode: 13005, health: banana.health };
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([stored] as never);
    vi.mocked(prisma.foodProduct.upsert).mockResolvedValue({ id: 'p-egg' } as never);

    const cached = await service.cacheGenericFoods([banana, egg]);

    expect(cached.map((product) => product.id)).toEqual(['p-banana', 'p-egg']);
    expect(prisma.foodProduct.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.foodProduct.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ciqualCode: 22000 },
        create: expect.objectContaining({ source: 'CIQUAL', ciqualCode: 22000 }),
      }),
    );
  });

  it("ranks the athlete's own foods by how their name reads against the query", async () => {
    const { prisma, service } = await setup();
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([
      { id: 'a', name: 'Porridge banane' },
      { id: 'b', name: 'Banane' },
    ] as never);

    const found = await service.searchOwnFoods('athlete-1', 'banane');

    expect(found.map((product) => product.id)).toEqual(['b', 'a']);
  });

  it('scores an own food from its label on every read, whatever was stored', async () => {
    const { service } = await setup();
    const granola = {
      id: 'mine',
      source: 'CUSTOM',
      kcalPer100g: 450,
      proteinPer100g: 12,
      carbsPer100g: 55,
      fatPer100g: 18,
      fiberPer100g: null,
      sugarPer100g: null,
      saltPer100g: null,
      saturatedFatPer100g: null,
      health: { score: null, scoreVersion: 1, coverage: 'none' },
    };

    const served = service.servedProduct(granola as never, { ids: ['keto'], labels: ['Cétogène'] });

    expect(served.health).toMatchObject({ coverage: 'partial', scoreVersion: 2 });
    expect(served.health?.score).toEqual(expect.any(Number));
    expect(served.health?.highlights[0]?.key).toBe('label_incomplete');
    expect(served.health?.dietFit).toEqual([
      expect.objectContaining({ diet: 'keto', status: 'incompatible' }),
    ]);
  });

  it("serves a food with the athlete's diets read against it", async () => {
    const { service } = await setup();
    const served = service.servedProduct(SKYR as never, {
      ids: ['vegan', 'keto'],
      labels: ['Végétalien', 'Cétogène'],
    });

    expect(served.health?.dietFit).toEqual([
      expect.objectContaining({ diet: 'vegan', status: 'incompatible' }),
      expect.objectContaining({ diet: 'keto', status: 'compatible' }),
    ]);
  });
});
