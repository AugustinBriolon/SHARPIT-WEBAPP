import { prisma } from '@sharpit/db/client';
import { isSet } from '@sharpit/shared/value';
import {
  analyzeActivityStreams,
  resolveThresholds,
  type ActivityAnalysis,
} from '@sharpit/app/lib/activity/detail/activity-analysis';
import {
  fetchGarminActivityStreams,
  rawStreamsHaveSignal,
  type RawStreams,
} from '@sharpit/server/lib/integrations/garmin/garmin-streams';
import { getGarminClient } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { getAthleteProfile } from '@sharpit/server/lib/queries';
import {
  fetchActivityStreams,
  type StravaStreamSet,
} from '@sharpit/server/lib/integrations/strava/strava';
import { getValidAccessToken } from '@sharpit/server/lib/integrations/strava/strava-sync';
import type { ActivityType } from '@prisma/client';
import {
  isMultisportLegArray,
  legKindToActivityType,
  sportLegsOnly,
  type MultisportLeg,
} from '@sharpit/app/lib/activity/multisport';

export type { RawStreams };

export type {
  ActivityStreamPayload,
  MultisportLegStream,
  MultisportStreamsPayload,
  StreamSample,
} from '@sharpit/app/lib/streams/stream-types';
import type {
  ActivityStreamPayload,
  MultisportLegStream,
  MultisportStreamsPayload,
  StreamSample,
} from '@sharpit/app/lib/streams/stream-types';

const MAX_SAMPLES = 500;
const MAX_PATH_POINTS = 800;
/** Durée max stockée à 1 Hz (~8 h) — limite le transfert réseau Neon. */
const MAX_STORED_SECONDS = 28_800;

/**
 * Réduit les streams bruts avant persistance (1 Hz, latlng échantillonnée).
 * Les records et l'UI ré-échantillonnent déjà ; le stockage pleine résolution
 * multipliait inutilement le transfert réseau (~5–20×).
 */
function resampleScalarGrid(values: number[], time: number[], cap: number): number[] {
  if (!values.length) {
    return [];
  }
  const grid = new Array<number>(cap + 1).fill(0);
  let idx = 0;
  for (let s = 0; s <= cap; s++) {
    while (idx < time.length - 1 && (time[idx + 1] ?? 0) <= s) {
      idx++;
    }
    grid[s] = values[idx] ?? 0;
  }
  return grid;
}

function downsampleLatLng(raw: RawStreams): [number, number][] {
  const latlng = raw.latlng ?? [];
  if (latlng.length <= MAX_PATH_POINTS) {
    return latlng;
  }
  return downsample(latlng, MAX_PATH_POINTS);
}

function compactStreamScalars(raw: RawStreams, time: number[], cap: number) {
  const resampleScalar = (values: number[]) => resampleScalarGrid(values, time, cap);
  return {
    distance: resampleScalar(raw.distance ?? []),
    altitude: resampleScalar(raw.altitude ?? []),
    heartrate: resampleScalar(raw.heartrate ?? []),
    watts: resampleScalar(raw.watts ?? []),
    cadence: resampleScalar(raw.cadence ?? []),
    velocity: resampleScalar(raw.velocity ?? []),
  };
}

export function compactRawStreamsForStorage(raw: RawStreams): RawStreams {
  const { time } = raw;
  if (!time.length) {
    return raw;
  }

  const maxT = Math.floor(time[time.length - 1] ?? 0);
  if (maxT <= 0) {
    return raw;
  }

  const cap = Math.min(maxT, MAX_STORED_SECONDS);
  const n = cap + 1;

  return {
    time: Array.from({ length: n }, (_, i) => i),
    ...compactStreamScalars(raw, time, cap),
    latlng: downsampleLatLng(raw),
  };
}

function normalizeStravaStreamField<T>(field: { data?: T[] } | undefined): T[] {
  return field?.data ?? [];
}

function normalizeStravaStreams(set: StravaStreamSet): RawStreams {
  return {
    time: normalizeStravaStreamField(set.time),
    distance: normalizeStravaStreamField(set.distance),
    altitude: normalizeStravaStreamField(set.altitude),
    heartrate: normalizeStravaStreamField(set.heartrate),
    watts: normalizeStravaStreamField(set.watts),
    cadence: normalizeStravaStreamField(set.cadence),
    velocity: normalizeStravaStreamField(set.velocity_smooth),
    latlng: normalizeStravaStreamField(set.latlng),
  };
}

