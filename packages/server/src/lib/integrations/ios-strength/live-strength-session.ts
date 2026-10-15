import { ActivityType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { strengthSetSchema } from '@sharpit/app/lib/validators/activity';
import {
  findMatchingActivity,
  mergedSource,
  sourceIncludes,
  type MatchedActivity,
} from '@sharpit/server/lib/activity/list/activity-dedup';
import { prisma } from '@sharpit/db/client';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { storedActivityToSession } from '@sharpit/server/lib/observation/activity-to-session';
import { appleHealthWallClockStart } from '@sharpit/server/lib/integrations/apple-health/apple-health-time';
import { persistStream, type RawStreams } from '@sharpit/server/lib/streams/streams';
import {
  hrCoverageSec,
  preferHrStream,
  validateLiveHrSamples,
  type LiveHrMeta,
  type LiveHrValidationCode,
} from '@sharpit/server/lib/integrations/ios-strength/live-hr';

const DEFAULT_ATHLETE_TIME_ZONE = 'Europe/Paris';
export const SHARPIT_IOS_SOURCE = 'sharpit-ios';

/**
 * End-of-session payload from the iOS app for a strength workout recorded with live HR.
 * Additive contract — see docs/ios/STRENGTH_LIVE_HR_CONTRACT.md.
 */
export const liveStrengthSessionSchema = z.object({
  clientSessionId: z.string().trim().min(1).max(64),
  start: z.string().datetime({ offset: true }),
  durationSec: z.number().int().min(1).max(14_400),
  title: z.string().max(120).nullish(),
  strengthSets: z.array(strengthSetSchema).max(50).default([]),
  avgHr: z.number().int().min(25).max(250),
  maxHr: z.number().int().min(25).max(250),
  hrSamples: z.array(z.unknown()).max(3_000),
});

export type LiveStrengthSessionInput = z.infer<typeof liveStrengthSessionSchema>;

export type LiveStrengthSessionResult =
  | {
      ok: true;
      activityId: string;
      outcome: 'created' | 'merged' | 'unchanged';
      /** Booleans only — never bpm values. */
      hasHr: true;
      sampleCount: number;
      liveHrSource: LiveHrMeta['source'];
    }
  | { ok: false; code: LiveHrValidationCode | 'INVALID_PAYLOAD' };

type StrengthSetCreate = {
  exercise: string;
  sets: number;
  reps: number;
  weightKg?: number | null;
  rpe?: number | null;
  restSec?: number | null;
  durationSec?: number | null;
  videoUrl?: string | null;
  notes?: string | null;
  order?: number;
};

function strengthCreates(
  sets: StrengthSetCreate[],
): Prisma.StrengthSetCreateWithoutActivityInput[] {
  return sets.map((set, index) => ({
    exercise: set.exercise,
    sets: set.sets,
    reps: set.reps,
    weightKg: set.weightKg ?? null,
    rpe: set.rpe ?? null,
    restSec: set.restSec ?? null,
    durationSec: set.durationSec ?? null,
    videoUrl: set.videoUrl ?? null,
    notes: set.notes ?? null,
    order: set.order ?? index,
  }));
}

async function athleteTimeZone(athleteId: string): Promise<string> {
  const google = await prisma.googleAccount.findUnique({
    where: { athleteId },
    select: { timeZone: true },
  });
  return google?.timeZone ?? DEFAULT_ATHLETE_TIME_ZONE;
}

async function findByClientSessionId(
  athleteId: string,
  clientSessionId: string,
): Promise<MatchedActivity | null> {
  const row = await prisma.activityStream.findFirst({
    where: {
      activity: { athleteId },
      data: {
        path: ['liveHr', 'clientSessionId'],
        equals: clientSessionId,
      },
    },
    select: {
      activity: {
        select: {
          id: true,
          type: true,
          date: true,
          duration: true,
          garminId: true,
          stravaId: true,
          appleHealthId: true,
          source: true,
          rpe: true,
          feeling: true,
          mergedIntoId: true,
        },
      },
    },
  });
  return row?.activity ? { ...row.activity } : null;
}

function composeSource(match: MatchedActivity | null): string {
  return mergedSource(
    Boolean(match?.garminId) || sourceIncludes(match?.source, 'garmin'),
    Boolean(match?.stravaId) || sourceIncludes(match?.source, 'strava'),
    Boolean(match?.appleHealthId) || sourceIncludes(match?.source, 'apple-health'),
    true,
  );
}

async function loadStoredRaw(
  activityId: string,
): Promise<(RawStreams & { liveHr?: LiveHrMeta }) | null> {
  const row = await prisma.activityStream.findUnique({
    where: { activityId },
    select: { available: true, data: true },
  });
  if (!row?.available || !row.data) {
    return null;
  }
  return row.data as unknown as RawStreams & { liveHr?: LiveHrMeta };
}

async function writeStrengthSets(
  activityId: string,
  sets: StrengthSetCreate[],
  mode: 'create' | 'replace-if-app' | 'keep-existing',
): Promise<void> {
  if (sets.length === 0 && mode !== 'replace-if-app') {
    return;
  }
  const existingCount = await prisma.strengthSet.count({ where: { activityId } });
  if (mode === 'keep-existing' && existingCount > 0) {
    return;
  }
  if (existingCount > 0 && (mode === 'replace-if-app' || mode === 'create')) {
    await prisma.strengthSet.deleteMany({ where: { activityId } });
  }
  if (sets.length === 0) {
    return;
  }
  await prisma.strengthSet.createMany({
    data: strengthCreates(sets).map((set) => ({ ...set, activityId })),
  });
}

async function ingestSessionLoad(
  athleteId: string,
  activityId: string,
  avgHr: number,
  maxHr: number,
): Promise<void> {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, athleteId },
    include: {
      runMetrics: true,
      bikeMetrics: true,
      swimMetrics: true,
      hikeMetrics: true,
    },
  });
  if (!activity) {
    return;
  }
  const session = storedActivityToSession(activity, {
    avgHrFromStream: avgHr,
    maxHrFromStream: maxHr,
  });
  if (session) {
    await observationEngine.ingest(athleteId, session);
  }
}

