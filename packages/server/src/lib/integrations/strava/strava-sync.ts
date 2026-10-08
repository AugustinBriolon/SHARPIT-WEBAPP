import { ActivityType, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import {
  findMatchingActivity,
  mergedSource,
  sourceIncludes,
} from '@sharpit/server/lib/activity/list/activity-dedup';
import { fillMissingActivityUpdate } from '@sharpit/server/lib/activity/list/activity-fill-missing';
import { loadActivityFillSnapshot } from '@sharpit/server/lib/activity/list/load-activity-fill-snapshot';
import { prisma } from '@sharpit/db/client';
import { syncSinceFromLastSync } from '@sharpit/server/lib/integrations/shared/sync-since';
import { resolveOAuthAccessToken } from '@sharpit/server/lib/integrations/shared/oauth-access-token';
import {
  fetchActivities,
  mapStravaType,
  refreshAccessToken,
  type StravaActivity,
} from '@sharpit/server/lib/integrations/strava/strava';
import { stravaWallClockStart } from '@sharpit/server/lib/integrations/strava/strava-time';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { stravaActivityToSession } from '@sharpit/server/adapters/strava-adapter';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import { encryptSecret } from '@sharpit/server/lib/secret-box';
import { removeManualActivityObservations } from '@sharpit/server/lib/observation/manual-observation-sync';

/** Parallel DB upserts for Strava candidates within a page. */
export const STRAVA_ACTIVITY_CONCURRENCY = 6;

const DEFAULT_ATHLETE_TIME_ZONE = 'Europe/Paris';

async function athleteTimeZone(athleteId: string): Promise<string> {
  const google = await prisma.googleAccount.findUnique({
    where: { athleteId },
    select: { timeZone: true },
  });
  return google?.timeZone ?? DEFAULT_ATHLETE_TIME_ZONE;
}

async function ingestStravaActivity(athleteId: string, activity: StravaActivity): Promise<void> {
  try {
    const raw = stravaActivityToSession(activity, new Date());
    if (!raw) {
      return;
    }
    await observationEngine.ingest(athleteId, raw);
  } catch (err) {
    console.error('[ObservationEngine] strava ingest failed:', err);
  }
}

export async function getStravaAccount(athleteId: string) {
  return prisma.stravaAccount.findUnique({ where: { athleteId } });
}

export async function disconnectStrava(athleteId: string) {
  await prisma.stravaAccount.deleteMany({ where: { athleteId } });
}

/** Keeps the Strava profile row so the hub can ask for a reconnect. */
export async function revokeStravaCredentials(athleteId: string) {
  const account = await getStravaAccount(athleteId);
  if (!account) {
    return;
  }
  await prisma.stravaAccount.update({
    where: { athleteId },
    data: {
      accessTokenEnc: '',
      refreshTokenEnc: '',
      expiresAt: new Date(0),
    },
  });
}

export async function getValidAccessToken(athleteId: string) {
  const account = await getStravaAccount(athleteId);
  if (!account) {
    throw new Error('Compte Strava non connecté');
  }

  return resolveOAuthAccessToken({
    athleteId,
    account,
    reconnectMessage: 'Session Strava expirée. Reconnecte Strava dans les paramètres.',
    revoke: revokeStravaCredentials,
    refresh: refreshAccessToken,
    extractAccessToken: (refreshed) => refreshed.access_token,
    persist: async (refreshed) => {
      await prisma.stravaAccount.update({
        where: { athleteId },
        data: {
          accessTokenEnc: encryptSecret(refreshed.access_token),
          refreshTokenEnc: encryptSecret(refreshed.refresh_token),
          expiresAt: new Date(refreshed.expires_at * 1000),
        },
      });
    },
  });
}

function stravaPaceSecPerKm(strava: StravaActivity): number | null {
  return strava.average_speed && strava.average_speed > 0 ? 1000 / strava.average_speed : null;
}

function attachStravaRunMetrics(
  base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>,
  strava: StravaActivity,
): void {
  base.runMetrics = {
    create: {
      distanceM: strava.distance || null,
      elevationM: strava.total_elevation_gain || null,
      paceSecPerKm: stravaPaceSecPerKm(strava),
      avgHr: strava.average_heartrate ? Math.round(strava.average_heartrate) : null,
      avgPower: strava.average_watts ?? null,
      cadence: strava.average_cadence ? Math.round(strava.average_cadence * 2) : null,
    },
  };
}

function attachStravaBikeMetrics(
  base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>,
  strava: StravaActivity,
): void {
  base.bikeMetrics = {
    create: {
      distanceM: strava.distance || null,
      normalizedPower: strava.weighted_average_watts ?? null,
      avgPower: strava.average_watts ?? null,
      avgCadence: strava.average_cadence ? Math.round(strava.average_cadence) : null,
      elevationM: strava.total_elevation_gain || null,
      calories: strava.kilojoules ? Math.round(strava.kilojoules) : null,
      tss: strava.suffer_score ?? null,
    },
  };
}

function attachStravaSwimMetrics(
  base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>,
  strava: StravaActivity,
): void {
  base.swimMetrics = {
    create: {
      distanceM: strava.distance || null,
      avgPaceSecPer100m:
        strava.average_speed && strava.average_speed > 0 ? 100 / strava.average_speed : null,
    },
  };
}

const STRAVA_SPORT_METRIC_ATTACHERS: Partial<
  Record<
    ActivityType,
    (base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>, strava: StravaActivity) => void
  >
> = {
  [ActivityType.RUN]: attachStravaRunMetrics,
  [ActivityType.BIKE]: attachStravaBikeMetrics,
  [ActivityType.SWIM]: attachStravaSwimMetrics,
};

function buildActivityData(
  strava: StravaActivity,
  type: ActivityType,
  timeZone: string,
): Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> {
  const base: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> = {
    type,
    date: stravaWallClockStart(strava, timeZone),
    title: strava.name,
    duration: strava.moving_time || strava.elapsed_time || null,
    load: strava.suffer_score ?? null,
    source: 'strava',
    stravaId: String(strava.id),
  };

  STRAVA_SPORT_METRIC_ATTACHERS[type]?.(base, strava);
  return base;
}

function stravaRunEnrichmentCreate(strava: StravaActivity, paceSecPerKm: number | null) {
  return {
    distanceM: strava.distance || null,
    elevationM: strava.total_elevation_gain || null,
    paceSecPerKm,
    avgHr: strava.average_heartrate ? Math.round(strava.average_heartrate) : null,
    avgPower: strava.average_watts ?? null,
    cadence: strava.average_cadence ? Math.round(strava.average_cadence * 2) : null,
  };
}

function stravaRunEnrichmentUpdate(strava: StravaActivity, paceSecPerKm: number | null) {
  return {
    distanceM: strava.distance || undefined,
    elevationM: strava.total_elevation_gain || undefined,
    paceSecPerKm: paceSecPerKm ?? undefined,
    avgHr: strava.average_heartrate ? Math.round(strava.average_heartrate) : undefined,
    avgPower: strava.average_watts ?? undefined,
    cadence: strava.average_cadence ? Math.round(strava.average_cadence * 2) : undefined,
  };
}

function enrichStravaRunMetrics(data: Prisma.ActivityUpdateInput, strava: StravaActivity): void {
  const paceSecPerKm = stravaPaceSecPerKm(strava);
  data.runMetrics = {
    upsert: {
      create: stravaRunEnrichmentCreate(strava, paceSecPerKm),
      update: stravaRunEnrichmentUpdate(strava, paceSecPerKm),
    },
  };
}

function stravaBikeEnrichmentCreate(strava: StravaActivity) {
  return {
    distanceM: strava.distance || null,
    normalizedPower: strava.weighted_average_watts ?? null,
    avgPower: strava.average_watts ?? null,
    avgCadence: strava.average_cadence ? Math.round(strava.average_cadence) : null,
    elevationM: strava.total_elevation_gain || null,
    calories: strava.kilojoules ? Math.round(strava.kilojoules) : null,
    tss: strava.suffer_score ?? null,
  };
}

function stravaBikeEnrichmentUpdate(strava: StravaActivity) {
  return {
    distanceM: strava.distance || undefined,
    normalizedPower: strava.weighted_average_watts ?? undefined,
    avgPower: strava.average_watts ?? undefined,
    avgCadence: strava.average_cadence ? Math.round(strava.average_cadence) : undefined,
    elevationM: strava.total_elevation_gain || undefined,
    tss: strava.suffer_score ?? undefined,
  };
}

function enrichStravaBikeMetrics(data: Prisma.ActivityUpdateInput, strava: StravaActivity): void {
  data.bikeMetrics = {
    upsert: {
      create: stravaBikeEnrichmentCreate(strava),
      update: stravaBikeEnrichmentUpdate(strava),
    },
  };
}

function enrichStravaSwimMetrics(data: Prisma.ActivityUpdateInput, strava: StravaActivity): void {
  data.swimMetrics = {
    upsert: {
      create: {
        distanceM: strava.distance || null,
        avgPaceSecPer100m:
          strava.average_speed && strava.average_speed > 0 ? 100 / strava.average_speed : null,
      },
      update: {
        distanceM: strava.distance || undefined,
        avgPaceSecPer100m:
          strava.average_speed && strava.average_speed > 0 ? 100 / strava.average_speed : undefined,
      },
    },
  };
}

const STRAVA_ENRICHMENT_ATTACHERS: Partial<
  Record<ActivityType, (data: Prisma.ActivityUpdateInput, strava: StravaActivity) => void>
> = {
  [ActivityType.RUN]: enrichStravaRunMetrics,
  [ActivityType.BIKE]: enrichStravaBikeMetrics,
  [ActivityType.SWIM]: enrichStravaSwimMetrics,
};

/** Enrichit une activité existante avec les métriques Strava (streams via stravaId). */
function stravaEnrichmentUpdate(
  strava: StravaActivity,
  type: ActivityType,
  existingGarminId: string | null,
  existingSource: string,
): Prisma.ActivityUpdateInput {
  const data: Prisma.ActivityUpdateInput = {
    stravaId: String(strava.id),
    source: mergedSource(
      Boolean(existingGarminId),
      true,
      sourceIncludes(existingSource, 'apple-health'),
    ),
    title: strava.name,
    duration: strava.moving_time || strava.elapsed_time || undefined,
    load: strava.suffer_score ?? undefined,
  };

  STRAVA_ENRICHMENT_ATTACHERS[type]?.(data, strava);
  return data;
}

type StravaCandidate = { stravaId: string; type: ActivityType; strava: StravaActivity };

type StravaProcessOutcome =
  | { kind: 'skipped' }
  | { kind: 'merged'; type: ActivityType; activityId: string }
  | { kind: 'imported'; type: ActivityType; activityId: string };

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002';
}

