import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    $transaction: vi.fn(async (writes: Promise<unknown>[]) => Promise.all(writes)),
    foodLogEntry: { findMany: vi.fn(), create: vi.fn() },
    foodProduct: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    savedMeal: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('./food-log-service', async (original) => {
  const actual = await original<typeof import('./food-log-service')>();
  return {
    ...actual,
    recomputeFoodLogDay: vi.fn(),
    servedEntry: vi.fn(async (entry: object) => ({ ...entry, served: true })),
    productForEntry: vi.fn(),
  };
});

const DAY = new Date('2026-10-01T00:00:00.000Z');

function entry(patch: object = {}) {
  return {
    id: 'e1',
    athleteId: 'a1',
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
    updatedAt: DAY,
    ...patch,
  };
}

async function setup() {
  const { prisma } = await import('@sharpit/db/client');
  const service = await import('./food-log-service');
  const templates = await import('./food-log-templates');
  vi.mocked(prisma.foodLogEntry.create).mockImplementation((async ({ data }: { data: object }) => ({
    id: 'new',
    ...data,
  })) as never);
  return { prisma, service, templates };
}

describe('food log templates (ADR-071)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies yesterday's breakfast into today's lunch, as snapshots, and rebuilds the day once", async () => {
    const { prisma, service, templates } = await setup();
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([
      entry(),
      entry({ id: 'e2', productId: 'gone', name: 'Pain' }),
    ] as never);
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([{ id: 'p-skyr' }] as never);

    const copied = await templates.copyFoodLog('a1', {
      fromTrainingDayId: '2026-10-01',
      fromMeal: 'BREAKFAST',
      toTrainingDayId: '2026-10-02',
      toMeal: 'LUNCH',
    });

    expect(prisma.foodLogEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { athleteId: 'a1', date: DAY, meal: 'BREAKFAST' } }),
    );
    expect(copied.map((item) => [item.meal, item.productId, item.kcal])).toEqual([
      ['LUNCH', 'p-skyr', 93],
      ['LUNCH', null, 93],
    ]);
    expect(service.recomputeFoodLogDay).toHaveBeenCalledTimes(1);
    expect(service.recomputeFoodLogDay).toHaveBeenCalledWith('a1', '2026-10-02');
  });

  it('copies a whole day meal by meal, and writes nothing for an empty one', async () => {
    const { prisma, service, templates } = await setup();
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([
      entry(),
      entry({ id: 'e2', meal: 'DINNER' }),
    ] as never);
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([{ id: 'p-skyr' }] as never);

    const copied = await templates.copyFoodLog('a1', {
      fromTrainingDayId: '2026-10-01',
      toTrainingDayId: '2026-10-02',
    });
    expect(copied.map((item) => item.meal)).toEqual(['BREAKFAST', 'DINNER']);

    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([]);
    vi.mocked(service.recomputeFoodLogDay).mockClear();
    expect(
      await templates.copyFoodLog('a1', {
        fromTrainingDayId: '2026-09-30',
        toTrainingDayId: '2026-10-02',
      }),
    ).toEqual([]);
    expect(service.recomputeFoodLogDay).not.toHaveBeenCalled();
  });

  it('saves a logged meal with its totals and score, and refuses an empty one', async () => {
    const { prisma, templates } = await setup();
    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([entry()] as never);
    vi.mocked(prisma.savedMeal.create).mockImplementation((async ({ data }: { data: object }) => ({
      id: 'm1',
      updatedAt: DAY,
      ...data,
    })) as never);
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([]);

    const saved = await templates.createSavedMeal('a1', {
      name: 'Petit-déj habituel',
      trainingDayId: '2026-10-01',
      meal: 'BREAKFAST',
    });
    expect(saved).toMatchObject({ id: 'm1', name: 'Petit-déj habituel', kcal: 93, protein: 16.5 });
    expect(saved.items).toHaveLength(1);

    vi.mocked(prisma.foodLogEntry.findMany).mockResolvedValue([]);
    await expect(
      templates.createSavedMeal('a1', {
        name: 'Vide',
        trainingDayId: '2026-10-01',
        meal: 'DINNER',
      }),
    ).rejects.toThrow('Ce repas est vide');
  });

  it("logs a saved meal into the chosen meal, never another athlete's", async () => {
    const { prisma, templates } = await setup();
    vi.mocked(prisma.savedMeal.findFirst).mockResolvedValue({
      id: 'm1',
      items: [
        {
          productId: null,
          name: 'Café',
          brand: null,
          grams: 200,
          kcal: 4,
          protein: 0.2,
          carbs: 0,
          fat: 0,
          fiber: null,
          sugar: null,
        },
      ],
    } as never);
    vi.mocked(prisma.foodProduct.findMany).mockResolvedValue([]);

    const logged = await templates.logSavedMeal('a1', 'm1', {
      trainingDayId: '2026-10-02',
      meal: 'SNACKS',
    });
    expect(logged).toEqual([expect.objectContaining({ meal: 'SNACKS', name: 'Café' })]);
    expect(prisma.savedMeal.findFirst).toHaveBeenCalledWith({
      where: { id: 'm1', athleteId: 'a1' },
    });

    vi.mocked(prisma.savedMeal.findFirst).mockResolvedValue(null);
    await expect(templates.deleteSavedMeal('a1', 'm1')).rejects.toThrow('Repas introuvable');
    expect(prisma.savedMeal.delete).not.toHaveBeenCalled();
  });

  it('creates a recipe as an own food, its label from the ingredients', async () => {
    const { prisma, service, templates } = await setup();
    vi.mocked(service.productForEntry).mockImplementation((async (_athlete: string, id: string) =>
      id === 'rice'
        ? {
            id: 'rice',
            name: 'Riz',
            brand: null,
            kcalPer100g: 350,
            proteinPer100g: 7,
            carbsPer100g: 78,
            fatPer100g: 1,
          }
        : {
            id: 'chicken',
            name: 'Poulet',
            brand: null,
            kcalPer100g: 110,
            proteinPer100g: 23,
            carbsPer100g: 0,
            fatPer100g: 2,
          }) as never);
    vi.mocked(prisma.foodProduct.create).mockImplementation(
      (async ({ data }: { data: object }) => data) as never,
    );

    const recipe = (await templates.createRecipe('a1', {
      name: 'Riz au poulet',
      ingredients: [
        { productId: 'rice', grams: 100 },
        { productId: 'chicken', grams: 150 },
      ],
      cookedGrams: 500,
      servings: 2,
    })) as unknown as Record<string, unknown>;

    expect(recipe).toMatchObject({
      source: 'CUSTOM',
      ownerId: 'a1',
      name: 'Riz au poulet',
      kcalPer100g: 103,
      proteinPer100g: 8.3,
      servingGrams: 250,
      servingLabel: '1 part · 250 g',
    });
    expect(recipe.recipe).toMatchObject({
      cookedGrams: 500,
      servings: 2,
      totalGrams: 500,
      ingredients: [
        { productId: 'rice', grams: 100, kcalPer100g: 350 },
        { productId: 'chicken', grams: 150, proteinPer100g: 23 },
      ],
    });
  });
});
