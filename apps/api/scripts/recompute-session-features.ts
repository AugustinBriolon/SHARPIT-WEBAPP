/**
 * Recomputes SESSION features for the whole history and drops the unusable ones.
 *
 * Needed because the event bus dispatched a routing-only observation to the
 * FeatureEngine, which extracted from it directly instead of loading the body. Every
 * session ingested through that path produced tssScore: null with a
 * DURATION_FACTOR tag and confidence 0.25. Those rows carry no information and
 * cannot be repaired in place — they are recomputed from their observation.
 *
 * Safe to re-run: recomputation writes a new version per session, and only rows
 * whose tssScore is null are ever deleted.
 *
 * Usage:
 *   yarn db:recompute:session-features --dry-run
 *   yarn db:recompute:session-features
 */
// The shared client: it reaches Neon over WebSocket where a proxy blocks Postgres' port.
import { prisma } from '@sharpit/db/client';
import { featureEngine } from '@sharpit/server/lib/engines/feature-engine';

const dryRun = process.argv.includes('--dry-run');
const ATHLETE_ID = 'default';

function isUnusable(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return true;
  }
  const d = data as Record<string, unknown>;
  return d.tssScore === null || d.durationSec === null || d.sportType === null;
}

async function main() {
  const observations = await prisma.observation.findMany({
    where: { type: 'SESSION', athleteId: ATHLETE_ID, externalId: { not: null } },
    select: { externalId: true },
    orderBy: { timestamp: 'asc' },
  });

  const before = await prisma.featureSet.findMany({
    where: { category: 'SESSION', athleteId: ATHLETE_ID },
    select: { id: true, data: true },
  });
  const unusableBefore = before.filter((r) => isUnusable(r.data));

  console.log(`SESSION observations with an externalId: ${observations.length}`);
  console.log(`SESSION feature sets: ${before.length} (${unusableBefore.length} unusable)\n`);

  if (dryRun) {
    console.log('dry-run: nothing recomputed, nothing deleted.');
    return;
  }

  let refreshed = 0;
  let missing = 0;
  let failed = 0;

  for (const { externalId } of observations) {
    try {
      const ok = await featureEngine.refreshSessionFeaturesForExternalId(ATHLETE_ID, externalId!);
      if (ok) {
        refreshed += 1;
      } else {
        missing += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`[recompute] failed for externalId ${externalId}`, error);
    }
  }

  console.log(`recomputed: ${refreshed}  no observation: ${missing}  failed: ${failed}`);

  const after = await prisma.featureSet.findMany({
    where: { category: 'SESSION', athleteId: ATHLETE_ID },
    select: { id: true, data: true },
  });
  const unusable = after.filter((r) => isUnusable(r.data));

  if (unusable.length > 0) {
    const { count } = await prisma.featureSet.deleteMany({
      where: { id: { in: unusable.map((r) => r.id) } },
    });
    console.log(`deleted ${count} unusable feature set(s)`);
  }

  const remaining = await prisma.featureSet.count({
    where: { category: 'SESSION', athleteId: ATHLETE_ID },
  });
  console.log(`SESSION feature sets: ${before.length} -> ${remaining}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