type MergeStravaMatchInput = {
  athleteId: string;
  match: NonNullable<Awaited<ReturnType<typeof findMatchingActivity>>>;
  strava: StravaActivity;
  type: ActivityType;
  stravaId: string;
};

async function mergeStravaIntoMatch(input: MergeStravaMatchInput): Promise<StravaProcessOutcome> {
  const { athleteId, match, strava, type, stravaId } = input;
  if (match.stravaId && match.stravaId !== stravaId) {
    return { kind: 'skipped' };
  }
  try {
    // Claim stravaId first so concurrent page workers cannot double-merge the same row.
    if (!match.stravaId) {
      try {
        await prisma.activity.update({
          where: { id: match.id },
          data: { stravaId },
        });
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          return { kind: 'skipped' };
        }
        throw error;
      }
    }

    const existing = await loadActivityFillSnapshot(match.id);
    // Behind Garmin: never overwrite when the snapshot failed to load.
    if (match.garminId && !existing) {
      console.error('[strava-sync] skip merge: fill snapshot missing for Garmin row', match.id);
      return { kind: 'skipped' };
    }
    const enrichment = stravaEnrichmentUpdate(strava, type, match.garminId, match.source);
    // Always fill blanks only for scalars/metrics; ids/source always land.
    // Strava may still be "primary" vs Apple Health for ownership, but never wipe filled fields.
    const data = existing
      ? fillMissingActivityUpdate(existing, enrichment, { always: ['stravaId', 'source'] })
      : enrichment;
    if (Object.keys(data).length > 0) {
      await prisma.activity.update({
        where: { id: match.id },
        data,
      });
    } else if (!match.garminId) {
      // Patch empty and no Core ingest needed beyond claim — still count as merged when we ingest.
    }
    if (!match.garminId) {
      // AH (and any manual SESSION) wrote Core without a provider id — remove before Strava.
      await removeManualActivityObservations(athleteId, match.id);
      await ingestStravaActivity(athleteId, strava);
    }
    return { kind: 'merged', type, activityId: match.id };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { kind: 'skipped' };
    }
    throw error;
  }
}

