import { Prisma } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { format, startOfDay, subDays } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import {
  syncSinceFromLastSync,
  syncWindowDays,
} from '@sharpit/server/lib/integrations/shared/sync-since';
import {
  fetchAthleteThresholds,
  fetchDailyHealth,
  fetchWeightRange,
  type GarminAthleteThresholds,
  type GarminDailyHealth,
} from '@sharpit/server/lib/integrations/garmin/garmin';
import {
  garminClientFromApiKey,
  type GarminPersonalClient,
} from '@sharpit/server/lib/integrations/garmin/garmin-personal-api';
import {
  garminHealthWrite,
  restrictGarminHealthUpdate,
  SHARED_OBSERVATION_TYPES,
  type GarminHealthWrite,
} from '@sharpit/server/lib/integrations/garmin/garmin-health-policy';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { garminHealthToObservations } from '@sharpit/server/adapters/garmin-health-adapter';
import {
  isCredentialFailure,
  isGarminAccountConnected,
  isDecryptMalformedSoftFailure,
  ProviderAuthError,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import { backfillHealthObservationsFromDailyHealth } from '../shared/health-observation-backfill';
import { mapWithConcurrency } from '@sharpit/server/lib/async/map-with-concurrency';
import {
  decryptSecret,
  encryptSecret,
  isSecretAuthenticityFailure,
} from '@sharpit/server/lib/secret-box';

const GARMIN_RECONNECT_MESSAGE =
  'Clé API Garmin refusée ou expirée. Ajoute une nouvelle clé dans les paramètres.';

/** Cold open-path fallback when Garmin never synced — cron covers deeper history. */
export const GARMIN_HEALTH_OPEN_PATH_FALLBACK_DAYS = 14;
/** Default cold fallback for cron / manual incremental sync. */
export const GARMIN_HEALTH_DEFAULT_FALLBACK_DAYS = 60;
/** Parallel day fetches — keep modest to respect Garmin rate limits. */
export const GARMIN_HEALTH_DAY_CONCURRENCY = 4;

async function ingestGarminHealth(
  athleteId: string,
  health: GarminDailyHealth,
  calendarDate: Date,
  write: GarminHealthWrite,
): Promise<void> {
  try {
    // Behind Apple Health, the night and the heart it feeds the Core are Apple's (ADR-054).
    const raws = garminHealthToObservations(health, calendarDate, new Date()).filter(
      (raw) => write === 'own' || !SHARED_OBSERVATION_TYPES.has(raw.type),
    );
    if (raws.length === 0) {
      return;
    }
    await observationEngine.ingestBatch(athleteId, raws);
  } catch (err) {
    console.error('[ObservationEngine] garmin-health ingest failed:', err);
  }
}

export async function getGarminAccount(athleteId: string) {
  return prisma.garminAccount.findUnique({ where: { athleteId } });
}

/**
 * Opens a Garmin client for an account: decrypts the stored Personal API key and exchanges it
 * for a 24 h bearer. The only place the key is decrypted; the plaintext never leaves this call.
 */
export async function buildFreshGarminClient(
  _athleteId: string,
  account: { apiKeyEnc: string },
): Promise<GarminPersonalClient> {
  return garminClientFromApiKey(decryptSecret(account.apiKeyEnc));
}

/** Client Garmin authentifié (clé en base). */
export async function getGarminClient(athleteId: string) {
  const account = await getGarminAccount(athleteId);
  if (!account || !isGarminAccountConnected(account)) {
    throw new ProviderAuthError(GARMIN_RECONNECT_MESSAGE);
  }
  return buildFreshGarminClient(athleteId, account);
}

export async function disconnectGarmin(athleteId: string) {
  await prisma.garminAccount.deleteMany({ where: { athleteId } });
}

/** Wipes the key but keeps the profile row so the hub can ask for a new key. */
export async function revokeGarminCredentials(athleteId: string) {
  await prisma.garminAccount.updateMany({
    where: { athleteId },
    data: { apiKeyEnc: '' },
  });
}

export async function runGarminCall<T>(athleteId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Wrong-key / GCM auth failure: fleet incident — never wipe stored keys.
    if (isSecretAuthenticityFailure(error)) {
      throw error;
    }
    // Local placeholder / unframed blob, or a key Garmin refuses: clear so the hub asks again.
    if (isDecryptMalformedSoftFailure(error) || isCredentialFailure(error)) {
      await revokeGarminCredentials(athleteId);
      throw new ProviderAuthError(GARMIN_RECONNECT_MESSAGE, { cause: error });
    }
    throw error;
  }
}

