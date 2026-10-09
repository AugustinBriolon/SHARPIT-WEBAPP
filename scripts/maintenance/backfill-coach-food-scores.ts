/**
 * Gives a score to the entries the coach logged before ADR-075, when an estimated food was written
 * as a quick add (no linked product, so no score). Each such entry is linked to an own food built
 * from its own macros, as `logFoods` now does; the entry's figures are left untouched.
 *
 * The coach's quick adds are found through its tool executions (`CoachToolExecution`, `logFoods`,
 * items with `matched: false`): the athlete's own quick adds are never touched.
 *
 *   Dry run (writes nothing):
 *     DATABASE_URL='<prod>' yarn tsx scripts/maintenance/backfill-coach-food-scores.ts --athlete <id>
 *   Write: same command + --write
 */
import { prisma } from '@sharpit/db/client';
import {
  createCustomFood,
  foodLogDayDate,
} from '@sharpit/server/lib/nutrition/food-log/food-log-service';

const MAX_PER_100G = 1_000;

type ExecutedItem = { name: string; grams: number; matched: boolean };
type ExecutedFoods = { date: string; meal: string; items: ExecutedItem[] };

function parseArgs(argv: string[]) {
  const athleteIndex = argv.indexOf('--athlete');
  return {
    athleteId: athleteIndex >= 0 ? argv[athleteIndex + 1] : undefined,
    write: argv.includes('--write'),
  };
}

function asExecutedFoods(value: unknown): ExecutedFoods | null {
  const row = value as Partial<ExecutedFoods> | null;
  if (!row || typeof row.date !== 'string' || typeof row.meal !== 'string') {
    return null;
  }
  return Array.isArray(row.items) ? (row as ExecutedFoods) : null;
}

/** An entry stores the portion's totals; the own food stores them per 100 g, to one decimal. */
function per100g(total: number, grams: number): number {
  const value = Math.round((total / grams) * 100 * 10) / 10;
  return Math.min(MAX_PER_100G, Math.max(0, value));
}

async function ownFoodFor(
  athleteId: string,
  entry: { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number },
  write: boolean,
) {
  const existing = await prisma.foodProduct.findFirst({
    where: {
      ownerId: athleteId,
      source: 'CUSTOM',
      name: { equals: entry.name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  if (!write) {
    return 'new';
  }
  const created = await createCustomFood(athleteId, {
    name: entry.name,
    kcalPer100g: per100g(entry.kcal, entry.grams),
    proteinPer100g: per100g(entry.protein, entry.grams),
    carbsPer100g: per100g(entry.carbs, entry.grams),
    fatPer100g: per100g(entry.fat, entry.grams),
  });
  return created.id;
}

async function main() {
  const { athleteId, write } = parseArgs(process.argv.slice(2));
  const executions = await prisma.coachToolExecution.findMany({
    where: { toolName: 'logFoods', ...(athleteId ? { athleteId } : {}) },
    select: { athleteId: true, result: true },
  });

  const linked = new Set<string>();
  const foods = new Map<string, string>();
  for (const execution of executions) {
    const executed = asExecutedFoods(execution.result);
    if (!executed) {
      continue;
    }
    for (const item of executed.items.filter((candidate) => !candidate.matched)) {
      const entry = await prisma.foodLogEntry.findFirst({
        where: {
          athleteId: execution.athleteId,
          productId: null,
          date: foodLogDayDate(executed.date),
          meal: executed.meal as 'BREAKFAST',
          name: item.name,
          grams: item.grams,
          id: { notIn: [...linked] },
        },
      });
      if (!entry || entry.grams <= 0) {
        continue;
      }
      linked.add(entry.id);
      const key = `${entry.athleteId}:${entry.name.toLowerCase()}`;
      const productId = foods.get(key) ?? (await ownFoodFor(entry.athleteId, entry, write));
      foods.set(key, productId);
      console.log(
        `${write ? 'link' : 'would link'}  ${executed.date}  ${entry.name}  ${entry.grams} g`,
      );
      if (write) {
        await prisma.foodLogEntry.update({ where: { id: entry.id }, data: { productId } });
      }
    }
  }
  console.log(
    `${write ? 'Linked' : 'Would link'} ${linked.size} entries to ${foods.size} own foods` +
      (write ? '.' : ' (dry run — add --write to apply).'),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