async function importNewStravaActivity(
  athleteId: string,
  strava: StravaActivity,
  type: ActivityType,
  timeZone: string,
): Promise<StravaProcessOutcome> {
  try {
    const created = await prisma.activity.create({
      data: { ...buildActivityData(strava, type, timeZone), athleteId },
    });
    await ingestStravaActivity(athleteId, strava);
    return { kind: 'imported', type, activityId: created.id };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { kind: 'skipped' };
    }
    throw error;
  }
}

async function processStravaCandidate(
  athleteId: string,
  { stravaId, type, strava }: StravaCandidate,
  timeZone: string,
): Promise<StravaProcessOutcome> {
  const date = stravaWallClockStart(strava, timeZone);
  const duration = strava.moving_time || strava.elapsed_time || null;
  const altDurations = [strava.moving_time, strava.elapsed_time].filter(
    (value): value is number => typeof value === 'number' && value > 0 && value !== duration,
  );
  const match = await findMatchingActivity(athleteId, {
    type,
    date,
    duration,
    altDurations,
    distanceM: strava.distance > 0 ? strava.distance : null,
    stravaId,
  });

  if (match) {
    return mergeStravaIntoMatch({ athleteId, match, strava, type, stravaId });
  }
  return importNewStravaActivity(athleteId, strava, type, timeZone);
}

