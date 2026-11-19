/**
 * One-off repair: drops the SESSION observations written by the first run of
 * backfill-session-observations, so it can be re-run with correct identities.
 *
 * That first run set source GARMIN with externalId `garminId ?? stravaId ?? id`.
 * The stream provider resolves an observation back to its activity by garminId for
 * GARMIN, stravaId for STRAVA and a `manual:activity:` prefix for MANUAL, so a
 * Strava-only or manually-created activity got an identity that resolves to
 * nothing — no cached stream, and no deduplication against the observation the
 * manual sync had already written. Five days ended up with two sessions for one
 * activity, which double-counted their load.
 *
 * Deletes only observations created on or after the given date, and their derived
 * SESSION feature sets. Observations are rebuilt from Activity rows, so nothing
 * here is a source record.
 *
 * Usage:
 *   yarn tsx scripts/repair-backfilled-sessions.ts --since 2026-08-11 --dry-run
 *   yarn tsx scripts/repair-backfilled-sessions.ts --since 2026-08-11
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const sinceArg = process.argv[process.argv.indexOf('--since') + 1];

async function main() {
  if (!sinceArg || !/^\d{4}-\d{2}-\d{2}$/.test(sinceArg)) {
    console.error('--since YYYY-MM-DD is required');
    process.exitCode = 1;
    return;
  }
  const since = new Date(`${sinceArg}T00:00:00.000Z`);

  const doomed = await prisma.observation.findMany({
    where: { type: 'SESSION', createdAt: { gte: since } },
    select: { id: true, externalId: true, source: true },
  });
  const featureSets = await prisma.featureSet.count({
    where: { category: 'SESSION', sessionObsId: { in: doomed.map((o) => o.id) } },
  });

  const total = await prisma.observation.count({ where: { type: 'SESSION' } });
  console.log(`SESSION observations: ${total}`);
  console.log(`created on/after ${sinceArg}: ${doomed.length}`);
  console.log(`derived SESSION feature sets: ${featureSets}`);

  const bySource = new Map<string, number>();
  for (const o of doomed) {
    bySource.set(o.source, (bySource.get(o.source) ?? 0) + 1);
  }
  for (const [source, count] of bySource) {
    console.log(`  source ${source}: ${count}`);
  }

  if (dryRun) {
    console.log('\ndry-run: nothing deleted.');
    return;
  }

  const deletedFeatures = await prisma.featureSet.deleteMany({
    where: { category: 'SESSION', sessionObsId: { in: doomed.map((o) => o.id) } },
  });
  const deletedObs = await prisma.observation.deleteMany({
    where: { id: { in: doomed.map((o) => o.id) } },
  });

  console.log(`\ndeleted feature sets: ${deletedFeatures.count}`);
  console.log(`deleted observations: ${deletedObs.count}`);
  console.log(`SESSION observations remaining: ${total - deletedObs.count}`);
  console.log('\nnow re-run: yarn db:backfill:session-observations');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
