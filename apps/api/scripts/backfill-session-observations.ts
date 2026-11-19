/**
 * Rebuilds SESSION observations from the stored Activity history.
 *
 * The Garmin sync only creates observations for activities it sees live, so the
 * Core's feature pipeline covered a fraction of the history (38 observations for
 * 303 activities when this was written). Everything needed is already in the
 * database: Activity rows plus the cached ActivityStream for heart rate on sports
 * with no avgHr column.
 *
 * Idempotent: the observation engine deduplicates SESSION observations by
 * externalId, so re-running skips what already exists.
 *
 * Usage:
 *   yarn db:backfill:session-observations --dry-run
 *   yarn db:backfill:session-observations
 */
import { PrismaClient } from '@prisma/client';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { storedActivityToSession } from '@sharpit/server/lib/observation/activity-to-session';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const ATHLETE_ID = 'default';

/** Mean and peak of the heart-rate series in a cached stream payload. */
function heartRateFromStream(data: unknown): { avg: number | null; max: number | null } {
  if (!data || typeof data !== 'object') {
    return { avg: null, max: null };
  }

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!/hr|heart/i.test(key) || !Array.isArray(value)) {
      continue;
    }

    const samples = value
      .map((v) => (typeof v === 'number' ? v : Number((v as Record<string, unknown>)?.value)))
      // Physiological bounds: drops dropouts and sensor spikes alike.
      .filter((n) => Number.isFinite(n) && n > 60 && n < 240);

    if (samples.length < 60) {
      continue;
    }
    return {
      avg: samples.reduce((sum, n) => sum + n, 0) / samples.length,
      max: Math.max(...samples),
    };
  }
  return { avg: null, max: null };
}

type BackfillOutcome = {
  mapped: number;
  skippedNoDuration: number;
  withHr: number;
  withPower: number;
  ingested: number;
  failed: number;
};

function createBackfillOutcome(): BackfillOutcome {
  return {
    mapped: 0,
    skippedNoDuration: 0,
    withHr: 0,
    withPower: 0,
    ingested: 0,
    failed: 0,
  };
}

function trackMappedSession(
  outcome: BackfillOutcome,
  bySport: Map<string, number>,
  session: NonNullable<ReturnType<typeof storedActivityToSession>>,
) {
  outcome.mapped += 1;
  if (session.hrData) {
    outcome.withHr += 1;
  }
  if (session.powerData) {
    outcome.withPower += 1;
  }
  bySport.set(session.sportType, (bySport.get(session.sportType) ?? 0) + 1);
}

async function ingestMappedSession(
  activityId: string,
  session: NonNullable<ReturnType<typeof storedActivityToSession>>,
  outcome: BackfillOutcome,
) {
  try {
    await observationEngine.ingest(ATHLETE_ID, session);
    outcome.ingested += 1;
  } catch (error) {
    outcome.failed += 1;
    console.error(`[backfill] ingest failed for activity ${activityId}`, error);
  }
}

function printBackfillSummary(outcome: BackfillOutcome, bySport: Map<string, number>) {
  console.log(`\nmapped: ${outcome.mapped}`);
  console.log(`skipped (no usable duration): ${outcome.skippedNoDuration}`);
  console.log(`  with HR    (TRIMP tier eligible): ${outcome.withHr}`);
  console.log(`  with power (power tier eligible): ${outcome.withPower}`);
  console.log('\nby sport type:');
  for (const [sport, count] of [...bySport.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${sport.padEnd(12)} ${count}`);
  }
}

async function processActivities(
  activities: Awaited<ReturnType<typeof prisma.activity.findMany>>,
  hrByActivity: Map<string, ReturnType<typeof heartRateFromStream>>,
) {
  const receivedAt = new Date();
  const outcome = createBackfillOutcome();
  const bySport = new Map<string, number>();

  for (const activity of activities) {
    const stream = hrByActivity.get(activity.id);
    const session = storedActivityToSession(activity, {
      avgHrFromStream: stream?.avg ?? null,
      maxHrFromStream: stream?.max ?? null,
      receivedAt,
    });

    if (!session) {
      outcome.skippedNoDuration += 1;
      continue;
    }

    trackMappedSession(outcome, bySport, session);
    if (!dryRun) {
      await ingestMappedSession(activity.id, session, outcome);
    }
  }

  return { outcome, bySport };
}

async function main() {
  const [activities, existingSessions] = await Promise.all([
    prisma.activity.findMany({
      select: {
        id: true,
        type: true,
        date: true,
        duration: true,
        garminId: true,
        stravaId: true,
        title: true,
        runMetrics: {
          select: { avgHr: true, paceSecPerKm: true, distanceM: true, elevationM: true },
        },
        bikeMetrics: {
          select: { avgPower: true, normalizedPower: true, elevationM: true, calories: true },
        },
        swimMetrics: { select: { distanceM: true } },
        hikeMetrics: {
          select: { avgHr: true, distanceM: true, elevationM: true, calories: true },
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.observation.count({ where: { type: 'SESSION' } }),
  ]);

  console.log(`activities: ${activities.length}`);
  console.log(`existing SESSION observations: ${existingSessions}\n`);

  const streams = await prisma.activityStream.findMany({
    where: { activityId: { in: activities.map((a) => a.id) } },
    select: { activityId: true, data: true },
  });
  const hrByActivity = new Map(
    streams.map((s) => [s.activityId, heartRateFromStream(s.data)] as const),
  );
  console.log(`cached streams: ${streams.length}`);

  const { outcome, bySport } = await processActivities(activities, hrByActivity);
  printBackfillSummary(outcome, bySport);

  if (dryRun) {
    console.log('\ndry-run: nothing was written.');
    return;
  }

  const after = await prisma.observation.count({ where: { type: 'SESSION' } });
  console.log(`\ningested: ${outcome.ingested}  failed: ${outcome.failed}`);
  console.log(`SESSION observations: ${existingSessions} -> ${after}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
