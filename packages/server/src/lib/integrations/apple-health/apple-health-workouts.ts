import { ActivityType, Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  findMatchingActivity,
  mergedSource,
  sourceIncludes,
} from '@sharpit/server/lib/activity/list/activity-dedup';
import { fillMissingActivityUpdate } from '@sharpit/server/lib/activity/list/activity-fill-missing';
import { loadActivityFillSnapshot } from '@sharpit/server/lib/activity/list/load-activity-fill-snapshot';
import { prisma } from '@sharpit/db/client';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { storedActivityToSession } from '@sharpit/server/lib/observation/activity-to-session';
import { persistStream } from '@sharpit/server/lib/streams/streams';
import {
  rawStreamsHaveSignal,
  type RawStreams,
} from '@sharpit/server/lib/integrations/garmin/garmin-streams';
import { appleHealthWallClockStart } from './apple-health-time';

const DEFAULT_ATHLETE_TIME_ZONE = 'Europe/Paris';

/**
 * Apple Health workouts, sent by the native app, as SharpIt activities — what lets an athlete
 * without Garmin or Strava train with SharpIt on an Apple Watch alone.
 *
 * Taken while Apple Health is enabled for activities (ADR-054). A workout that matches an
 * existing Garmin/Strava (or earlier Apple) row fills blank fields and streams only — never a
 * second activity. A duplicate send of the same HealthKit workout is then a no-op fill.
 * The stored row goes to the Core as any activity without a provider id does
 * (`storedActivityToSession`), so its load is the Core's.
 */

const MAX_STREAM_POINTS = 8_000;

const series = z.array(z.number().nullable()).max(MAX_STREAM_POINTS);

const streamSchema = z.object({
  time: z.array(z.number().min(0)).max(MAX_STREAM_POINTS),
  heartrate: series.optional(),
  distance: series.optional(),
  altitude: series.optional(),
  velocity: series.optional(),
  watts: series.optional(),
  cadence: series.optional(),
  latlng: z
    .array(z.tuple([z.number(), z.number()]))
    .max(MAX_STREAM_POINTS)
    .optional(),
});

export const appleHealthWorkoutSchema = z.object({
  /** HealthKit's workout UUID — stored as `Activity.appleHealthId` for stable rematch. */
  id: z.string().min(1).max(64),
  type: z.enum(['RUN', 'BIKE', 'SWIM', 'STRENGTH', 'HIKE', 'OTHER']),
  title: z.string().max(120).nullish(),
  start: z.string().datetime({ offset: true }),
  durationSec: z.number().int().min(1).max(86_400),
  distanceM: z.number().min(0).max(1_000_000).nullish(),
  energyKcal: z.number().min(0).max(20_000).nullish(),
  avgHr: z.number().int().min(20).max(250).nullish(),
  maxHr: z.number().int().min(20).max(250).nullish(),
  elevationM: z.number().min(0).max(20_000).nullish(),
  avgPowerW: z.number().min(0).max(3_000).nullish(),
  avgCadence: z.number().min(0).max(300).nullish(),
  stream: streamSchema.nullish(),
});

export type AppleHealthWorkout = z.infer<typeof appleHealthWorkoutSchema>;

type ActivityCreate = Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'>;

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function rounded(value: number | null | undefined): number | null {
  const set = positive(value);
  return set === null ? null : Math.round(set);
}

function metricsFor(workout: AppleHealthWorkout): Partial<ActivityCreate> {
  const distanceM = positive(workout.distanceM);
  const elevationM = positive(workout.elevationM);
  const calories = rounded(workout.energyKcal);
  switch (workout.type) {
    case ActivityType.RUN:
      return {
        runMetrics: {
          create: {
            distanceM,
            elevationM,
            paceSecPerKm: distanceM ? workout.durationSec / (distanceM / 1_000) : null,
            avgHr: rounded(workout.avgHr),
            avgPower: positive(workout.avgPowerW),
            cadence: rounded(workout.avgCadence),
          },
        },
      };
    case ActivityType.BIKE:
      return {
        bikeMetrics: {
          create: {
            distanceM,
            elevationM,
            calories,
            avgPower: positive(workout.avgPowerW),
            avgCadence: rounded(workout.avgCadence),
          },
        },
      };
    case ActivityType.SWIM:
      return {
        swimMetrics: {
          create: {
            distanceM,
            avgPaceSecPer100m: distanceM ? workout.durationSec / (distanceM / 100) : null,
          },
        },
      };
    case ActivityType.HIKE:
      return {
        hikeMetrics: {
          create: {
            distanceM,
            elevationM,
            calories,
            avgHr: rounded(workout.avgHr),
            avgSpeedMps: distanceM ? distanceM / workout.durationSec : null,
          },
        },
      };
    default:
      return {};
  }
}

