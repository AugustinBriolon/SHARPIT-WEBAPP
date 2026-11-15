/**
 * Read-only: the load per hour of the latest SESSION features, by sport and by the method
 * that scored them. The same session should weigh about the same whatever scored it; this
 * is the table that shows whether it does.
 *
 * Usage: yarn tsx scripts/inspect-session-load.ts [athleteId]
 */
import { prisma } from '@sharpit/db/client';

const athleteId = process.argv[2] ?? 'default';

type SessionData = {
  sportType?: string;
  tssMethod?: string;
  tssScore?: number | null;
  durationSec?: number | null;
};

async function main() {
  const rows = await prisma.featureSet.findMany({
    where: { athleteId, category: 'SESSION' },
    orderBy: { version: 'desc' },
    distinct: ['sessionObsId'],
    select: { data: true },
  });
  const groups = new Map<string, { count: number; load: number; hours: number }>();
  for (const row of rows) {
    const data = row.data as SessionData | null;
    if (!data?.sportType || !data.tssMethod || !data.tssScore || !data.durationSec) {
      continue;
    }
    const key = `${data.sportType.padEnd(11)} ${data.tssMethod}`;
    const group = groups.get(key) ?? { count: 0, load: 0, hours: 0 };
    group.count += 1;
    group.load += data.tssScore;
    group.hours += data.durationSec / 3600;
    groups.set(key, group);
  }
  console.log(`Sessions read: ${rows.length}`);
  for (const [key, { count, load, hours }] of [...groups].sort()) {
    console.log(
      `${key.padEnd(28)} n=${String(count).padStart(3)}  ${(load / hours).toFixed(1)} per hour`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