/**
 * Validates a Personal API key against Garmin, then stores it encrypted (write-only).
 * An invalid key throws before anything is written.
 */
export async function connectGarminWithApiKey(athleteId: string, apiKey: string) {
  const client = await garminClientFromApiKey(apiKey);
  const profile = await readGarminProfile(client);
  const stored = { ...profile, apiKeyEnc: encryptSecret(apiKey), apiKeyLast4: apiKey.slice(-4) };
  await prisma.garminAccount.upsert({
    where: { athleteId },
    create: { athleteId, ...stored },
    update: stored,
  });
  return { displayName: profile.displayName, apiKeyLast4: stored.apiKeyLast4 };
}

async function readGarminProfile(client: GarminPersonalClient) {
  try {
    const profile = (await client.getUserProfile()) as {
      displayName?: string;
      fullName?: string;
      userName?: string;
    } | null;
    return {
      displayName: profile?.displayName ?? profile?.userName ?? null,
      fullName: profile?.fullName ?? null,
    };
  } catch {
    // Profile is best-effort — the token exchange already proved the key.
    return { displayName: null, fullName: null };
  }
}

export interface GarminThresholdsImport extends GarminAthleteThresholds {
  imported: boolean;
}

/**
 * Importe les seuils de l'athlète depuis Garmin et les enregistre dans le
 * profil. Seuls les champs renvoyés par Garmin sont écrits (un champ absent ne
 * remplace pas une valeur existante).
 */
function buildThresholdProfileUpdate(
  thresholds: GarminAthleteThresholds,
): Prisma.AthleteProfileUncheckedUpdateInput {
  const data: Prisma.AthleteProfileUncheckedUpdateInput =
    thresholds.failedSources.length === 0 ? { thresholdsSyncedAt: new Date() } : {};
  const fields: Array<[keyof Prisma.AthleteProfileUncheckedUpdateInput, number | null]> = [
    ['ftpW', thresholds.ftpW],
    ['maxHr', thresholds.maxHr],
    ['lthr', thresholds.lthr],
    ['runThresholdPaceSecPerKm', thresholds.runThresholdPaceSecPerKm],
    ['vo2maxRunning', thresholds.vo2maxRunning],
    ['vo2maxCycling', thresholds.vo2maxCycling],
  ];
  for (const [key, value] of fields) {
    if (isSet(value)) {
      data[key] = value as never;
    }
  }
  return data;
}

function thresholdsWereImported(thresholds: GarminAthleteThresholds): boolean {
  return [
    thresholds.ftpW,
    thresholds.maxHr,
    thresholds.lthr,
    thresholds.runThresholdPaceSecPerKm,
    thresholds.vo2maxRunning,
    thresholds.vo2maxCycling,
  ].some((value) => isSet(value));
}

async function importGarminThresholdsForAccount(
  athleteId: string,
  account: NonNullable<Awaited<ReturnType<typeof getGarminAccount>>>,
): Promise<GarminThresholdsImport> {
  const client = await buildFreshGarminClient(athleteId, account);
  const thresholds = await fetchAthleteThresholds(client);

  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: buildThresholdProfileUpdate(thresholds),
  });

  return { ...thresholds, imported: thresholdsWereImported(thresholds) };
}

export async function importGarminThresholds(athleteId: string): Promise<GarminThresholdsImport> {
  return runGarminCall(athleteId, async () => {
    const account = await getGarminAccount(athleteId);
    if (!account || !isGarminAccountConnected(account)) {
      throw new ProviderAuthError(GARMIN_RECONNECT_MESSAGE);
    }
    return importGarminThresholdsForAccount(athleteId, account);
  });
}

