/**
 * One-off repair: removes the second SESSION observation an outing was left with (a manual
 * session written beside a provider's on every edit, or a Strava session kept beside Garmin's
 * before 2026-10-24). The load adds sessions up, so each one counted the outing again.
 *
 * Observations are rebuilt from Activity rows and are not a source record; the athlete's
 * reported effort is kept and moved to the session that stays. The run prints what it would do
 * and changes nothing unless `--apply` is given, and `--apply` first writes every row it is
 * about to change to the `--backup` file.
 *
 * Usage:
 *   yarn tsx scripts/remove-duplicate-session-observations.ts [--athlete <id>]
 *   yarn tsx scripts/remove-duplicate-session-observations.ts --apply --backup <file.json>
 */
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { planDuplicateSessionRemoval } from '@sharpit/server/lib/observation/duplicate-session-observations';

const prisma = new PrismaClient();
const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const apply = process.argv.includes('--apply');

async function repairAthlete(athleteId: string, backup: unknown[]): Promise<void> {
  const [activities, observations] = await Promise.all([
    prisma.activity.findMany({
      where: { athleteId },
      select: { id: true, garminId: true, stravaId: true },
    }),
    prisma.observation.findMany({
      where: { athleteId, type: 'SESSION' },
      select: { id: true, source: true, externalId: true, trainingDayId: true },
    }),
  ]);
  const plan = planDuplicateSessionRemoval(activities, observations);
  if (plan.remove.length === 0) {
    return;
  }

  const removeIds = plan.remove.map((observation) => observation.id);
  const movedTo = new Map(plan.relink.map((link) => [link.from, link.to]));
  const reports = (
    await prisma.observation.findMany({ where: { athleteId, type: 'SUBJECTIVE' } })
  ).filter((row) =>
    movedTo.has((row.data as { sessionExternalId?: string }).sessionExternalId ?? ''),
  );
  const [earliestDay] = observations
    .filter((observation) => removeIds.includes(observation.id))
    .map((observation) => observation.trainingDayId)
    .sort();

  console.log(
    `${athleteId}: ${plan.remove.length} duplicate session(s), ${reports.length} reported effort(s) to move, load recomputed from ${earliestDay}`,
  );
  if (!apply) {
    return;
  }

  backup.push({
    athleteId,
    observations: await prisma.observation.findMany({ where: { id: { in: removeIds } } }),
    reports,
  });
  await prisma.$transaction([
    ...reports.map((row) => {
      const data = row.data as Record<string, unknown>;
      return prisma.observation.update({
        where: { id: row.id },
        data: { data: { ...data, sessionExternalId: movedTo.get(String(data.sessionExternalId)) } },
      });
    }),
    prisma.observation.deleteMany({ where: { id: { in: removeIds } } }),
    // The sessions that gain a reported effort, and every load from the first changed day on,
    // are computed again on the next read.
    prisma.featureSet.updateMany({
      where: {
        athleteId,
        status: 'COMPUTED',
        OR: [
          { category: 'LOAD', trainingDayId: { gte: earliestDay } },
          { category: 'SESSION', trainingDayId: { in: reports.map((row) => row.trainingDayId) } },
        ],
      },
      data: { status: 'INVALIDATED' },
    }),
  ]);
}

async function main() {
  const backupFile = arg('backup');
  if (apply && !backupFile) {
    console.error('--apply needs --backup <file.json>');
    process.exitCode = 1;
    return;
  }
  const only = arg('athlete');
  const athletes = only
    ? [{ id: only }]
    : await prisma.athleteProfile.findMany({ select: { id: true } });
  const backup: unknown[] = [];
  for (const athlete of athletes) {
    await repairAthlete(athlete.id, backup);
  }
  if (apply && backupFile) {
    await writeFile(backupFile, JSON.stringify(backup, null, 2));
    console.log(`\nbackup written to ${backupFile}`);
  } else {
    console.log('\ndry-run: nothing changed. Re-run with --apply --backup <file.json>.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