function hasSignal(arr: number[]): boolean {
  return arr.length > 0 && arr.some((v) => isSet(v) && v !== 0);
}

/** Échantillonnage régulier en conservant le dernier point. */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) {
    return arr;
  }
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
  out.push(arr[arr.length - 1]);
  return out;
}

function mean(arr: number[]): number | null {
  const valid = arr.filter((v) => isSet(v) && !Number.isNaN(v));
  if (!valid.length) {
    return null;
  }
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/** Heart-rate mean/max ignore zeros — gaps in a live recording must not pull avg down. */
function positiveHrMean(arr: number[]): number | null {
  const valid = arr.filter((v) => isSet(v) && !Number.isNaN(v) && v > 0);
  if (!valid.length) {
    return null;
  }
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

function max(arr: number[]): number | null {
  const valid = arr.filter((v) => isSet(v) && !Number.isNaN(v));
  if (!valid.length) {
    return null;
  }
  return Math.max(...valid);
}

function positiveHrMax(arr: number[]): number | null {
  const valid = arr.filter((v) => isSet(v) && !Number.isNaN(v) && v > 0);
  if (!valid.length) {
    return null;
  }
  return Math.max(...valid);
}

function computeAscent(alt: number[]): number | null {
  if (alt.length < 2) {
    return null;
  }
  let gain = 0;
  for (let i = 1; i < alt.length; i++) {
    const diff = alt[i] - alt[i - 1];
    if (diff > 0) {
      gain += diff;
    }
  }
  return Math.round(gain);
}

function buildStreamHas(raw: RawStreams) {
  return {
    distance: hasSignal(raw.distance),
    altitude: hasSignal(raw.altitude),
    hr: hasSignal(raw.heartrate),
    watts: hasSignal(raw.watts),
    cadence: hasSignal(raw.cadence),
    speed: hasSignal(raw.velocity),
  };
}

function roundMeanOrNull(active: boolean, values: number[]): number | null {
  if (!active) {
    return null;
  }
  return Math.round(mean(values) ?? 0) || null;
}

function nullableStreamValue(active: boolean, value: number | undefined): number | null {
  return active ? (value ?? null) : null;
}

/** HR gaps are stored as 0 — expose them as null so charts do not interpolate across signal loss. */
function nullableHrValue(active: boolean, value: number | undefined): number | null {
  if (!active || value === undefined || value <= 0) {
    return null;
  }
  return value;
}

function streamSampleAt(
  raw: RawStreams,
  has: ReturnType<typeof buildStreamHas>,
  index: number,
): StreamSample {
  return {
    t: raw.time[index] ?? 0,
    d: raw.distance[index] ?? 0,
    alt: nullableStreamValue(has.altitude, raw.altitude[index]),
    hr: nullableHrValue(has.hr, raw.heartrate[index]),
    watts: nullableStreamValue(has.watts, raw.watts[index]),
    cadence: nullableStreamValue(has.cadence, raw.cadence[index]),
    speed: nullableStreamValue(has.speed, raw.velocity[index]),
  };
}

function buildStreamSamples(
  raw: RawStreams,
  has: ReturnType<typeof buildStreamHas>,
  length: number,
) {
  const indices = downsample(
    Array.from({ length }, (_, i) => i),
    MAX_SAMPLES,
  );
  return indices.map((index) => streamSampleAt(raw, has, index));
}

function computeStreamAvgSpeed(
  has: ReturnType<typeof buildStreamHas>,
  raw: RawStreams,
  totalDistance: number | null,
  lastTime: number | null,
): number | null {
  if (has.speed) {
    return mean(raw.velocity);
  }
  if (totalDistance && lastTime) {
    return totalDistance / lastTime;
  }
  return null;
}

function buildHrStreamStats(raw: RawStreams, has: ReturnType<typeof buildStreamHas>) {
  return {
    avgHr: has.hr ? Math.round(positiveHrMean(raw.heartrate) ?? 0) || null : null,
    maxHr: has.hr ? positiveHrMax(raw.heartrate) : null,
  };
}

function buildPowerStreamStats(raw: RawStreams, has: ReturnType<typeof buildStreamHas>) {
  return {
    avgWatts: roundMeanOrNull(has.watts, raw.watts),
    maxWatts: has.watts ? max(raw.watts) : null,
    avgCadence: roundMeanOrNull(has.cadence, raw.cadence),
    maxSpeed: has.speed ? max(raw.velocity) : null,
  };
}

function buildAltitudeStreamStats(raw: RawStreams, has: ReturnType<typeof buildStreamHas>) {
  return {
    totalAscent: has.altitude ? computeAscent(raw.altitude) : null,
    minAlt: has.altitude ? Math.round(Math.min(...raw.altitude)) : null,
    maxAlt: has.altitude ? Math.round(Math.max(...raw.altitude)) : null,
  };
}

function buildStreamStats(raw: RawStreams, has: ReturnType<typeof buildStreamHas>) {
  const totalDistance = has.distance ? max(raw.distance) : null;
  const lastTime = raw.time.length ? max(raw.time) : null;
  return {
    ...buildHrStreamStats(raw, has),
    ...buildPowerStreamStats(raw, has),
    avgSpeed: computeStreamAvgSpeed(has, raw, totalDistance, lastTime),
    totalDistance,
    ...buildAltitudeStreamStats(raw, has),
  };
}

function buildStreamAnalysis(
  raw: RawStreams,
  activity: {
    type: ActivityType;
    duration: number | null;
    bikeMetrics: {
      normalizedPower: number | null;
      intensityFactor: number | null;
    } | null;
  },
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
) {
  const analysisCtx = {
    type: activity.type,
    durationSec: activity.duration,
    bikeNormalizedPower: activity.bikeMetrics?.normalizedPower ?? null,
    bikeIntensityFactor: activity.bikeMetrics?.intensityFactor ?? null,
  };
  const thresholds = resolveThresholds(
    profile
      ? {
          ftpW: profile.ftpW,
          maxHr: profile.maxHr,
          lthr: profile.lthr,
          runThresholdPaceSecPerKm: profile.runThresholdPaceSecPerKm,
        }
      : null,
    raw,
    analysisCtx,
  );
  return analyzeActivityStreams(raw, thresholds, analysisCtx);
}

type LiveHrStoredMeta = {
  clientSessionId?: string;
  source?: 'watch' | 'ble';
};

function readLiveHrMeta(
  raw: RawStreams & { liveHr?: LiveHrStoredMeta },
): ActivityStreamPayload['liveHr'] {
  const source = raw.liveHr?.source;
  if (source !== 'watch' && source !== 'ble') {
    return null;
  }
  return { source };
}

function buildPayload(
  raw: RawStreams & { liveHr?: LiveHrStoredMeta },
  activity: {
    type: ActivityType;
    duration: number | null;
    bikeMetrics: {
      normalizedPower: number | null;
      intensityFactor: number | null;
    } | null;
  },
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
): ActivityStreamPayload {
  const length = Math.max(raw.time.length, raw.distance.length, raw.latlng.length);
  const has = buildStreamHas(raw);
  const samples = buildStreamSamples(raw, has, length);
  const path = raw.latlng.length > 0 ? downsample(raw.latlng, MAX_PATH_POINTS) : null;
  const stats = buildStreamStats(raw, has);
  const analysis = buildStreamAnalysis(raw, activity, profile);

  return { available: true, path, samples, has, stats, analysis, liveHr: readLiveHrMeta(raw) };
}

/**
 * Garmin can return cumulative distance for a multisport child leg
 * (e.g. run starts at bike total instead of 0). Rebase the leg so split
 * analysis reflects the leg itself, not the whole triathlon.
 */
export function normalizeMultisportLegRawStreams(raw: RawStreams): RawStreams {
  if (raw.distance.length === 0) {
    return raw;
  }
  const baseDistance = raw.distance.find((value) => Number.isFinite(value)) ?? 0;
  if (!Number.isFinite(baseDistance) || Math.abs(baseDistance) < 1) {
    return raw;
  }

  return {
    ...raw,
    distance: raw.distance.map((value) => Math.max(0, value - baseDistance)),
  };
}

const UNAVAILABLE: ActivityStreamPayload = {
  available: false,
  path: null,
  samples: [],
  has: {
    distance: false,
    altitude: false,
    hr: false,
    watts: false,
    cadence: false,
    speed: false,
  },
  stats: null,
  analysis: null,
  liveHr: null,
};

/** `null`: Garmin has no usable series for the leg; `undefined`: the call failed, worth retrying. */
async function fetchGarminLegRaw(
  athleteId: string,
  garminId: string,
): Promise<RawStreams | null | undefined> {
  try {
    const client = await getGarminClient(athleteId);
    const garmin = await fetchGarminActivityStreams(client, garminId);
    if (garmin && rawStreamsHaveSignal(garmin)) {
      return garmin;
    }
  } catch (error) {
    console.error('fetchGarminLegRaw', garminId, error);
    return undefined;
  }
  return null;
}

function buildLegStreamPayload(
  raw: RawStreams,
  type: ActivityType,
  durationSec: number | null,
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
): ActivityStreamPayload {
  return buildPayload(
    normalizeMultisportLegRawStreams(raw),
    { type, duration: durationSec, bikeMetrics: null },
    profile,
  );
}

/** Garmin leg streams have no row of their own: they are cached on the parent's stream row. */
type StoredWithGarminLegs = RawStreams & {
  garminLegs?: Record<string, GarminLegCacheEntry>;
  liveHr?: LiveHrStoredMeta;
};

/** Garmin had no stream for the leg: noted so every view does not ask again. */
type GarminLegMissing = { missingAt: string };
type GarminLegCacheEntry = RawStreams | GarminLegMissing;

const GARMIN_LEG_RECHECK_MS = 24 * 60 * 60 * 1000;

function isGarminLegMissing(entry: GarminLegCacheEntry | undefined): entry is GarminLegMissing {
  return Boolean(entry && 'missingAt' in entry);
}

function garminLegMissingRecently(entry: GarminLegCacheEntry | undefined, now: number): boolean {
  return isGarminLegMissing(entry) && now - Date.parse(entry.missingAt) < GARMIN_LEG_RECHECK_MS;
}

export type LegStreamOptions = {
  parentId: string;
  profile: Awaited<ReturnType<typeof getAthleteProfile>>;
  /** Never call a provider: legs without stored streams are skipped (narrative path). */
  cacheOnly?: boolean;
};

async function loadParentStreamData(parentId: string): Promise<StoredWithGarminLegs | null> {
  const row = await prisma.activityStream.findUnique({
    where: { activityId: parentId },
    select: { available: true, data: true },
  });
  return row?.available && row.data ? (row.data as unknown as StoredWithGarminLegs) : null;
}

/** Stored streams only: the leg's own row when it carries heart rate, else Garmin's cached leg. */
async function cachedLegStream(
  athleteId: string,
  leg: MultisportLeg,
  type: ActivityType,
  options: LegStreamOptions,
): Promise<ActivityStreamPayload | null> {
  if (leg.sourceActivityId) {
    const own = await getCachedActivityStreams(athleteId, leg.sourceActivityId);
    // An Apple Health leg row carries heart rate but no route or distance samples: it only wins
    // over the Garmin leg when it can draw the map and the splits too.
    if (own?.available && (!leg.garminActivityId || (own.path?.length && own.has.distance))) {
      return own;
    }
  }
  if (!leg.garminActivityId) {
    return null;
  }
  const entry = (await loadParentStreamData(options.parentId))?.garminLegs?.[leg.garminActivityId];
  return entry && !isGarminLegMissing(entry)
    ? buildLegStreamPayload(entry, type, leg.durationSec, options.profile)
    : null;
}

/**
 * Keeps a fetched Garmin leg on the parent's stream row, so the next read is cache-only. Only an
 * available row can hold it — an unavailable stub is deleted and refetched on read.
 */
async function cacheGarminLeg(
  athleteId: string,
  parentId: string,
  garminLegId: string,
  entry: GarminLegCacheEntry,
): Promise<void> {
  let data = await loadParentStreamData(parentId);
  if (!data) {
    await getActivityStreams(athleteId, parentId);
    data = await loadParentStreamData(parentId);
  }
  if (!data) {
    // shortcut: a parent without stored streams cannot hold the leg cache (a stub row would read as an empty stream), so its legs refetch per view; add a dedicated column if such races show up.
    return;
  }
  const stored = isGarminLegMissing(entry) ? entry : compactRawStreamsForStorage(entry);
  // Read-modify-write without a lock: a concurrent writer can drop an entry, costing one refetch.
  const garminLegs = { ...data.garminLegs, [garminLegId]: stored };
  await prisma.activityStream.update({
    where: { activityId: parentId },
    data: { data: { ...data, garminLegs } as unknown as object },
  });
}

/** First read of a leg: its own row's provider (persisted by `getActivityStreams`), else Garmin once. */
async function fetchLegStreamOnce(
  athleteId: string,
  leg: MultisportLeg,
  type: ActivityType,
  options: LegStreamOptions,
): Promise<ActivityStreamPayload | null> {
  if (!leg.garminActivityId) {
    const own = leg.sourceActivityId
      ? await getActivityStreams(athleteId, leg.sourceActivityId)
      : null;
    return own?.available ? own : null;
  }
  const cached = (await loadParentStreamData(options.parentId))?.garminLegs?.[leg.garminActivityId];
  if (garminLegMissingRecently(cached, Date.now())) {
    return null;
  }
  const raw = await fetchGarminLegRaw(athleteId, leg.garminActivityId);
  if (raw === undefined) {
    return null;
  }
  if (!raw) {
    const missing = { missingAt: new Date().toISOString() };
    await cacheGarminLeg(athleteId, options.parentId, leg.garminActivityId, missing);
    return null;
  }
  await cacheGarminLeg(athleteId, options.parentId, leg.garminActivityId, raw);
  return buildLegStreamPayload(raw, type, leg.durationSec, options.profile);
}

export async function buildMultisportLegStream(
  athleteId: string,
  leg: MultisportLeg,
  options: LegStreamOptions,
): Promise<MultisportLegStream | null> {
  const type = legKindToActivityType(leg.kind);
  if (!type) {
    return null;
  }
  const stream =
    (await cachedLegStream(athleteId, leg, type, options)) ??
    (options.cacheOnly ? null : await fetchLegStreamOnce(athleteId, leg, type, options));
  return stream ? { leg, type, stream } : null;
}

/**
 * Leg by leg, in order: a fetched Garmin leg is written onto the parent's stream row before the
 * next one reads it, so two legs never overwrite each other's cache entry.
 */
export async function buildMultisportLegStreams(
  athleteId: string,
  legs: MultisportLeg[],
  options: LegStreamOptions,
): Promise<Array<MultisportLegStream | null>> {
  const streams: Array<MultisportLegStream | null> = [];
  for (const leg of legs) {
    streams.push(await buildMultisportLegStream(athleteId, leg, options));
  }
  return streams;
}

/** Streams par jambe sportive d'un triathlon (natation, vélo, course). */
export async function getMultisportLegStreams(
  athleteId: string,
  activityId: string,
): Promise<MultisportStreamsPayload | null> {
  const [activity, profile] = await Promise.all([
    prisma.activity.findFirst({
      where: { id: activityId, athleteId },
      select: { multisportLegs: true, garminId: true },
    }),
    getAthleteProfile(athleteId),
  ]);

  if (!activity?.multisportLegs || !isMultisportLegArray(activity.multisportLegs)) {
    return null;
  }

  const legStreams = await buildMultisportLegStreams(
    athleteId,
    sportLegsOnly(activity.multisportLegs),
    { parentId: activityId, profile },
  );
  const results = legStreams.filter((stream): stream is MultisportLegStream => isSet(stream));

  return results.length > 0 ? { legs: results } : null;
}

async function fetchRawStreams(
  athleteId: string,
  activity: {
    garminId: string | null;
    stravaId: string | null;
  },
): Promise<RawStreams | null> {
  // Garmin en priorité (ressenti + source de vérité), Strava en complément streams.
  if (activity.garminId) {
    try {
      const client = await getGarminClient(athleteId);
      const garmin = await fetchGarminActivityStreams(client, activity.garminId);
      if (garmin && rawStreamsHaveSignal(garmin)) {
        return garmin;
      }
    } catch (error) {
      console.error('fetchRawStreams garmin', error);
    }
  }

  if (activity.stravaId) {
    try {
      const token = await getValidAccessToken(athleteId);
      const set = await fetchActivityStreams(token, activity.stravaId);
      if (set) {
        return normalizeStravaStreams(set);
      }
    } catch (error) {
      console.error('fetchRawStreams strava', error);
      throw error;
    }
  }

  return null;
}

export type PersistStreamOptions = {
  /**
   * Live HR meta from the iOS strength recorder. Pass `null` to clear (e.g. when a
   * watch stream with better coverage replaces the live series).
   */
  liveHr?: LiveHrStoredMeta | null;
};

/** Stores a session's streams and refreshes its features once they are cached. */
export async function persistStream(
  athleteId: string,
  activityId: string,
  raw: RawStreams | null,
  options?: PersistStreamOptions,
): Promise<boolean> {
  const available = isSet(raw) && rawStreamsHaveSignal(raw);
  if (!available) {
    // Never write or overwrite with an unavailable stub — leave the row absent so a
    // later provider can attach real series. Callers that need a stub use createStubStream.
    return false;
  }

  const previous = await loadParentStreamData(activityId);
  // A triathlon's Garmin legs live on its stream row: a new parent stream must not drop them.
  const liveHr = options && 'liveHr' in options ? options.liveHr : (previous?.liveHr ?? undefined);
  const stored = {
    ...compactRawStreamsForStorage(raw),
    ...(previous?.garminLegs && { garminLegs: previous.garminLegs }),
    ...(liveHr ? { liveHr } : {}),
  };

  await prisma.activityStream.upsert({
    where: { activityId },
    create: {
      activityId,
      available: true,
      data: stored as unknown as object,
    },
    update: {
      available: true,
      data: stored as unknown as object,
    },
  });

  await refreshSessionFeaturesAfterStream(athleteId, activityId);
  return true;
}

/** Explicit unavailable marker (manual activities with no provider streams). */
export async function createUnavailableStreamStub(activityId: string): Promise<void> {
  const existing = await prisma.activityStream.findUnique({
    where: { activityId },
    select: { activityId: true },
  });
  if (existing) {
    return;
  }
  await prisma.activityStream.create({
    data: { activityId, available: false },
  });
}

/** Features are often extracted before streams arrive — refresh SESSION once cached. */
export async function refreshSessionFeaturesAfterStream(
  athleteId: string,
  activityId: string,
): Promise<void> {
  try {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, athleteId },
      select: { garminId: true, stravaId: true },
    });
    if (!activity) {
      return;
    }

    const { featureEngine, isFeatureEngineEnabled } =
      await import('@sharpit/server/lib/engines/feature-engine');
    if (!isFeatureEngineEnabled) {
      return;
    }

    const externalIds = [activity.garminId, activity.stravaId].filter((id): id is string =>
      Boolean(id),
    );
    for (const externalId of externalIds) {
      await featureEngine.refreshSessionFeaturesForExternalId(athleteId, externalId);
    }
  } catch (error) {
    console.error('[streams] refreshSessionFeaturesAfterStream', activityId, error);
  }
}

