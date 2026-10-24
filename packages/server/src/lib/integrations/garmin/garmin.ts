import { isSet } from '@sharpit/shared/value';
import { format } from 'date-fns';
import { pickCurrentBodyBattery } from '@sharpit/server/lib/integrations/garmin/garmin-body-battery';
import type { GarminPersonalClient } from '@sharpit/server/lib/integrations/garmin/garmin-personal-api';

export interface GarminReadinessFactor {
  key: string;
  percent: number | null;
  feedback: string | null;
}

export interface GarminSleepDetail {
  sleepMinutes: number | null;
  napMinutes: number | null;
  sleepScore: number | null;
  sleepDeepMin: number | null;
  sleepLightMin: number | null;
  sleepRemMin: number | null;
  sleepAwakeMin: number | null;
  sleepBedtimeMin: number | null;
  sleepWakeMin: number | null;
  sleepRespiration: number | null;
  sleepAvgStress: number | null;
  sleepScoreFeedback: string | null;
}

export interface GarminDailyHealth {
  date: string;
  sleepMinutes: number | null;
  napMinutes: number | null;
  restingHr: number | null;
  hrv: number | null;
  weightKg: number | null;
  readinessScore: number | null;
  readinessLevel: string | null;
  readinessFeedback: string | null;
  readinessFactors: GarminReadinessFactor[] | null;
  hrvStatus: string | null;
  hrvBaselineLow: number | null;
  hrvBaselineHigh: number | null;
  stress: number | null;
  bodyBattery: number | null;
  /** Daily step count from Garmin wellness stats. */
  totalSteps: number | null;
  sleep: GarminSleepDetail;
}

type GCClient = GarminPersonalClient;

/** Garmin endpoints the thresholds are assembled from. */
export type GarminThresholdSource = 'user-settings' | 'heart-rate-zones' | 'power-zones';

export interface GarminAthleteThresholds {
  ftpW: number | null;
  maxHr: number | null;
  lthr: number | null;
  runThresholdPaceSecPerKm: number | null;
  vo2maxRunning: number | null;
  vo2maxCycling: number | null;
  /**
   * Sources that could not be read.
   *
   * Without this, a null field is ambiguous: it means either "Garmin has no
   * value for this athlete" or "the request failed". Those need different
   * handling, and conflating them let this app run for months on null maxHr and
   * ftpW while reporting a successful sync.
   */
  failedSources: GarminThresholdSource[];
}

export interface GarminHeartRateZoneRow {
  sport?: string;
  maxHeartRateUsed?: number;
}

/**
 * Picks profile max HR from Garmin heart-rate zones.
 * Prefers DEFAULT, then RUNNING, then the first row with a usable value.
 */
const PREFERRED_HR_ZONE_SPORTS = ['DEFAULT', 'RUNNING'] as const;

function zoneMaxHeartRate(row: GarminHeartRateZoneRow | undefined): number | null {
  const value = row?.maxHeartRateUsed;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null;
}

export function pickMaxHeartRateFromZones(
  zones: GarminHeartRateZoneRow[] | null | undefined,
): number | null {
  if (!Array.isArray(zones) || zones.length === 0) {
    return null;
  }
  for (const sport of PREFERRED_HR_ZONE_SPORTS) {
    const fromPreferred = zoneMaxHeartRate(zones.find((z) => z.sport === sport));
    if (isSet(fromPreferred)) {
      return fromPreferred;
    }
  }
  return zoneMaxHeartRate(zones[0]);
}

function runThresholdPaceSecPerKm(
  rawSpeed: unknown,
  num: (v: unknown) => number | null,
): number | null {
  let speed = num(rawSpeed);
  if (speed === undefined || speed === null) {
    return null;
  }
  if (speed < 1.5) {
    speed *= 10;
  }
  return speed > 0 ? Math.round(1000 / speed) : null;
}

function applyUserSettingsThresholds(
  userData: Record<string, unknown>,
  num: (v: unknown) => number | null,
  result: GarminAthleteThresholds,
): void {
  result.lthr = num(userData.lactateThresholdHeartRate);
  result.vo2maxRunning = num(userData.vo2MaxRunning);
  result.vo2maxCycling = num(userData.vo2MaxCycling);
  result.runThresholdPaceSecPerKm = runThresholdPaceSecPerKm(userData.lactateThresholdSpeed, num);
}

