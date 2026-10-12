/**
 * Read-only: lists every activity row of one athlete day, hidden (absorbed) rows included.
 * Usage: yarn tsx scripts/inspect-activity-day.ts --athlete <id> --day YYYY-MM-DD
 */
import { prisma } from '@sharpit/db/client';

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const athleteId = argValue('--athlete');
  const day = argValue('--day');
  if (!athleteId || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error('Usage: --athlete <id> --day YYYY-MM-DD');
  }
  const start = new Date(`${day}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const rows = await prisma.activity.findMany({
    where: { athleteId, date: { gte: start, lt: end } },
    orderBy: { date: 'asc' },
    select: {
      id: true,
      type: true,
      source: true,
      title: true,
      date: true,
      duration: true,
      stravaId: true,
      garminId: true,
      appleHealthId: true,
      mergedIntoId: true,
      goalId: true,
    },
  });
  console.table(
    rows.map((row) => ({
      ...row,
      date: row.date.toISOString().slice(11, 19),
      stravaId: Boolean(row.stravaId),
      garminId: Boolean(row.garminId),
      appleHealthId: Boolean(row.appleHealthId),
    })),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