/**
 * The activity row a workout becomes, with its sport's metrics. Its start is the athlete's wall
 * clock written as UTC, as Garmin's are (`appleHealthWallClockStart`); `timeZone` places a start
 * sent in UTC.
 */
export function appleHealthActivityData(
  workout: AppleHealthWorkout,
  timeZone: string,
): ActivityCreate {
  return {
    type: workout.type,
    date: appleHealthWallClockStart(workout.start, timeZone),
    title: workout.title ?? null,
    duration: workout.durationSec,
    source: 'apple-health',
    appleHealthId: workout.id,
    ...metricsFor(workout),
  };
}

/** The streams as SharpIt stores them: every series aligned on `time`, absent ones empty. */
export function appleHealthRawStreams(workout: AppleHealthWorkout): RawStreams | null {
  const { stream } = workout;
  if (!stream || stream.time.length === 0) {
    return null;
  }
  const aligned = (values: (number | null)[] | undefined): number[] =>
    values && values.length === stream.time.length ? values.map((v) => v ?? 0) : [];
  return {
    time: stream.time,
    heartrate: aligned(stream.heartrate),
    distance: aligned(stream.distance),
    altitude: aligned(stream.altitude),
    velocity: aligned(stream.velocity),
    watts: aligned(stream.watts),
    cadence: aligned(stream.cadence),
    latlng: stream.latlng && stream.latlng.length === stream.time.length ? stream.latlng : [],
  };
}

function metricCreateToUpsert(
  create: Record<string, unknown> | undefined,
): Prisma.ActivityUpdateInput[keyof Prisma.ActivityUpdateInput] | undefined {
  if (!create) {
    return undefined;
  }
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(create)) {
    if (value !== null && value !== undefined) {
      update[key] = value;
    }
  }
  return {
    upsert: { create, update },
  } as Prisma.ActivityUpdateInput[keyof Prisma.ActivityUpdateInput];
}

/** Patch a matched Garmin/Strava row with Apple Santé fields that are still blank. */
export function appleHealthEnrichmentUpdate(
  workout: AppleHealthWorkout,
  timeZone: string,
  existing?: {
    source: string;
    garminId: string | null;
    stravaId: string | null;
  },
): Prisma.ActivityUpdateInput {
  const created = appleHealthActivityData(workout, timeZone);
  const data: Prisma.ActivityUpdateInput = {
    title: created.title ?? undefined,
    duration: typeof created.duration === 'number' ? created.duration : undefined,
    appleHealthId: workout.id,
    source: existing
      ? mergedSource(
          Boolean(existing.garminId) || sourceIncludes(existing.source, 'garmin'),
          Boolean(existing.stravaId) || sourceIncludes(existing.source, 'strava'),
          true,
        )
      : 'apple-health',
  };
  const run = created.runMetrics as { create?: Record<string, unknown> } | undefined;
  const bike = created.bikeMetrics as { create?: Record<string, unknown> } | undefined;
  const swim = created.swimMetrics as { create?: Record<string, unknown> } | undefined;
  const hike = created.hikeMetrics as { create?: Record<string, unknown> } | undefined;
  if (run?.create) {
    data.runMetrics = metricCreateToUpsert(run.create) as Prisma.ActivityUpdateInput['runMetrics'];
  }
  if (bike?.create) {
    data.bikeMetrics = metricCreateToUpsert(
      bike.create,
    ) as Prisma.ActivityUpdateInput['bikeMetrics'];
  }
  if (swim?.create) {
    data.swimMetrics = metricCreateToUpsert(
      swim.create,
    ) as Prisma.ActivityUpdateInput['swimMetrics'];
  }
  if (hike?.create) {
    data.hikeMetrics = metricCreateToUpsert(
      hike.create,
    ) as Prisma.ActivityUpdateInput['hikeMetrics'];
  }
  return data;
}