/**
 * Récupère les seuils de l'athlète depuis Garmin (réglages utilisateur + zones
 * FC / puissance vélo). Tout est optionnel : un champ absent renvoie `null`.
 */
export async function fetchAthleteThresholds(client: GCClient): Promise<GarminAthleteThresholds> {
  const result: GarminAthleteThresholds = {
    ftpW: null,
    maxHr: null,
    lthr: null,
    runThresholdPaceSecPerKm: null,
    vo2maxRunning: null,
    vo2maxCycling: null,
    failedSources: [],
  };

  const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) && v > 0 ? v : null);

  const fail = (source: GarminThresholdSource, error: unknown) => {
    result.failedSources.push(source);
    console.error(`[garmin/thresholds] ${source} unavailable`, error);
  };

  try {
    const settings = (await client.get('/userprofile-service/userprofile/user-settings')) as {
      userData?: Record<string, unknown>;
    } | null;
    const u = settings?.userData;
    if (u) {
      applyUserSettingsThresholds(u, num, result);
    }
  } catch (error) {
    fail('user-settings', error);
  }

  try {
    const zones = (await client.get('/biometric-service/heartRateZones')) as
      GarminHeartRateZoneRow[] | null;
    result.maxHr = pickMaxHeartRateFromZones(zones);
  } catch (error) {
    fail('heart-rate-zones', error);
  }

  try {
    const power = (await client.get('/biometric-service/powerZones/sport/CYCLING')) as {
      functionalThresholdPower?: number;
    } | null;
    result.ftpW = num(power?.functionalThresholdPower);
  } catch (error) {
    fail('power-zones', error);
  }

  return result;
}

async function fetchHrv(client: GCClient, date: Date): Promise<number | null> {
  try {
    const dateString = format(date, 'yyyy-MM-dd');
    const result = (await client.get(`/hrv-service/hrv/${dateString}`)) as {
      hrvSummary?: { lastNightAvg?: number; weeklyAvg?: number };
    } | null;
    return result?.hrvSummary?.lastNightAvg ?? null;
  } catch {
    return null;
  }
}

const EMPTY_SLEEP: GarminSleepDetail = {
  sleepMinutes: null,
  napMinutes: null,
  sleepScore: null,
  sleepDeepMin: null,
  sleepLightMin: null,
  sleepRemMin: null,
  sleepAwakeMin: null,
  sleepBedtimeMin: null,
  sleepWakeMin: null,
  sleepRespiration: null,
  sleepAvgStress: null,
  sleepScoreFeedback: null,
};

/** Minutes depuis minuit (heure locale) à partir d'un timestamp local Garmin.
 * Les `*TimestampLocal` Garmin incluent déjà l'offset : lire les composantes
 * UTC donne donc l'heure murale locale. */
function localMinutesOfDay(localEpochMs: unknown): number | null {
  const ms = Number(localEpochMs);
  if (!Number.isFinite(ms) || ms <= 0) {
    return null;
  }
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function secToMin(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    return null;
  }
  return Math.round(n / 60);
}

