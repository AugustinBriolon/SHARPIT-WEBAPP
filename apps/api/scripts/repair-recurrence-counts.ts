/**
 * Resets each sensitive zone's relapse count to what its episodes say: one relapse per
 * episode after the first. The inference used to add one on every daily run while a
 * resolved zone hurt again, so stored counts ran far above the real number.
 *
 * Read-only unless --apply is passed.
 * Usage:
 *   yarn tsx scripts/repair-recurrence-counts.ts
 *   yarn tsx scripts/repair-recurrence-counts.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

/** Relapses a zone with this many episodes has had. */
function relapsesFromEpisodes(episodeCount: number): number {
  return Math.max(0, episodeCount - 1);
}

async function main() {
  const conditions = await prisma.condition.findMany({
    select: { id: true, recurrenceCount: true, _count: { select: { episodes: true } } },
  });
  const wrong = conditions.filter(
    (condition) => condition.recurrenceCount !== relapsesFromEpisodes(condition._count.episodes),
  );
  console.log(`Zones read: ${conditions.length}. With a wrong relapse count: ${wrong.length}.`);
  for (const condition of wrong) {
    const expected = relapsesFromEpisodes(condition._count.episodes);
    console.log(`  ${condition.id}: ${condition.recurrenceCount} → ${expected}`);
    if (apply) {
      await prisma.condition.update({
        where: { id: condition.id },
        data: { recurrenceCount: expected },
      });
    }
  }
  console.log(apply ? 'Counts written.' : 'Dry run: nothing written. Pass --apply to write.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