async function persistLiveHr(
  athleteId: string,
  activityId: string,
  raw: RawStreams,
  meta: LiveHrMeta,
): Promise<void> {
  await persistStream(athleteId, activityId, raw, { liveHr: meta });
}

type ValidatedHr = Extract<ReturnType<typeof validateLiveHrSamples>, { ok: true }>;

function okResult(
  activityId: string,
  outcome: 'created' | 'merged' | 'unchanged',
  hr: ValidatedHr,
  liveHrSource: LiveHrMeta['source'],
): LiveStrengthSessionResult {
  return {
    ok: true,
    activityId,
    outcome,
    hasHr: true,
    sampleCount: hr.sampleCount,
    liveHrSource,
  };
}

/** Exact retry on clientSessionId — refresh HR only when the new series covers more. */
async function applyClientSessionRetry(
  athleteId: string,
  match: MatchedActivity,
  hr: ValidatedHr,
  liveHr: LiveHrMeta,
): Promise<LiveStrengthSessionResult> {
  const stored = await loadStoredRaw(match.id);
  if (preferHrStream(stored, hr.raw) === 'b') {
    await persistLiveHr(athleteId, match.id, hr.raw, liveHr);
    await ingestSessionLoad(athleteId, match.id, hr.avgHr, hr.maxHr);
    return okResult(match.id, 'merged', hr, hr.source);
  }
  return okResult(match.id, 'unchanged', hr, stored?.liveHr?.source ?? hr.source);
}

async function stampClientSessionOnStoredHr(
  activityId: string,
  stored: RawStreams & { liveHr?: LiveHrMeta },
  clientSessionId: string,
): Promise<void> {
  await prisma.activityStream.update({
    where: { activityId },
    data: {
      data: {
        ...(stored as unknown as object),
        liveHr: {
          clientSessionId,
          source: stored.liveHr?.source ?? 'watch',
        },
      } as unknown as object,
    },
  });
}