async function fetchSleepDuration(client: GCClient, date: Date): Promise<number | null> {
  try {
    const dto = sleepDtoFrom(await client.getSleepData(date));
    const start = dto?.sleepStartTimestampGMT;
    const end = dto?.sleepEndTimestampGMT;
    if (typeof start !== 'number' || typeof end !== 'number') {
      return null;
    }
    const total = Math.round((end - start) / 60_000);
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

/** `dailySleepDTO` wrapper (Connect) or the bare DTO — the Personal API shape is not documented. */
function sleepDtoFrom(data: unknown): GarminSleepDto | null {
  if (!data || typeof data !== 'object') {
    return null;
  }
  const wrapped = (data as { dailySleepDTO?: GarminSleepDto }).dailySleepDTO;
  return wrapped ?? (data as GarminSleepDto);
}

type GarminSleepDto = {
  sleepTimeSeconds?: number;
  napTimeSeconds?: number;
  deepSleepSeconds?: number;
  lightSleepSeconds?: number;
  remSleepSeconds?: number;
  awakeSleepSeconds?: number;
  sleepStartTimestampLocal?: number;
  sleepEndTimestampLocal?: number;
  sleepStartTimestampGMT?: number;
  sleepEndTimestampGMT?: number;
  averageRespirationValue?: number;
  avgSleepStress?: number;
  sleepScoreFeedback?: string;
  sleepScores?: { overall?: { value?: number } };
};

async function parseSleepDto(
  dto: GarminSleepDto,
  client: GCClient,
  date: Date,
): Promise<GarminSleepDetail> {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

  const deep = secToMin(dto.deepSleepSeconds);
  const light = secToMin(dto.lightSleepSeconds);
  const rem = secToMin(dto.remSleepSeconds);
  const awake = secToMin(dto.awakeSleepSeconds);
  const sleepMinutes = await resolveSleepMinutes({ dto, deep, light, rem, client, date });
  const napMinutesRaw = secToMin(dto.napTimeSeconds);
  const napMinutes = isSet(napMinutesRaw) && napMinutesRaw > 0 ? napMinutesRaw : null;

  return {
    sleepMinutes,
    napMinutes,
    sleepScore: num(dto.sleepScores?.overall?.value),
    sleepDeepMin: deep,
    sleepLightMin: light,
    sleepRemMin: rem,
    sleepAwakeMin: awake,
    sleepBedtimeMin: localMinutesOfDay(dto.sleepStartTimestampLocal),
    sleepWakeMin: localMinutesOfDay(dto.sleepEndTimestampLocal),
    sleepRespiration: num(dto.averageRespirationValue),
    sleepAvgStress: num(dto.avgSleepStress),
    sleepScoreFeedback: typeof dto.sleepScoreFeedback === 'string' ? dto.sleepScoreFeedback : null,
  };
}

type ResolveSleepMinutesInput = {
  dto: { sleepTimeSeconds?: number };
  deep: number | null;
  light: number | null;
  rem: number | null;
  client: GCClient;
  date: Date;
};

async function resolveSleepMinutes(input: ResolveSleepMinutesInput): Promise<number | null> {
  const { dto, deep, light, rem, client, date } = input;
  const sleepMinutes = secToMin(dto.sleepTimeSeconds);
  if (isSet(sleepMinutes)) {
    return sleepMinutes;
  }
  const sum = (deep ?? 0) + (light ?? 0) + (rem ?? 0);
  return sum > 0 ? sum : fetchSleepDuration(client, date);
}

async function fetchSleepDetail(client: GCClient, date: Date): Promise<GarminSleepDetail> {
  try {
    const dto = sleepDtoFrom(await client.getSleepData(date));
    if (!dto) {
      const minutes = await fetchSleepDuration(client, date);
      return { ...EMPTY_SLEEP, sleepMinutes: minutes };
    }

    return parseSleepDto(dto, client, date);
  } catch {
    const minutes = await fetchSleepDuration(client, date);
    return { ...EMPTY_SLEEP, sleepMinutes: minutes };
  }
}

async function fetchRestingHr(client: GCClient, date: Date): Promise<number | null> {
  try {
    const hr = (await client.getHeartRate(date)) as {
      restingHeartRate?: number | null;
    };
    return hr?.restingHeartRate ?? null;
  } catch {
    return null;
  }
}

/**
 * Récupère toutes les vraies pesées sur une période en une seule requête.
 * Garmin ne mesure pas le poids depuis la montre : il provient d'une balance
 * connectée ou d'une saisie manuelle, donc il n'existe que sur certains jours.
 * Retourne une map clé "yyyy-MM-dd" -> poids en kg (pesées réelles uniquement).
 */
function weightDayKey(day: {
  summaryDate?: string;
  latestWeight?: { weight?: number | null; calendarDate?: string };
}): string | undefined {
  return day?.summaryDate ?? day?.latestWeight?.calendarDate;
}

function addWeightDayToMap(
  map: Map<string, number>,
  day: {
    summaryDate?: string;
    latestWeight?: { weight?: number | null; calendarDate?: string };
  },
): void {
  const grams = day?.latestWeight?.weight;
  const key = weightDayKey(day);
  if (isSet(grams) && !Number.isNaN(grams) && key) {
    map.set(key, Number((grams / 1000).toFixed(1)));
  }
}

export async function fetchWeightRange(
  client: GCClient,
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const s = format(start, 'yyyy-MM-dd');
    const e = format(end, 'yyyy-MM-dd');
    const data = (await client.get(`/weight-service/weight/range/${s}/${e}?includeAll=true`)) as {
      dailyWeightSummaries?: Array<{
        summaryDate?: string;
        latestWeight?: { weight?: number | null; calendarDate?: string };
      }>;
    } | null;

    for (const day of data?.dailyWeightSummaries ?? []) {
      addWeightDayToMap(map, day);
    }
  } catch {
    // pas de données de poids : map vide
  }
  return map;
}

interface ReadinessResult {
  readinessScore: number | null;
  readinessLevel: string | null;
  readinessFeedback: string | null;
  readinessFactors: GarminReadinessFactor[] | null;
}

async function fetchTrainingReadiness(client: GCClient, date: Date): Promise<ReadinessResult> {
  const empty: ReadinessResult = {
    readinessScore: null,
    readinessLevel: null,
    readinessFeedback: null,
    readinessFactors: null,
  };
  try {
    const ds = format(date, 'yyyy-MM-dd');
    const raw = (await client.get(`/metrics-service/metrics/trainingreadiness/${ds}`)) as Array<
      Record<string, unknown>
    > | null;
    const r = Array.isArray(raw) ? raw[0] : null;
    if (!r) {
      return empty;
    }

    const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : null);
    const str = (v: unknown) => (typeof v === 'string' ? v : null);

    const factors: GarminReadinessFactor[] = [
      {
        key: 'sleep',
        percent: num(r.sleepScoreFactorPercent),
        feedback: str(r.sleepScoreFactorFeedback),
      },
      { key: 'hrv', percent: num(r.hrvFactorPercent), feedback: str(r.hrvFactorFeedback) },
      {
        key: 'recoveryTime',
        percent: num(r.recoveryTimeFactorPercent),
        feedback: str(r.recoveryTimeFactorFeedback),
      },
      { key: 'acwr', percent: num(r.acwrFactorPercent), feedback: str(r.acwrFactorFeedback) },
      {
        key: 'stressHistory',
        percent: num(r.stressHistoryFactorPercent),
        feedback: str(r.stressHistoryFactorFeedback),
      },
      {
        key: 'sleepHistory',
        percent: num(r.sleepHistoryFactorPercent),
        feedback: str(r.sleepHistoryFactorFeedback),
      },
    ].filter((f) => isSet(f.percent) || isSet(f.feedback));

    return {
      readinessScore: num(r.score),
      readinessLevel: str(r.level),
      readinessFeedback: str(r.feedbackShort),
      readinessFactors: factors.length ? factors : null,
    };
  } catch {
    return empty;
  }
}

