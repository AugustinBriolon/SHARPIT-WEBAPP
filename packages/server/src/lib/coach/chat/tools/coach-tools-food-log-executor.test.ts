import { beforeEach, describe, expect, it, vi } from 'vitest';

const addFoodLogEntry = vi.hoisted(() => vi.fn());
const resolveDescribedName = vi.hoisted(() => vi.fn());

vi.mock('@sharpit/server/lib/nutrition/food-log/food-log-service', () => ({
  addFoodLogEntry,
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-describe-resolve', () => ({
  resolveDescribedName,
}));

import { executeLogFoodsTool } from './coach-tools-food-log-executor';

describe('executeLogFoodsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDescribedName.mockResolvedValue(null);
    addFoodLogEntry.mockResolvedValue({});
  });

  it('rejects a bad date', async () => {
    await expect(
      executeLogFoodsTool('ath-1', {
        date: '08/10/2026',
        meal: 'LUNCH',
        items: [
          {
            name: 'Frites',
            grams: 200,
            kcalPer100g: 300,
            proteinPer100g: 4,
            carbsPer100g: 40,
            fatPer100g: 15,
          },
        ],
      }),
    ).resolves.toEqual({ ok: false, error: 'Date du journal invalide (yyyy-MM-dd).' });
    expect(addFoodLogEntry).not.toHaveBeenCalled();
  });

  it('logs a matched product by id', async () => {
    resolveDescribedName.mockResolvedValue({
      product: { id: 'p1', name: 'Brocoli, cru' },
      match: 'generic',
    });

    const result = await executeLogFoodsTool('ath-1', {
      date: '2026-10-08',
      meal: 'DINNER',
      items: [
        {
          name: 'brocolis',
          grams: 180,
          kcalPer100g: 35,
          proteinPer100g: 3,
          carbsPer100g: 4,
          fatPer100g: 0.5,
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      date: '2026-10-08',
      meal: 'DINNER',
      count: 1,
      items: [{ name: 'Brocoli, cru', grams: 180, matched: true, match: 'generic' }],
    });
    expect(addFoodLogEntry).toHaveBeenCalledWith('ath-1', {
      trainingDayId: '2026-10-08',
      meal: 'DINNER',
      grams: 180,
      productId: 'p1',
    });
  });

  it('falls back to a quick add when nothing matches', async () => {
    const result = await executeLogFoodsTool('ath-1', {
      date: '2026-10-08',
      meal: 'LUNCH',
      items: [
        {
          name: 'Pain turc',
          grams: 100,
          kcalPer100g: 270,
          proteinPer100g: 9,
          carbsPer100g: 50,
          fatPer100g: 3,
        },
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      count: 1,
      items: [{ name: 'Pain turc', grams: 100, matched: false, match: null }],
    });
    expect(addFoodLogEntry).toHaveBeenCalledWith(
      'ath-1',
      expect.objectContaining({
        meal: 'LUNCH',
        grams: 100,
        quick: expect.objectContaining({ name: 'Pain turc', kcal: 270 }),
      }),
    );
  });
});