/**
 * Renvoie les streams d'une activité (carte + graphes), en les récupérant
 * depuis Garmin ou Strava à la première demande puis en les mettant en cache.
 * Les erreurs transitoires renvoient `null` sans cacher, pour autoriser une retry.
 */
type ActivityWithStream = NonNullable<
  Awaited<
    ReturnType<
      typeof prisma.activity.findFirst<{
        include: { stream: true; bikeMetrics: true };
      }>
    >
  >
>;

async function loadCachedActivityStream(
  activity: ActivityWithStream,
  profile: Awaited<ReturnType<typeof getAthleteProfile>>,
): Promise<ActivityStreamPayload | null> {
  const activityCtx = {
    type: activity.type,
    duration: activity.duration,
    bikeMetrics: activity.bikeMetrics,
  };

  if (!activity.stream) {
    return null;
  }

  if (activity.stream.available && activity.stream.data) {
    return buildPayload(activity.stream.data as unknown as RawStreams, activityCtx, profile);
  }

  // Garmin or Strava can replace an unavailable stub; delete and refetch.
  if (activity.garminId || activity.stravaId) {
    await prisma.activityStream.delete({ where: { id: activity.stream.id } });
    return null;
  }

  return UNAVAILABLE;
}

/**
 * When a stream without position, distance or speed last asked the provider for a fuller one —
 * kept in the stored series so a provider with nothing better is not asked on every open.
 */