/** Where the athlete lives, for a start sent without its offset: the calendar's, else Paris. */
async function athleteTimeZone(athleteId: string): Promise<string> {
  const google = await prisma.googleAccount.findUnique({
    where: { athleteId },
    select: { timeZone: true },
  });
  return google?.timeZone ?? DEFAULT_ATHLETE_TIME_ZONE;
}

export type AppleHealthWorkoutImport = {
  imported: number;
  /** Matched an existing activity and filled blanks (not a new row). */
  enriched: number;
  skipped: number;
  activityIds: string[];
};

async function enrichMatchedAppleHealthWorkout(
  athleteId: string,
  match: {
    id: string;
    source: string;
    garminId: string | null;
    stravaId: string | null;
  },
  workout: AppleHealthWorkout,
  timeZone: string,
): Promise<'enriched' | 'skipped'> {
  const existing = await loadActivityFillSnapshot(match.id);
  if (!existing) {
    return 'skipped';
  }
  const data = fillMissingActivityUpdate(
    existing,
    appleHealthEnrichmentUpdate(workout, timeZone, match),
    { always: ['source', 'appleHealthId'] },
  );
  const raw = appleHealthRawStreams(workout);
  const canWriteStream = Boolean(raw && rawStreamsHaveSignal(raw) && !existing.hasStream);
  if (Object.keys(data).length === 0 && !canWriteStream) {
    return 'skipped';
  }
  if (Object.keys(data).length > 0) {
    await prisma.activity.update({ where: { id: match.id }, data });
  }
  if (canWriteStream) {
    await persistStream(athleteId, match.id, raw);
  }
  return 'enriched';
}

async function importOne(
  athleteId: string,
  workout: AppleHealthWorkout,
  timeZone: string,
): Promise<{ kind: 'created' | 'enriched'; activityId: string } | { kind: 'skipped' }> {
  const data = appleHealthActivityData(workout, timeZone);
  const match = await findMatchingActivity(athleteId, {
    type: workout.type,
    date: data.date as Date,
    duration: workout.durationSec,
    distanceM: workout.distanceM ?? null,
    appleHealthId: workout.id,
  });
  if (match) {
    const outcome = await enrichMatchedAppleHealthWorkout(athleteId, match, workout, timeZone);
    if (outcome === 'skipped') {
      return { kind: 'skipped' };
    }
    return { kind: 'enriched', activityId: match.id };
  }

  const created = await prisma.activity.create({
    data: { ...data, athleteId },
    include: { runMetrics: true, bikeMetrics: true, swimMetrics: true, hikeMetrics: true },
  });
  const session = storedActivityToSession(created, {
    avgHrFromStream: workout.avgHr ?? null,
    maxHrFromStream: workout.maxHr ?? null,
  });
  if (session) {
    await observationEngine.ingest(athleteId, session);
  }
  // After the session: only persist when there is usable signal (no forever stubs).
  const raw = appleHealthRawStreams(workout);
  if (raw && rawStreamsHaveSignal(raw)) {
    await persistStream(athleteId, created.id, raw);
  }
  return { kind: 'created', activityId: created.id };
}

export async function importAppleHealthWorkouts(
  athleteId: string,
  workouts: AppleHealthWorkout[],
): Promise<AppleHealthWorkoutImport> {
  const result: AppleHealthWorkoutImport = {
    imported: 0,
    enriched: 0,
    skipped: 0,
    activityIds: [],
  };
  const timeZone = await athleteTimeZone(athleteId);
  // In order, one at a time: two workouts of one batch can match each other.
  for (const workout of workouts) {
    const outcome = await importOne(athleteId, workout, timeZone);
    if (outcome.kind === 'created') {
      result.imported += 1;
      result.activityIds.push(outcome.activityId);
    } else if (outcome.kind === 'enriched') {
      result.enriched += 1;
      result.activityIds.push(outcome.activityId);
    } else {
      result.skipped += 1;
    }
  }
  return result;
}