interface HrvStatusResult {
  hrvStatus: string | null;
  hrvBaselineLow: number | null;
  hrvBaselineHigh: number | null;
}

function hrvStatusFromSummary(
  summary:
    { status?: string; baseline?: { balancedLow?: number; balancedUpper?: number } } | undefined,
): HrvStatusResult {
  const baseline = summary?.baseline;
  return {
    hrvStatus: summary?.status ?? null,
    hrvBaselineLow: baseline?.balancedLow ?? null,
    hrvBaselineHigh: baseline?.balancedUpper ?? null,
  };
}

function parseHrvStatusResponse(
  r: {
    hrvSummary?: {
      status?: string;
      baseline?: { balancedLow?: number; balancedUpper?: number };
    };
  } | null,
): HrvStatusResult {
  return hrvStatusFromSummary(r?.hrvSummary);
}

async function fetchHrvStatus(client: GCClient, date: Date): Promise<HrvStatusResult> {
  try {
    const ds = format(date, 'yyyy-MM-dd');
    const r = (await client.get(`/hrv-service/hrv/${ds}`)) as {
      hrvSummary?: {
        status?: string;
        baseline?: { balancedLow?: number; balancedUpper?: number };
      };
    } | null;
    return parseHrvStatusResponse(r);
  } catch {
    return { hrvStatus: null, hrvBaselineLow: null, hrvBaselineHigh: null };
  }
}