function collectStravaCandidates(
  activities: StravaActivity[],
  seenStravaIds: Set<string>,
): { candidates: StravaCandidate[]; skipped: number } {
  let skipped = 0;
  const candidates: StravaCandidate[] = [];
  for (const strava of activities) {
    const stravaId = String(strava.id);
    if (seenStravaIds.has(stravaId)) {
      skipped += 1;
      continue;
    }
    seenStravaIds.add(stravaId);

    const type = mapStravaType(strava.sport_type ?? strava.type);
    if (!type) {
      skipped += 1;
      continue;
    }
    candidates.push({ stravaId, type, strava });
  }
  return { candidates, skipped };
}

export interface SyncResult {
  fetched: number;
  imported: number;
  merged: number;
  skipped: number;
  importedTypes: ActivityType[];
  importedActivityIds: string[];
}

async function processStravaActivityPage(
  athleteId: string,
  activities: StravaActivity[],
  seenStravaIds: Set<string>,
  counters: {
    skipped: number;
    imported: number;
    merged: number;
    importedTypes: Set<ActivityType>;
    importedActivityIds: string[];
  },
  timeZone: string,
): Promise<number> {
  const { candidates, skipped: dedupeSkipped } = collectStravaCandidates(activities, seenStravaIds);
  counters.skipped += dedupeSkipped;

  const existingIds = new Set(
    (
      await prisma.activity.findMany({
        where: { athleteId, stravaId: { in: candidates.map((c) => c.stravaId) } },
        select: { stravaId: true },
      })
    ).map((r) => r.stravaId),
  );

  const pending = candidates.filter((c) => !existingIds.has(c.stravaId));
  counters.skipped += candidates.length - pending.length;

  const outcomes = await mapWithConcurrency(pending, STRAVA_ACTIVITY_CONCURRENCY, (candidate) =>
    processStravaCandidate(athleteId, candidate, timeZone),
  );

  for (const outcome of outcomes) {
    if (outcome.kind === 'skipped') {
      counters.skipped += 1;
      continue;
    }
    counters.importedTypes.add(outcome.type);
    counters.importedActivityIds.push(outcome.activityId);
    if (outcome.kind === 'merged') {
      counters.merged += 1;
    } else {
      counters.imported += 1;
    }
  }

  return activities.length;
}

export async function syncStravaActivities(athleteId: string): Promise<SyncResult> {
  const { isProviderEnabledForClass } = await import('@sharpit/app/lib/integrations/source-prefs');
  const { loadResolvedSourcePrefs } =
    await import('@sharpit/server/lib/integrations/source-prefs-store');
  const prefs = await loadResolvedSourcePrefs(athleteId);
  if (!isProviderEnabledForClass(prefs, 'activities', 'strava')) {
    return {
      fetched: 0,
      imported: 0,
      merged: 0,
      skipped: 0,
      importedTypes: [],
      importedActivityIds: [],
    };
  }

  const [accessToken, account] = await Promise.all([
    getValidAccessToken(athleteId),
    getStravaAccount(athleteId),
  ]);

  const after = Math.floor(syncSinceFromLastSync(account?.lastSyncAt, 90).getTime() / 1000);

  let page = 1;
  const counters = {
    skipped: 0,
    imported: 0,
    merged: 0,
    importedTypes: new Set<ActivityType>(),
    importedActivityIds: [] as string[],
  };
  let fetched = 0;
  const seenStravaIds = new Set<string>();
  const timeZone = await athleteTimeZone(athleteId);

  while (page <= 10) {
    const activities = await fetchActivities(accessToken, { after, page });
    if (!activities.length) {
      break;
    }
    fetched += await processStravaActivityPage(
      athleteId,
      activities,
      seenStravaIds,
      counters,
      timeZone,
    );

    if (activities.length < 100) {
      break;
    }
    page += 1;
  }

  await prisma.stravaAccount.update({
    where: { athleteId },
    data: { lastSyncAt: new Date() },
  });

  return {
    fetched,
    imported: counters.imported,
    merged: counters.merged,
    skipped: counters.skipped,
    importedTypes: [...counters.importedTypes],
    importedActivityIds: counters.importedActivityIds,
  };
}
