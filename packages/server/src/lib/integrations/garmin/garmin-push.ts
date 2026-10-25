import type { Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { onProviderSyncCompleted } from '@sharpit/server/lib/athlete-state/orchestrator';
import { persistStream } from '@sharpit/server/lib/streams/streams';
import type { GarminDailyHealth } from '@sharpit/server/lib/integrations/garmin/garmin';
import { processActivityFiles } from '@sharpit/server/lib/integrations/garmin/garmin-activity-files';
import { ingestGarminActivities } from '@sharpit/server/lib/integrations/garmin/garmin-activity-sync';
import {
  isGarminSessionActivity,
  pushedActivityToConnect,
  pushedBodyCompToHealth,
  pushedDailyToHealth,
  pushedDetailsToRawStreams,
  pushedHrvToHealth,
  pushedSleepToHealth,
  pushedUserMetricsToProfile,
} from '@sharpit/server/lib/integrations/garmin/garmin-push-mappers';
import {
  forgetGarminUser,
  getGarminAccountByUserId,
  updateGarminPermissions,
  writeGarminHealthDay,
} from '@sharpit/server/lib/integrations/garmin/garmin-sync';

type Json = Record<string, unknown>;

const HEALTH_MAPPERS: Record<string, (item: Json) => GarminDailyHealth | null> = {
  dailies: pushedDailyToHealth,
  sleeps: pushedSleepToHealth,
  hrv: pushedHrvToHealth,
  bodyComps: pushedBodyCompToHealth,
};

const ACTIVITY_TYPES = new Set(['activities', 'manuallyUpdatedActivities']);

/** Every summary type SharpIt handles; the others are acknowledged and dropped. */
export const GARMIN_PUSH_TYPES = new Set([
  ...Object.keys(HEALTH_MAPPERS),
  ...ACTIVITY_TYPES,
  'activityDetails',
  'activityFiles',
  'userMetrics',
  'deregistrations',
  'userPermissionsChange',
]);

/**
 * Keeps each summary list of a push as one inbox row and returns their ids. Called before the
 * 200: Garmin requires the answer within 30 s, and processing must never lose the data.
 */
export async function receiveGarminPush(body: unknown): Promise<string[]> {
  if (!body || typeof body !== 'object') {
    return [];
  }
  const ids: string[] = [];
  for (const [summaryType, items] of Object.entries(body as Json)) {
    if (!GARMIN_PUSH_TYPES.has(summaryType) || !Array.isArray(items) || items.length === 0) {
      continue;
    }
    const row = await prisma.garminPushInbox.create({
      data: { summaryType, payload: items as Prisma.InputJsonValue },
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}

function itemsByUser(items: Json[]): Map<string, Json[]> {
  const byUser = new Map<string, Json[]>();
  for (const item of items) {
    if (typeof item.userId === 'string') {
      byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item]);
    }
  }
  return byUser;
}

async function processHealth(athleteId: string, summaryType: string, items: Json[]) {
  const map = HEALTH_MAPPERS[summaryType];
  let updated = 0;
  for (const item of items) {
    const day = map(item);
    if (day && (await writeGarminHealthDay(athleteId, day)) === 'updated') {
      updated += 1;
    }
  }
  return { imported: 0, updated, observationCount: updated, activityIds: [] as string[] };
}

async function processActivities(athleteId: string, items: Json[]) {
  const activities = items
    .filter(isGarminSessionActivity)
    .map(pushedActivityToConnect)
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const result = await ingestGarminActivities(athleteId, activities);
  return {
    imported: result.imported,
    updated: result.updated + result.merged,
    observationCount: 0,
    activityIds: result.changedActivityIds,
  };
}

/** Details carry their own summary: the session is imported first, then its series attached. */
async function processDetails(athleteId: string, items: Json[]) {
  const sessions = items.map((item) => ({
    ...((item.summary ?? {}) as Json),
    activityId: item.activityId,
    summaryId: item.summaryId,
  }));
  const outcome = await processActivities(athleteId, sessions);
  for (const item of items) {
    const raw = pushedDetailsToRawStreams(item);
    const row = raw
      ? await prisma.activity.findFirst({
          where: { athleteId, garminId: String(item.activityId) },
          select: { id: true },
        })
      : null;
    if (row && raw) {
      await persistStream(athleteId, row.id, raw);
    }
  }
  return outcome;
}

async function processUserMetrics(athleteId: string, items: Json[]) {
  const latest = pushedUserMetricsToProfile(items.at(-1) ?? {});
  const data = Object.fromEntries(Object.entries(latest).filter(([, v]) => v !== null));
  if (Object.keys(data).length > 0) {
    await prisma.athleteProfile.update({ where: { id: athleteId }, data });
  }
  return null;
}

async function processForAthlete(athleteId: string, summaryType: string, items: Json[]) {
  if (summaryType in HEALTH_MAPPERS) {
    return processHealth(athleteId, summaryType, items);
  }
  if (ACTIVITY_TYPES.has(summaryType)) {
    return processActivities(athleteId, items);
  }
  if (summaryType === 'activityDetails') {
    return processDetails(athleteId, items);
  }
  if (summaryType === 'activityFiles') {
    await processActivityFiles(athleteId, items);
    return null;
  }
  if (summaryType === 'userMetrics') {
    return processUserMetrics(athleteId, items);
  }
  return null;
}

async function processAccountEvent(summaryType: string, garminUserId: string, items: Json[]) {
  if (summaryType === 'deregistrations') {
    await forgetGarminUser(garminUserId);
    return true;
  }
  if (summaryType === 'userPermissionsChange') {
    const permissions = items.at(-1)?.permissions;
    await updateGarminPermissions(
      garminUserId,
      Array.isArray(permissions) ? permissions.filter((p) => typeof p === 'string') : [],
    );
    return true;
  }
  return false;
}

/** Applies one inbox row. Data for a Garmin user no athlete is linked to is dropped. */
async function applyGarminPush(summaryType: string, items: Json[]): Promise<void> {
  for (const [garminUserId, userItems] of itemsByUser(items)) {
    if (await processAccountEvent(summaryType, garminUserId, userItems)) {
      continue;
    }
    const account = await getGarminAccountByUserId(garminUserId);
    if (!account) {
      continue;
    }
    const sync = await processForAthlete(account.athleteId, summaryType, userItems);
    if (sync && (sync.activityIds.length > 0 || sync.observationCount > 0)) {
      await onProviderSyncCompleted(account.athleteId, [{ provider: 'garmin', ...sync }]);
    }
  }
}

export async function processGarminPushRow(id: string): Promise<void> {
  const row = await prisma.garminPushInbox.findUnique({ where: { id } });
  if (!row || row.processedAt) {
    return;
  }
  try {
    await applyGarminPush(row.summaryType, row.payload as Json[]);
    await prisma.garminPushInbox.update({ where: { id }, data: { processedAt: new Date() } });
  } catch (error) {
    await prisma.garminPushInbox.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
      },
    });
    throw error;
  }
}

/** Replays rows a crash or a timeout left unprocessed; gives up on a row after five tries. */
export async function replayGarminPushInbox(limit = 50): Promise<number> {
  const rows = await prisma.garminPushInbox.findMany({
    where: { processedAt: null, attempts: { lt: 5 } },
    orderBy: { receivedAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  let processed = 0;
  for (const { id } of rows) {
    try {
      await processGarminPushRow(id);
      processed += 1;
    } catch (error) {
      console.error('[garmin-push] replay failed', { id, name: (error as Error)?.name });
    }
  }
  return processed;
}