type StoredStreams = RawStreams & {
  providerCheckedAt?: number;
  liveHr?: LiveHrStoredMeta;
};

const PROVIDER_RECHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Heart rate alone, no route, no distance, no speed: what an Apple Health copy written by
 * Garmin Connect carries. The provider's own recording holds the rest.
 */
export function isThinStream(raw: RawStreams): boolean {
  return [raw.latlng, raw.distance, raw.velocity].every((series) => !series?.length);
}

/** A thin stream of a session Garmin or Strava also holds is worth asking them again. */
export function shouldAskProviderForFullerStream(
  stored: StoredStreams,
  activity: { garminId: string | null; stravaId: string | null },
  now: number,
): boolean {
  if (!activity.garminId && !activity.stravaId) {
    return false;
  }
  // Live strength HR is also thin — re-check the watch when it may hold more coverage.
  const liveStrengthHr = Boolean(stored.liveHr?.clientSessionId);
  if (!isThinStream(stored) && !liveStrengthHr) {
    return false;
  }
  return !stored.providerCheckedAt || now - stored.providerCheckedAt >= PROVIDER_RECHECK_MS;
}

/** Replaces a thin cached stream with the provider's when it holds more; else notes the try. */
async function upgradeThinStream(
  athleteId: string,
  activity: ActivityWithStream,
  stored: StoredStreams,
): Promise<RawStreams> {
  try {
    const { preferHrStream } =
      await import('@sharpit/server/lib/integrations/ios-strength/live-hr');
    const fuller = await fetchRawStreams(athleteId, activity);
    if (fuller) {
      const fullerNotThin = !isThinStream(fuller);
      const fullerHasBetterHr = preferHrStream(stored, fuller) === 'b';
      const shouldReplace = fullerNotThin || fullerHasBetterHr;
      if (
        shouldReplace &&
        (await persistStream(athleteId, activity.id, fuller, {
          // Provider series replaces live capture — drop the BLE/watch-app label.
          liveHr: null,
        }))
      ) {
        return fuller;
      }
    }
  } catch (error) {
    console.error('[streams] upgradeThinStream', activity.id, error);
  }
  await prisma.activityStream.update({
    where: { activityId: activity.id },
    data: { data: { ...stored, providerCheckedAt: Date.now() } as unknown as object },
  });
  return stored;
}