export interface GarminSyncResult {
  days: number;
  updated: number;
  emptyDays: number;
  observationsBackfilled?: number;
}

function healthHasData(health: GarminDailyHealth): boolean {
  const { sleep } = health;
  return [
    health.sleepMinutes,
    health.napMinutes,
    health.restingHr,
    health.hrv,
    health.weightKg,
    health.readinessScore,
    health.hrvStatus,
    health.stress,
    health.bodyBattery,
    health.totalSteps,
    sleep.sleepScore,
  ].some((value) => isSet(value));
}

function assignHealthScalars(
  data: Prisma.DailyHealthUpdateInput,
  health: GarminDailyHealth,
  factors: Prisma.InputJsonValue | undefined,
): void {
  const scalarFields: Array<[keyof Prisma.DailyHealthUpdateInput, unknown]> = [
    ['sleepMinutes', health.sleepMinutes],
    ['napMinutes', health.napMinutes],
    ['restingHr', health.restingHr],
    ['hrv', health.hrv],
    ['weightKg', health.weightKg],
    ['recoveryScore', health.readinessScore],
    ['readinessLevel', health.readinessLevel],
    ['readinessFeedback', health.readinessFeedback],
    ['readinessFactors', factors],
    ['hrvStatus', health.hrvStatus],
    ['hrvBaselineLow', health.hrvBaselineLow],
    ['hrvBaselineHigh', health.hrvBaselineHigh],
    ['stress', health.stress],
    ['bodyBattery', health.bodyBattery],
    ['totalSteps', health.totalSteps],
  ];
  for (const [key, value] of scalarFields) {
    if (isSet(value) && value !== undefined) {
      data[key] = value as never;
    }
  }
}

function assignSleepScalars(
  data: Prisma.DailyHealthUpdateInput,
  sleep: GarminDailyHealth['sleep'],
): void {
  const sleepFields: Array<[keyof Prisma.DailyHealthUpdateInput, unknown]> = [
    ['sleepScore', sleep.sleepScore],
    ['sleepDeepMin', sleep.sleepDeepMin],
    ['sleepLightMin', sleep.sleepLightMin],
    ['sleepRemMin', sleep.sleepRemMin],
    ['sleepAwakeMin', sleep.sleepAwakeMin],
    ['sleepBedtimeMin', sleep.sleepBedtimeMin],
    ['sleepWakeMin', sleep.sleepWakeMin],
    ['sleepRespiration', sleep.sleepRespiration],
    ['sleepAvgStress', sleep.sleepAvgStress],
    ['sleepScoreFeedback', sleep.sleepScoreFeedback],
  ];
  for (const [key, value] of sleepFields) {
    if (isSet(value)) {
      data[key] = value as never;
    }
  }
}

function buildGarminHealthUpdateData(health: GarminDailyHealth): Prisma.DailyHealthUpdateInput {
  const factors = isSet(health.readinessFactors)
    ? (health.readinessFactors as unknown as Prisma.InputJsonValue)
    : undefined;
  const data: Prisma.DailyHealthUpdateInput = {};
  assignHealthScalars(data, health, factors);
  assignSleepScalars(data, health.sleep);
  return data;
}

function buildGarminHealthCreateData(
  athleteId: string,
  day: Date,
  health: GarminDailyHealth,
  factors: Prisma.InputJsonValue | undefined,
): Prisma.DailyHealthUncheckedCreateInput {
  const { sleep } = health;
  return {
    athleteId,
    date: day,
    sleepMinutes: health.sleepMinutes,
    napMinutes: health.napMinutes,
    restingHr: health.restingHr,
    hrv: health.hrv,
    weightKg: health.weightKg,
    recoveryScore: health.readinessScore,
    readinessLevel: health.readinessLevel,
    readinessFeedback: health.readinessFeedback,
    readinessFactors: factors,
    hrvStatus: health.hrvStatus,
    hrvBaselineLow: health.hrvBaselineLow,
    hrvBaselineHigh: health.hrvBaselineHigh,
    stress: health.stress,
    bodyBattery: health.bodyBattery,
    totalSteps: health.totalSteps,
    sleepScore: sleep.sleepScore,
    sleepDeepMin: sleep.sleepDeepMin,
    sleepLightMin: sleep.sleepLightMin,
    sleepRemMin: sleep.sleepRemMin,
    sleepAwakeMin: sleep.sleepAwakeMin,
    sleepBedtimeMin: sleep.sleepBedtimeMin,
    sleepWakeMin: sleep.sleepWakeMin,
    sleepRespiration: sleep.sleepRespiration,
    sleepAvgStress: sleep.sleepAvgStress,
    sleepScoreFeedback: sleep.sleepScoreFeedback,
  };
}

