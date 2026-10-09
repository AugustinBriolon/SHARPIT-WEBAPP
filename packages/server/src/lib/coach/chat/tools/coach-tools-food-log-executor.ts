import { Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import {
  createCustomFood,
  resolveFoodLogEntryCreateData,
  recomputeFoodLogDay,
} from '@sharpit/server/lib/nutrition/food-log/food-log-service';
import { resolveDescribedName } from '@sharpit/server/lib/nutrition/food-log/food-describe-resolve';
import type { FoodLogEntryCreateInput } from '@sharpit/app/lib/validators/food-log';
import { logFoodsInputSchema, type LogFoodsInput } from './coach-tools-food-log';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOG_FOODS_TOOL = 'logFoods';

export type LogFoodsResult = {
  ok: true;
  date: string;
  meal: LogFoodsInput['meal'];
  count: number;
  items: Array<{
    name: string;
    grams: number;
    matched: boolean;
    match: string | null;
  }>;
};

export type LogFoodsFailure = { ok: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function asStoredResult(value: unknown): LogFoodsResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<LogFoodsResult>;
  if (row.ok !== true || typeof row.date !== 'string' || typeof row.count !== 'number') {
    return null;
  }
  if (!Array.isArray(row.items)) {
    return null;
  }
  return row as LogFoodsResult;
}

async function findPriorExecution(
  athleteId: string,
  toolCallId: string,
): Promise<LogFoodsResult | null> {
  const prior = await prisma.coachToolExecution.findUnique({
    where: { athleteId_toolCallId: { athleteId, toolCallId } },
    select: { result: true },
  });
  return prior ? asStoredResult(prior.result) : null;
}

type PreparedItem = {
  summary: LogFoodsResult['items'][number];
  create: FoodLogEntryCreateInput;
};

/**
 * Resolve each proposed food (eaten → own → Ciqual → OFF), then log all in one transaction with
 * a CoachToolExecution row keyed by (athleteId, toolCallId). Replays return the stored result.
 */
export async function executeLogFoodsTool(
  athleteId: string,
  rawInput: unknown,
  options: { toolCallId: string },
): Promise<LogFoodsResult | LogFoodsFailure> {
  const toolCallId = options.toolCallId?.trim();
  if (!toolCallId) {
    return { ok: false, error: 'Identifiant d’action manquant.' };
  }

  const parsed = logFoodsInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'Données alimentaires invalides.' };
  }
  const input = parsed.data;

  if (!DATE_RE.test(input.date)) {
    return { ok: false, error: 'Date du journal invalide (yyyy-MM-dd).' };
  }

  const prior = await findPriorExecution(athleteId, toolCallId);
  if (prior) {
    return prior;
  }

  const rounded = input.items.map((item) => ({ ...item, grams: Math.round(item.grams) }));
  if (rounded.some((item) => item.grams < 1 || item.grams > 5_000)) {
    return { ok: false, error: 'Quantité invalide (1 à 5000 g).' };
  }

  const prepared: PreparedItem[] = [];
  for (const item of rounded) {
    const { grams } = item;
    const linked = await resolveDescribedName(athleteId, item.name);
    if (linked) {
      prepared.push({
        summary: {
          name: linked.product.name,
          grams,
          matched: true,
          match: linked.match,
        },
        create: {
          trainingDayId: input.date,
          meal: input.meal,
          grams,
          productId: linked.product.id,
        },
      });
      continue;
    }

    // Not in any catalogue: the coach's per-100 g estimate becomes an own food, so the entry is
    // scored from its macros (ADR-066) and found again by name next time — a quick add has no score.
    const estimated = await createCustomFood(athleteId, {
      name: item.name.trim().slice(0, 120),
      kcalPer100g: item.kcalPer100g,
      proteinPer100g: item.proteinPer100g,
      carbsPer100g: item.carbsPer100g,
      fatPer100g: item.fatPer100g,
    });
    prepared.push({
      summary: {
        name: estimated.name,
        grams,
        matched: false,
        match: null,
      },
      create: {
        trainingDayId: input.date,
        meal: input.meal,
        grams,
        productId: estimated.id,
      },
    });
  }

  const result: LogFoodsResult = {
    ok: true,
    date: input.date,
    meal: input.meal,
    count: prepared.length,
    items: prepared.map((row) => row.summary),
  };

  const entryRows = await Promise.all(
    prepared.map((row) => resolveFoodLogEntryCreateData(athleteId, row.create)),
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.coachToolExecution.create({
        data: {
          athleteId,
          toolCallId,
          toolName: LOG_FOODS_TOOL,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });
      for (const data of entryRows) {
        await tx.foodLogEntry.create({ data });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await findPriorExecution(athleteId, toolCallId);
      if (raced) {
        return raced;
      }
    }
    throw error;
  }

  await recomputeFoodLogDay(athleteId, input.date);
  return result;
}
