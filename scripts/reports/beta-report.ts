/**
 * The beta's weekly report — the one mailed every Monday to FEEDBACK_EMAIL — printed on demand.
 * Read-only; athlete ids only.
 *
 *   DATABASE_URL='<prod>' yarn tsx scripts/reports/beta-report.ts
 */
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { prisma } from '@sharpit/db/client';
import { loadWeeklyBetaReport } from '@sharpit/server/lib/reports/weekly-beta-report';

loadWeeklyBetaReport(trainingDayIdForNow())
  .then((report) => console.log(`${report.subject}\n\n${report.text}`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