async function upsertGarminHealthDay(
  athleteId: string,
  client: GarminPersonalClient,
  date: Date,
  weightKg: number | null,
  write: GarminHealthWrite,
): Promise<'updated' | 'empty'> {
  const health = await fetchDailyHealth(client, date, weightKg);
  if (!healthHasData(health)) {
    return 'empty';
  }

  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const factors = isSet(health.readinessFactors)
    ? (health.readinessFactors as unknown as Prisma.InputJsonValue)
    : undefined;

  // Read in every mode: the weight only ever fills a day (restrictGarminHealthUpdate).
  const existing = await prisma.dailyHealth.findUnique({
    where: { athleteId_date: { athleteId, date: day } },
  });
  await prisma.dailyHealth.upsert({
    where: { athleteId_date: { athleteId, date: day } },
    create: restrictGarminHealthUpdate(
      buildGarminHealthCreateData(athleteId, day, health, factors),
      null,
      write === 'off' ? 'off' : 'own',
    ),
    update: restrictGarminHealthUpdate(buildGarminHealthUpdateData(health), existing, write),
  });
  await ingestGarminHealth(athleteId, health, day, write);
  return 'updated';
}

function buildGarminHealthDateRange(
  options: { days?: number; full?: boolean } | undefined,
  lastSyncAt: Date | null,
): { since: Date; days: number; dates: Date[] } {
  const fallbackDays = options?.days ?? GARMIN_HEALTH_DEFAULT_FALLBACK_DAYS;
  const today = startOfDay(new Date());
  const since = options?.full
    ? subDays(today, 365)
    : syncSinceFromLastSync(lastSyncAt, fallbackDays);
  const days = syncWindowDays(since);
  const dates: Date[] = [];
  for (let date = today; date >= since; date = subDays(date, 1)) {
    dates.push(date);
  }
  return { since, days, dates };
}

async function runGarminHealthSync(
  athleteId: string,
  options?: { days?: number; full?: boolean },
): Promise<GarminSyncResult> {
  const account = await getGarminAccount(athleteId);
  if (!account || !isGarminAccountConnected(account)) {
    throw new ProviderAuthError(GARMIN_RECONNECT_MESSAGE);
  }

  const client = await buildFreshGarminClient(athleteId, account);
  const { since, days, dates } = buildGarminHealthDateRange(options, account.lastSyncAt);
  const weightMap = await fetchWeightRange(client, since, startOfDay(new Date()));
  const write = garminHealthWrite(await loadResolvedSourcePrefs(athleteId));

  const outcomes = await mapWithConcurrency(dates, GARMIN_HEALTH_DAY_CONCURRENCY, (date) => {
    const weightKg = weightMap.get(format(date, 'yyyy-MM-dd')) ?? null;
    return upsertGarminHealthDay(athleteId, client, date, weightKg, write);
  });

  const updated = outcomes.filter((o) => o === 'updated').length;
  const emptyDays = outcomes.filter((o) => o === 'empty').length;

  await prisma.garminAccount.update({
    where: { athleteId },
    data: { lastSyncAt: new Date() },
  });

  const backfill = await backfillHealthObservationsFromDailyHealth(athleteId, {
    days: options?.full ? 365 : days,
  });

  return { days, updated, emptyDays, observationsBackfilled: backfill.ingested };
}

export async function syncGarminHealth(
  athleteId: string,
  options?: {
    days?: number;
    full?: boolean;
  },
): Promise<GarminSyncResult> {
  return runGarminCall(athleteId, () => runGarminHealthSync(athleteId, options));
}
