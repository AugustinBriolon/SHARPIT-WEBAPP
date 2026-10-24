import { ActivityType } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { prisma } from '@sharpit/db/client';
import { rawStreamsHaveSignal } from '@sharpit/server/lib/integrations/garmin/garmin-streams';
import { fetchAndCacheActivityStreams } from '@sharpit/server/lib/streams/streams';

/**
 * Backfill progressif des streams (Garmin prioritaire, Strava en secours).
 *
 * Les streams ne sont récupérés qu'à l'ouverture d'une activité ou via ce job.
 * On traite un petit lot par exécution et on s'arrête proprement dès qu'un appel
 * échoue (rate-limit, token…), laissant le reste pour la prochaine fois.
 */

export interface BackfillResult {
  processed: number;
  withData: number;
  remaining: number;
  stopped: 'done' | 'rate_limited' | 'batch_full';
  activityIdsWithData: string[];
}

const BACKFILL_TYPES: ActivityType[] = [ActivityType.RUN, ActivityType.BIKE];

/** Lot cron — petit pour limiter le transfert réseau Neon (streams JSON lourds). */
export const CRON_BACKFILL_BATCH = 8;

function backfillWhere(athleteId: string) {
  return {
    athleteId,
    type: { in: BACKFILL_TYPES },
    stream: null,
    OR: [{ garminId: { not: null } }, { stravaId: { not: null } }],
  };
}

export async function countStreamBackfillCandidates(athleteId: string): Promise<number> {
  return prisma.activity.count({ where: backfillWhere(athleteId) });
}

async function processBackfillCandidate(
  athleteId: string,
  activity: { id: string; garminId: string | null; stravaId: string | null },
): Promise<{ processed: boolean; withData: boolean }> {
  if (!activity.garminId && !activity.stravaId) {
    return { processed: false, withData: false };
  }

  const { available, raw } = await fetchAndCacheActivityStreams(athleteId, activity.id, {
    garminId: activity.garminId,
    stravaId: activity.stravaId,
  });

  const withData = available && isSet(raw) && rawStreamsHaveSignal(raw);
  return { processed: true, withData };
}

async function runBackfillBatch(
  athleteId: string,
  candidates: Array<{ id: string; garminId: string | null; stravaId: string | null }>,
): Promise<Pick<BackfillResult, 'processed' | 'withData' | 'stopped' | 'activityIdsWithData'>> {
  const batch: Pick<BackfillResult, 'processed' | 'withData' | 'stopped' | 'activityIdsWithData'> =
    {
      processed: 0,
      withData: 0,
      stopped: 'done',
      activityIdsWithData: [],
    };

  for (const activity of candidates) {
    try {
      const outcome = await processBackfillCandidate(athleteId, activity);
      if (!outcome.processed) {
        continue;
      }
      batch.processed += 1;
      if (outcome.withData) {
        batch.withData += 1;
        batch.activityIdsWithData.push(activity.id);
      }
    } catch (error) {
      console.error('[stream-backfill]', activity.id, error);
      batch.stopped = 'rate_limited';
      break;
    }
  }

  return batch;
}

export async function backfillActivityStreams(
  athleteId: string,
  limit = CRON_BACKFILL_BATCH,
): Promise<BackfillResult> {
  const candidates = await prisma.activity.findMany({
    where: backfillWhere(athleteId),
    orderBy: { date: 'desc' },
    take: limit,
    select: { id: true, garminId: true, stravaId: true },
  });

  if (candidates.length === 0) {
    return {
      processed: 0,
      withData: 0,
      remaining: 0,
      stopped: 'done',
      activityIdsWithData: [],
    };
  }

  const batch = await runBackfillBatch(athleteId, candidates);
  const stopped =
    batch.stopped === 'done' && candidates.length === limit ? 'batch_full' : batch.stopped;

  return {
    ...batch,
    stopped,
    remaining: await countStreamBackfillCandidates(athleteId),
  };
}