export async function getActivityStreams(
  athleteId: string,
  activityId: string,
): Promise<ActivityStreamPayload | null> {
  const [activity, profile] = await Promise.all([
    prisma.activity.findFirst({
      where: { id: activityId, athleteId },
      include: { stream: true, bikeMetrics: true },
    }),
    getAthleteProfile(athleteId),
  ]);
  if (!activity) {
    return null;
  }

  const stored = activity.stream?.available
    ? (activity.stream.data as unknown as StoredStreams)
    : null;
  if (stored && shouldAskProviderForFullerStream(stored, activity, Date.now())) {
    const raw = await upgradeThinStream(athleteId, activity, stored);
    return buildPayload(
      raw,
      { type: activity.type, duration: activity.duration, bikeMetrics: activity.bikeMetrics },
      profile,
    );
  }

  const cached = await loadCachedActivityStream(activity, profile);
  if (isSet(cached)) {
    return cached;
  }

  if (!activity.garminId && !activity.stravaId) {
    await createUnavailableStreamStub(activityId);
    return UNAVAILABLE;
  }

  try {
    const raw = await fetchRawStreams(athleteId, activity);
    const available = await persistStream(athleteId, activityId, raw);
    const activityCtx = {
      type: activity.type,
      duration: activity.duration,
      bikeMetrics: activity.bikeMetrics,
    };
    return available && raw ? buildPayload(raw, activityCtx, profile) : UNAVAILABLE;
  } catch (error) {
    console.error('getActivityStreams', error);
    return null;
  }
}

