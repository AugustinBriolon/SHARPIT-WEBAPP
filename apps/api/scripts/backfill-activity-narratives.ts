/**
 * Génère les analyses narratives manquantes depuis le 29 juin 2026.
 *
 * Usage :
 *   yarn db:backfill:narratives
 *   yarn db:backfill:narratives --dry-run
 */
import { ActivityType, PrismaClient } from '@prisma/client';
import { format } from 'date-fns';
import { NARRATIVE_ANALYSIS_SINCE } from '@sharpit/server/lib/activity-narrative-config';
import { backfillActivityNarratives } from '@sharpit/server/lib/activity-narrative';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const pending = await prisma.activity.count({
    where: {
      narrativeAnalyzedAt: null,
      date: { gte: NARRATIVE_ANALYSIS_SINCE },
      type: { in: [ActivityType.RUN, ActivityType.BIKE, ActivityType.SWIM] },
    },
  });

  console.log(
    `Analyses narratives à générer depuis le ${format(NARRATIVE_ANALYSIS_SINCE, 'yyyy-MM-dd')} : ${pending}`,
  );

  if (dryRun) {
    console.log('Mode dry-run : aucune génération lancée.');
    return;
  }

  const { eligible, created } = await backfillActivityNarratives();
  console.log(`Terminé : ${created}/${eligible} analyse(s) créée(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
