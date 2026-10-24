import { NextRequest, NextResponse } from 'next/server';
import { onProviderSyncCompleted } from '@sharpit/server/lib/athlete-state/orchestrator';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { syncGarminActivities } from '@sharpit/server/lib/integrations/garmin/garmin-activity-sync';
import { syncGarminHealth } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { isProviderAuthFailure } from '@sharpit/server/lib/integrations/shared/connection-status';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import {
  filterRecordChangesByActivities,
  updateRecordsForTypes,
} from '@sharpit/server/lib/training/records/records';

async function parseFullSyncFlag(request: NextRequest) {
  try {
    const body = await request.json();
    return Boolean(body?.full);
  } catch {
    return false;
  }
}

async function updateRecordChanges(
  athleteId: string,
  activities: Awaited<ReturnType<typeof syncGarminActivities>>,
) {
  if (activities.changedTypes.length === 0) {
    return [];
  }
  const allChanges = await updateRecordsForTypes(athleteId, activities.changedTypes);
  return filterRecordChangesByActivities(allChanges, activities.changedActivityIds);
}

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const rateLimit = await checkRateLimit(rateLimiters.providerSync, `${athleteId}:garmin`, {
      failClosed: true,
    });
    if (!rateLimit.ok) {
      const limited = rateLimitJsonResponse(rateLimit);
      return NextResponse.json(limited.body, {
        status: limited.status,
      });
    }
    const full = await parseFullSyncFlag(request);
    const syncOptions = full ? { full: true as const } : {};

    const [health, activities] = await Promise.all([
      syncGarminHealth(athleteId, syncOptions),
      syncGarminActivities(athleteId, syncOptions),
    ]);

    const recordChanges = await updateRecordChanges(athleteId, activities);

    await onProviderSyncCompleted(
      athleteId,
      [
        {
          provider: 'garmin',
          imported: activities.imported,
          updated: activities.updated + activities.merged,
          observationCount: health.updated,
          activityIds: activities.importedActivityIds,
        },
      ],
      undefined,
      { skipRecordUpdate: activities.changedTypes.length > 0 },
    );
    return NextResponse.json({ ...health, activities, recordChanges });
  } catch (error) {
    logSafeError('api/garmin/sync', error);
    const message = error instanceof Error ? error.message : 'Synchronisation échouée';
    return NextResponse.json(
      { error: message },
      { status: isProviderAuthFailure(error) ? 401 : 500 },
    );
  }
}
