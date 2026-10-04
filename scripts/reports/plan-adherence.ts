/**
 * The product's outcome, read from the database: the share of athletes who did at least 70 % of
 * their planned sessions over their first four weeks (positioning 2026-10-02). Read-only; prints
 * athlete ids, never names.
 *
 *   DATABASE_URL='<prod>' yarn tsx scripts/reports/plan-adherence.ts
 */
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { prisma } from '@sharpit/db/client';
import { loadOutcomeReport } from '@sharpit/server/lib/planned-session/adherence/plan-adherence-service';

const percent = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)} %`);

function targetLabel(meetsTarget: boolean | null): string {
  if (meetsTarget === null) {
    return '—';
  }
  return meetsTarget ? 'met' : 'missed';
}

async function main() {
  const report = await loadOutcomeReport(trainingDayIdForNow());
  console.table(
    report.rows.map((row) => ({
      athlete: row.athleteId,
      start: row.start,
      planned: row.planned,
      done: row.done,
      rate: percent(row.rate),
      window: row.complete ? '4 weeks done' : 'in progress',
      target: targetLabel(row.meetsTarget),
    })),
  );
  console.log(
    `Outcome: ${report.meetingTarget} of ${report.finished} athletes past their first four weeks ` +
      `reached ${percent(report.target)} (${percent(report.share)}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
