import { isUniqueViolation } from '@sharpit/server/lib/prisma-errors';
import type { ActivityType } from '@prisma/client';
import type { IActivity } from '@flow-js/garmin-connect/dist/garmin/types/activity';
import { findMatchingActivity } from '@sharpit/server/lib/activity/list/activity-dedup';
import {
  buildGarminActivityData,
  garminDedupDurations,
  garminEnrichmentUpdate,
  mapGarminType,
} from '@sharpit/server/lib/integrations/garmin/garmin-activities';
import { prisma } from '@sharpit/db/client';
import { unifyMultisportAfterSync } from '@sharpit/server/lib/activity/multisport/unify-multisport';
import { removeManualActivityObservations } from '@sharpit/server/lib/observation/manual-observation-sync';
import { loadActivityFillSnapshot } from '@sharpit/server/lib/activity/list/load-activity-fill-snapshot';
import { isProviderEnabledForClass } from '@sharpit/app/lib/integrations/source-prefs';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import {
  garminLeadsActivities,
  garminMergePatch,
} from '@sharpit/server/lib/integrations/garmin/garmin-merge-policy';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { garminActivityToSession } from '@sharpit/server/adapters/garmin-activity-adapter';

/** The Activity API carries no RPE, feeling nor notes: those stay the athlete's to enter. */
const NO_EVALUATION = { rpe: null, feeling: null, notes: null };

/** Fires an observation into the engine. Errors are logged but never fail the push. */
async function ingestGarminActivity(athleteId: string, activity: IActivity): Promise<void> {
  try {
    const rawSession = garminActivityToSession(activity, new Date());
    if (rawSession) {
      await observationEngine.ingest(athleteId, rawSession);
    }
  } catch (err) {
    console.error('[ObservationEngine] garmin-activity ingest failed:', err);
  }
}

async function removeStravaSessionObservation(athleteId: string, stravaId: string): Promise<void> {
  await prisma.observation.deleteMany({
    where: { athleteId, type: 'SESSION', source: 'STRAVA', externalId: stravaId },
  });
}

export interface GarminActivityIngestResult {
  imported: number;
  updated: number;
  merged: number;
  skipped: number;
  /** Sessions created or changed — for records and the athlete state. */
  changedActivityIds: string[];
  changedTypes: ActivityType[];
}

type Outcome = 'imported' | 'updated' | 'merged' | 'skipped';
type Change = { outcome: Outcome; id?: string; type?: ActivityType };

/** A session pushed again (synced from a second device, edited on Connect): its row follows. */
async function updateOwnGarminRow(
  row: { id: string; stravaId: string | null; source: string },
  activity: IActivity,
  type: ActivityType,
): Promise<Change> {
  const existing = await loadActivityFillSnapshot(row.id);
  const enrichment = garminEnrichmentUpdate(
    activity,
    NO_EVALUATION,
    type,
    row.stravaId,
    row.source,
  );
  const patch = existing ? garminMergePatch(existing, enrichment, true) : enrichment;
  await prisma.activity.update({ where: { id: row.id }, data: patch });
  return { outcome: 'updated', id: row.id, type };
}

async function mergeIntoMatch(
  athleteId: string,
  match: NonNullable<Awaited<ReturnType<typeof findMatchingActivity>>>,
  activity: IActivity,
  type: ActivityType,
): Promise<Change> {
  const garminId = String(activity.activityId);
  if (match.garminId && match.garminId !== garminId) {
    return { outcome: 'skipped' };
  }
  const [prefs, existing] = await Promise.all([
    loadResolvedSourcePrefs(athleteId),
    loadActivityFillSnapshot(match.id),
  ]);
  const leads = garminLeadsActivities(prefs);
  const enrichment = garminEnrichmentUpdate(
    activity,
    NO_EVALUATION,
    type,
    match.stravaId,
    match.source,
  );
  await prisma.activity.update({
    where: { id: match.id },
    data: existing ? garminMergePatch(existing, enrichment, leads) : enrichment,
  });
  // One session, one load in the Core. Leading, Garmin's session replaces what the first source
  // sent — Apple Health's (no provider id, ADR-054) and Strava's (its own externalId, which the
  // engine's dedup cannot match). Behind another primary, that first session keeps counting.
  if (leads && !match.garminId) {
    await removeManualActivityObservations(athleteId, match.id);
    if (match.stravaId) {
      await removeStravaSessionObservation(athleteId, match.stravaId);
    }
  }
  // An absorbed leg's load is counted by its parent (unification dropped its observation).
  if (leads && !match.mergedIntoId) {
    await ingestGarminActivity(athleteId, activity);
  }
  return { outcome: 'merged', id: match.id, type };
}

async function importNew(
  athleteId: string,
  activity: IActivity,
  type: ActivityType,
): Promise<Change> {
  try {
    const created = await prisma.activity.create({
      data: { ...buildGarminActivityData(activity, NO_EVALUATION, type), athleteId },
    });
    await ingestGarminActivity(athleteId, activity);
    return { outcome: 'imported', id: created.id, type };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { outcome: 'skipped' };
    }
    throw error;
  }
}

async function ingestOne(athleteId: string, activity: IActivity): Promise<Change> {
  const type = mapGarminType(activity.activityType?.typeKey ?? '');
  if (!type) {
    return { outcome: 'skipped' };
  }
  const garminId = String(activity.activityId);
  const own = await prisma.activity.findFirst({
    where: { garminId, athleteId },
    select: { id: true, stravaId: true, source: true },
  });
  if (own) {
    return updateOwnGarminRow(own, activity, type);
  }
  const { duration, altDurations } = garminDedupDurations(activity, type);
  const match = await findMatchingActivity(athleteId, {
    type,
    date: new Date(activity.startTimeLocal),
    duration,
    altDurations,
    distanceM: activity.distance > 0 ? activity.distance : null,
    garminId,
  });
  return match
    ? mergeIntoMatch(athleteId, match, activity, type)
    : importNew(athleteId, activity, type);
}

/**
 * Imports or merges the sessions Garmin pushed (Activity API), in order: a session another
 * source recorded first is merged under the athlete's activities primary (ADR-103).
 */
export async function ingestGarminActivities(
  athleteId: string,
  activities: IActivity[],
): Promise<GarminActivityIngestResult> {
  const result: GarminActivityIngestResult = {
    imported: 0,
    updated: 0,
    merged: 0,
    skipped: 0,
    changedActivityIds: [],
    changedTypes: [],
  };
  const prefs = await loadResolvedSourcePrefs(athleteId);
  if (!isProviderEnabledForClass(prefs, 'activities', 'garmin')) {
    result.skipped = activities.length;
    return result;
  }
  for (const activity of activities) {
    const change = await ingestOne(athleteId, activity);
    result[change.outcome] += 1;
    if (change.id && change.type) {
      result.changedActivityIds.push(change.id);
      result.changedTypes.push(change.type);
    }
  }
  if (result.changedActivityIds.length > 0) {
    await unifyMultisportAfterSync(athleteId, result.changedActivityIds);
    await prisma.garminAccount.updateMany({
      where: { athleteId },
      data: { lastActivitySyncAt: new Date() },
    });
  }
  return result;
}