/** Merge app session onto a watch (or earlier) strength row overlapping the same window. */
async function mergeOntoMatchedActivity(
  athleteId: string,
  match: MatchedActivity,
  input: LiveStrengthSessionInput,
  hr: ValidatedHr,
  liveHr: LiveHrMeta,
): Promise<LiveStrengthSessionResult> {
  const alreadyOurs = sourceIncludes(match.source, SHARPIT_IOS_SOURCE);
  await prisma.activity.update({
    where: { id: match.id },
    data: {
      source: composeSource(match),
      title: input.title ?? undefined,
      duration: input.durationSec,
    },
  });
  // App exercises win over watch auto-detected sets.
  await writeStrengthSets(
    match.id,
    input.strengthSets,
    alreadyOurs ? 'keep-existing' : 'replace-if-app',
  );

  const stored = await loadStoredRaw(match.id);
  const takeLiveHr = !stored || preferHrStream(stored, hr.raw) === 'b';
  if (takeLiveHr) {
    await persistLiveHr(athleteId, match.id, hr.raw, liveHr);
    await ingestSessionLoad(athleteId, match.id, hr.avgHr, hr.maxHr);
  } else if (stored) {
    await stampClientSessionOnStoredHr(match.id, stored, input.clientSessionId);
  }

  return okResult(
    match.id,
    alreadyOurs ? 'unchanged' : 'merged',
    hr,
    takeLiveHr ? hr.source : (stored?.liveHr?.source ?? 'watch'),
  );
}

async function createLiveStrengthActivity(
  athleteId: string,
  input: LiveStrengthSessionInput,
  date: Date,
  hr: ValidatedHr,
  liveHr: LiveHrMeta,
): Promise<LiveStrengthSessionResult> {
  const created = await prisma.activity.create({
    data: {
      athleteId,
      type: ActivityType.STRENGTH,
      date,
      title: input.title ?? null,
      duration: input.durationSec,
      source: SHARPIT_IOS_SOURCE,
      strengthSets:
        input.strengthSets.length > 0 ? { create: strengthCreates(input.strengthSets) } : undefined,
    },
    include: {
      runMetrics: true,
      bikeMetrics: true,
      swimMetrics: true,
      hikeMetrics: true,
    },
  });

  await persistLiveHr(athleteId, created.id, hr.raw, liveHr);
  const session = storedActivityToSession(created, {
    avgHrFromStream: hr.avgHr,
    maxHrFromStream: hr.maxHr,
  });
  if (session) {
    await observationEngine.ingest(athleteId, session);
  }
  return okResult(created.id, 'created', hr, hr.source);
}

/**
 * Import or merge one live strength session. Idempotent on `clientSessionId` and
 * fingerprint retry. Keeps app exercises/sets; prefers the HR series with more coverage.
 */
export async function importLiveStrengthSession(
  athleteId: string,
  body: unknown,
): Promise<LiveStrengthSessionResult> {
  const parsed = liveStrengthSessionSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_PAYLOAD' };
  }

  const input = parsed.data;
  const hr = validateLiveHrSamples({
    durationSec: input.durationSec,
    avgHr: input.avgHr,
    maxHr: input.maxHr,
    hrSamples: input.hrSamples,
  });
  if (!hr.ok) {
    return { ok: false, code: hr.code };
  }

  const timeZone = await athleteTimeZone(athleteId);
  const date = appleHealthWallClockStart(input.start, timeZone);
  const liveHr: LiveHrMeta = {
    clientSessionId: input.clientSessionId,
    source: hr.source,
  };

  const byClient = await findByClientSessionId(athleteId, input.clientSessionId);
  if (byClient) {
    return applyClientSessionRetry(athleteId, byClient, hr, liveHr);
  }

  const match = await findMatchingActivity(athleteId, {
    type: ActivityType.STRENGTH,
    date,
    duration: input.durationSec,
  });
  if (match) {
    return mergeOntoMatchedActivity(athleteId, match, input, hr, liveHr);
  }

  return createLiveStrengthActivity(athleteId, input, date, hr, liveHr);
}

/** Coverage helper re-export for stream upgrade paths. */
export { hrCoverageSec, preferHrStream };