/**
 * Cached streams only — never triggers Garmin/Strava fetch.
 * Used by post-session narrative so analysis stays off the remote critical path.
 */
export async function getCachedActivityStreams(
  athleteId: string,
  activityId: string,
): Promise<ActivityStreamPayload | null> {
  const [activity, profile] = await Promise.all([
    prisma.activity.findFirst({
      where: { id: activityId, athleteId },
      include: { stream: true, bikeMetrics: true },
    }),
    getAthleteProfile(athleteId),
  ]);
  if (
    !activity?.stream?.available ||
    activity.stream.data === undefined ||
    activity.stream.data === null
  ) {
    return null;
  }

  return buildPayload(
    activity.stream.data as unknown as RawStreams,
    {
      type: activity.type,
      duration: activity.duration,
      bikeMetrics: activity.bikeMetrics,
    },
    profile,
  );
}

/** Utilitaire backfill : récupère et persiste les streams d'une activité. */
export async function fetchAndCacheActivityStreams(
  athleteId: string,
  activityId: string,
  sources: { garminId: string | null; stravaId: string | null },
): Promise<{ available: boolean; raw: RawStreams | null }> {
  const raw = await fetchRawStreams(athleteId, sources);
  const available = await persistStream(athleteId, activityId, raw);
  return { available, raw };
}
