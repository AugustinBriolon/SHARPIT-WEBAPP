import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const resolveDescribedName = vi.hoisted(() => vi.fn());
const resolveFoodLogEntryCreateData = vi.hoisted(() => vi.fn());
const recomputeFoodLogDay = vi.hoisted(() => vi.fn());
const coachToolExecutionFindUnique = vi.hoisted(() => vi.fn());
const coachToolExecutionCreate = vi.hoisted(() => vi.fn());
const foodLogEntryCreate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock('@sharpit/server/lib/nutrition/food-log/food-describe-resolve', () => ({
  resolveDescribedName,
}));
vi.mock('@sharpit/server/lib/nutrition/food-log/food-log-service', () => ({
  resolveFoodLogEntryCreateData,
  recomputeFoodLogDay,
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: {
    coachToolExecution: {
      findUnique: (...args: unknown[]) => coachToolExecutionFindUnique(...args),
      create: (...args: unknown[]) => coachToolExecutionCreate(...args),
    },
    foodLogEntry: {
      create: (...args: unknown[]) => foodLogEntryCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

import { executeLogFoodsTool } from './coach-tools-food-log-executor';

const baseItem = {
  name: 'Pain turc',
  grams: 100,
  kcalPer100g: 270,
  proteinPer100g: 9,
  carbsPer100g: 50,
  fatPer100g: 3,
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('executeLogFoodsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDescribedName.mockResolvedValue(null);
    resolveFoodLogEntryCreateData.mockImplementation(async (athleteId: string, input) => ({
      athleteId,
      date: new Date(`${input.trainingDayId}T00:00:00.000Z`),
      meal: input.meal,
      grams: input.grams,
      productId: input.productId ?? null,
      name: input.quick?.name ?? 'x',
      brand: null,
      kcal: input.quick?.kcal ?? 0,
      protein: input.quick?.protein ?? 0,
      carbs: input.quick?.carbs ?? 0,
      fat: input.quick?.fat ?? 0,
      fiber: null,
      sugar: null,
    }));
    recomputeFoodLogDay.mockResolvedValue(undefined);
    coachToolExecutionFindUnique.mockResolvedValue(null);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        coachToolExecution: { create: coachToolExecutionCreate },
        foodLogEntry: { create: foodLogEntryCreate },
      };
      coachToolExecutionCreate.mockResolvedValue({});
      foodLogEntryCreate.mockResolvedValue({});
      return fn(tx);
    });
  });

  it('rejects a bad date without writing', async () => {
    await expect(
      executeLogFoodsTool(
        'ath-1',
        { date: '08/10/2026', meal: 'LUNCH', items: [baseItem] },
        { toolCallId: 'call-1' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Date du journal invalide (yyyy-MM-dd).' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects invalid grams (client-edited) without writing', async () => {
    await expect(
      executeLogFoodsTool(
        'ath-1',
        { date: '2026-10-08', meal: 'LUNCH', items: [{ ...baseItem, grams: 0 }] },
        { toolCallId: 'call-bad-grams' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Données alimentaires invalides.' });
    expect(transaction).not.toHaveBeenCalled();
    expect(foodLogEntryCreate).not.toHaveBeenCalled();
  });

  it('rejects grams above 5000 without writing', async () => {
    await expect(
      executeLogFoodsTool(
        'ath-1',
        { date: '2026-10-08', meal: 'LUNCH', items: [{ ...baseItem, grams: 5001 }] },
        { toolCallId: 'call-too-heavy' },
      ),
    ).resolves.toEqual({ ok: false, error: 'Données alimentaires invalides.' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('applies edited grams on approve', async () => {
    const result = await executeLogFoodsTool(
      'ath-1',
      {
        date: '2026-10-08',
        meal: 'SNACKS',
        items: [{ ...baseItem, grams: 250 }],
      },
      { toolCallId: 'call-edited' },
    );

    expect(result).toMatchObject({
      ok: true,
      meal: 'SNACKS',
      count: 1,
      items: [{ name: 'Pain turc', grams: 250, matched: false }],
    });
    expect(resolveFoodLogEntryCreateData).toHaveBeenCalledWith(
      'ath-1',
      expect.objectContaining({ grams: 250, meal: 'SNACKS' }),
    );
    expect(foodLogEntryCreate).toHaveBeenCalledTimes(1);
    expect(coachToolExecutionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        athleteId: 'ath-1',
        toolCallId: 'call-edited',
        toolName: 'logFoods',
      }),
    });
    expect(recomputeFoodLogDay).toHaveBeenCalledWith('ath-1', '2026-10-08');
  });

  it('logs a matched product by id', async () => {
    resolveDescribedName.mockResolvedValue({
      product: { id: 'p1', name: 'Brocoli, cru' },
      match: 'generic',
    });

    const result = await executeLogFoodsTool(
      'ath-1',
      {
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
      },
      { toolCallId: 'call-match' },
    );

    expect(result).toEqual({
      ok: true,
      date: '2026-10-08',
      meal: 'DINNER',
      count: 1,
      items: [{ name: 'Brocoli, cru', grams: 180, matched: true, match: 'generic' }],
    });
    expect(resolveFoodLogEntryCreateData).toHaveBeenCalledWith('ath-1', {
      trainingDayId: '2026-10-08',
      meal: 'DINNER',
      grams: 180,
      productId: 'p1',
    });
  });

  it('writes N items once and returns the same result on replay', async () => {
    const input = {
      date: '2026-10-08',
      meal: 'LUNCH',
      items: [
        { ...baseItem, name: 'Riz', grams: 150 },
        { ...baseItem, name: 'Poulet', grams: 120 },
      ],
    };

    const first = await executeLogFoodsTool('ath-1', input, { toolCallId: 'call-multi' });
    expect(first).toMatchObject({ ok: true, count: 2 });
    expect(foodLogEntryCreate).toHaveBeenCalledTimes(2);
    expect(coachToolExecutionCreate).toHaveBeenCalledTimes(1);

    const stored = first;
    coachToolExecutionFindUnique.mockResolvedValue({ result: stored });
    transaction.mockClear();
    foodLogEntryCreate.mockClear();
    coachToolExecutionCreate.mockClear();
    recomputeFoodLogDay.mockClear();

    const second = await executeLogFoodsTool('ath-1', input, { toolCallId: 'call-multi' });
    expect(second).toEqual(stored);
    expect(transaction).not.toHaveBeenCalled();
    expect(foodLogEntryCreate).not.toHaveBeenCalled();
    expect(recomputeFoodLogDay).not.toHaveBeenCalled();
  });

  it('on unique race, returns the winner result without a second write', async () => {
    const stored = {
      ok: true as const,
      date: '2026-10-08',
      meal: 'LUNCH' as const,
      count: 1,
      items: [{ name: 'Pain turc', grams: 100, matched: false, match: null }],
    };
    transaction.mockRejectedValueOnce(uniqueViolation());
    coachToolExecutionFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ result: stored });

    const result = await executeLogFoodsTool(
      'ath-1',
      { date: '2026-10-08', meal: 'LUNCH', items: [baseItem] },
      { toolCallId: 'call-race' },
    );

    expect(result).toEqual(stored);
    expect(recomputeFoodLogDay).not.toHaveBeenCalled();
  });

  it('scopes writes to the session athlete, never another athlete id', async () => {
    await executeLogFoodsTool(
      'ath-session',
      { date: '2026-10-08', meal: 'LUNCH', items: [baseItem] },
      { toolCallId: 'call-scope' },
    );

    expect(resolveFoodLogEntryCreateData).toHaveBeenCalledWith('ath-session', expect.any(Object));
    expect(coachToolExecutionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ athleteId: 'ath-session', toolCallId: 'call-scope' }),
    });
    expect(resolveFoodLogEntryCreateData).not.toHaveBeenCalledWith('ath-other', expect.anything());
  });

  it('lets another athlete use the same toolCallId without touching the first athlete', async () => {
    await executeLogFoodsTool(
      'ath-a',
      { date: '2026-10-08', meal: 'LUNCH', items: [baseItem] },
      { toolCallId: 'shared-call-id' },
    );
    expect(coachToolExecutionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ athleteId: 'ath-a', toolCallId: 'shared-call-id' }),
    });

    vi.clearAllMocks();
    resolveDescribedName.mockResolvedValue(null);
    resolveFoodLogEntryCreateData.mockImplementation(async (athleteId: string, input) => ({
      athleteId,
      date: new Date(`${input.trainingDayId}T00:00:00.000Z`),
      meal: input.meal,
      grams: input.grams,
      productId: null,
      name: input.quick?.name ?? 'x',
      brand: null,
      kcal: 1,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: null,
      sugar: null,
    }));
    coachToolExecutionFindUnique.mockResolvedValue(null);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        coachToolExecution: { create: coachToolExecutionCreate },
        foodLogEntry: { create: foodLogEntryCreate },
      };
      coachToolExecutionCreate.mockResolvedValue({});
      foodLogEntryCreate.mockResolvedValue({});
      return fn(tx);
    });

    await executeLogFoodsTool(
      'ath-b',
      { date: '2026-10-08', meal: 'DINNER', items: [{ ...baseItem, grams: 80 }] },
      { toolCallId: 'shared-call-id' },
    );

    expect(coachToolExecutionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ athleteId: 'ath-b', toolCallId: 'shared-call-id' }),
    });
    expect(resolveFoodLogEntryCreateData).toHaveBeenCalledWith(
      'ath-b',
      expect.objectContaining({ grams: 80 }),
    );
    expect(resolveFoodLogEntryCreateData).not.toHaveBeenCalledWith('ath-a', expect.anything());
  });
});