async function fetchStressAndBattery(
  client: GCClient,
  date: Date,
): Promise<{ stress: number | null; bodyBattery: number | null }> {
  try {
    const ds = format(date, 'yyyy-MM-dd');
    const r = (await client.get(`/wellness-service/wellness/dailyStress/${ds}`)) as {
      avgStressLevel?: number | null;
      bodyBatteryMostRecentValue?: number | null;
      bodyBatteryValuesArray?: Array<Array<number | string>>;
    } | null;

    const stress =
      typeof r?.avgStressLevel === 'number' && r.avgStressLevel >= 0 ? r.avgStressLevel : null;

    // Current / most-recent Body Battery (Garmin Connect parity) — not the day peak.
    const bodyBattery = pickCurrentBodyBattery(r);

    return { stress, bodyBattery };
  } catch {
    return { stress: null, bodyBattery: null };
  }
}

/**
 * Daily step count from Garmin stats (high-confidence movement signal).
 * Endpoint: /usersummary-service/stats/steps/daily/{start}/{end}
 */
type GarminDailyStepsRow = {
  calendarDate?: string;
  totalSteps?: number | null;
};

function normalizeStepsRows(
  payload: GarminDailyStepsRow[] | GarminDailyStepsRow | null,
): GarminDailyStepsRow[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  return payload ? [payload] : [];
}

function stepsFromRows(rows: GarminDailyStepsRow[], dateKey: string): number | null {
  const match = rows.find((row) => row.calendarDate === dateKey) ?? rows[0];
  const steps = match?.totalSteps;
  return typeof steps === 'number' && Number.isFinite(steps) && steps >= 0
    ? Math.round(steps)
    : null;
}

async function fetchTotalSteps(client: GCClient, date: Date): Promise<number | null> {
  try {
    const ds = format(date, 'yyyy-MM-dd');
    const payload = (await client.get(`/usersummary-service/stats/steps/daily/${ds}/${ds}`)) as
      GarminDailyStepsRow[] | GarminDailyStepsRow | null;

    return stepsFromRows(normalizeStepsRows(payload), ds);
  } catch {
    return null;
  }
}

export async function fetchDailyHealth(
  client: GCClient,
  date: Date,
  weightKg: number | null = null,
): Promise<GarminDailyHealth> {
  // Garmin utilise la date de RÉVEIL : getSleepData(date) renvoie la nuit
  // (date-1 → date), qui est précisément celle qui impacte la journée `date`.
  // Idem pour readiness/HRV/FC repos (valeurs du matin de `date`). Tout est donc
  // cohérent sur le même jour `date`.
  const [sleep, restingHr, hrv, readiness, hrvStatus, stressBattery, totalSteps] =
    await Promise.all([
      fetchSleepDetail(client, date),
      fetchRestingHr(client, date),
      fetchHrv(client, date),
      fetchTrainingReadiness(client, date),
      fetchHrvStatus(client, date),
      fetchStressAndBattery(client, date),
      fetchTotalSteps(client, date),
    ]);

  return {
    date: format(date, 'yyyy-MM-dd'),
    sleepMinutes: sleep.sleepMinutes,
    napMinutes: sleep.napMinutes,
    restingHr,
    hrv,
    weightKg,
    readinessScore: readiness.readinessScore,
    readinessLevel: readiness.readinessLevel,
    readinessFeedback: readiness.readinessFeedback,
    readinessFactors: readiness.readinessFactors,
    hrvStatus: hrvStatus.hrvStatus,
    hrvBaselineLow: hrvStatus.hrvBaselineLow,
    hrvBaselineHigh: hrvStatus.hrvBaselineHigh,
    stress: stressBattery.stress,
    bodyBattery: stressBattery.bodyBattery,
    totalSteps,
    sleep,
  };
}
