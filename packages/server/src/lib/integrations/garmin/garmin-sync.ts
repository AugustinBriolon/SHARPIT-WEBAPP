import { Prisma } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { prisma } from '@sharpit/db/client';
import type { GarminDailyHealth } from '@sharpit/server/lib/integrations/garmin/garmin';
import {
  deleteGarminRegistration,
  fetchGarminPermissions,
  fetchGarminUserId,
  garminTokenExpiresAt,
  refreshGarminToken,
  type GarminTokenResponse,
} from '@sharpit/server/lib/integrations/garmin/garmin-oauth';
import {
  garminHealthWrite,
  restrictGarminHealthUpdate,
  SHARED_OBSERVATION_TYPES,
  type GarminHealthWrite,
} from '@sharpit/server/lib/integrations/garmin/garmin-health-policy';
import { loadResolvedSourcePrefs } from '@sharpit/server/lib/integrations/source-prefs-store';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { garminHealthToObservations } from '@sharpit/server/adapters/garmin-health-adapter';
import { resolveOAuthAccessToken } from '@sharpit/server/lib/integrations/shared/oauth-access-token';
import { isUniqueViolation } from '@sharpit/server/lib/prisma-errors';
import { encryptSecret } from '@sharpit/server/lib/secret-box';

const GARMIN_RECONNECT_MESSAGE = 'Session Garmin expirée. Reconnecte Garmin dans les paramètres.';

export async function getGarminAccount(athleteId: string) {
  return prisma.garminAccount.findUnique({ where: { athleteId } });
}

/** Pushes name Garmin's user id, never ours. */
export async function getGarminAccountByUserId(garminUserId: string) {
  return prisma.garminAccount.findUnique({ where: { garminUserId } });
}

function storedTokens(token: GarminTokenResponse) {
  return {
    accessTokenEnc: encryptSecret(token.access_token),
    refreshTokenEnc: encryptSecret(token.refresh_token),
    expiresAt: garminTokenExpiresAt(token),
  };
}

/**
 * Links the Garmin account behind a fresh token to the athlete. `taken` when that Garmin
 * account already feeds another SharpIt athlete: one Garmin user, one athlete.
 */
export async function connectGarminAccount(
  athleteId: string,
  token: GarminTokenResponse,
): Promise<'connected' | 'taken'> {
  const [garminUserId, permissions] = await Promise.all([
    fetchGarminUserId(token.access_token),
    fetchGarminPermissions(token.access_token).catch(() => []),
  ]);
  const owner = await getGarminAccountByUserId(garminUserId);
  if (owner && owner.athleteId !== athleteId) {
    return 'taken';
  }
  const data = { garminUserId, permissions, ...storedTokens(token) };
  try {
    await prisma.garminAccount.upsert({
      where: { athleteId },
      create: { athleteId, ...data },
      update: data,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return 'taken';
    }
    throw error;
  }
  return 'connected';
}

/** Keeps the row so the hub asks for a reconnect. */
export async function revokeGarminCredentials(athleteId: string) {
  await prisma.garminAccount.updateMany({
    where: { athleteId },
    data: { accessTokenEnc: '', refreshTokenEnc: '', expiresAt: new Date(0) },
  });
}

/** A valid access token, refreshed when near expiry (Garmin rotates the refresh token too). */
export async function getValidGarminAccessToken(athleteId: string): Promise<string> {
  const account = await getGarminAccount(athleteId);
  if (!account) {
    throw new Error('Compte Garmin non connecté');
  }
  return resolveOAuthAccessToken({
    athleteId,
    account,
    reconnectMessage: GARMIN_RECONNECT_MESSAGE,
    revoke: revokeGarminCredentials,
    refresh: refreshGarminToken,
    extractAccessToken: (refreshed) => refreshed.access_token,
    persist: async (refreshed) => {
      await prisma.garminAccount.update({ where: { athleteId }, data: storedTokens(refreshed) });
    },
  });
}

/**
 * Disconnecting from SharpIt must also end the registration at Garmin (OAuth2 PKCE spec §6);
 * a failure there never keeps the athlete linked here.
 */
export async function disconnectGarmin(athleteId: string) {
  await endGarminRegistration(athleteId);
  await prisma.garminAccount.deleteMany({ where: { athleteId } });
}

/** Best effort: the athlete leaves SharpIt whatever Garmin answers. */
export async function endGarminRegistration(athleteId: string): Promise<void> {
  if (!(await getGarminAccount(athleteId))) {
    return;
  }
  try {
    await deleteGarminRegistration(await getValidGarminAccessToken(athleteId));
  } catch (error) {
    console.error('[garmin] deregistration failed', {
      name: error instanceof Error ? error.name : 'Error',
    });
  }
}

/** Garmin's own deregistration push: the athlete removed SharpIt from Garmin Connect. */
export async function forgetGarminUser(garminUserId: string) {
  await prisma.garminAccount.deleteMany({ where: { garminUserId } });
}

export async function updateGarminPermissions(garminUserId: string, permissions: string[]) {
  await prisma.garminAccount.updateMany({ where: { garminUserId }, data: { permissions } });
}

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
    if (raws.length > 0) {
      await observationEngine.ingestBatch(athleteId, raws);
    }
  } catch (err) {
    console.error('[ObservationEngine] garmin-health ingest failed:', err);
  }
}

/** Only the fields this push carries: a later push of another summary never blanks them. */
function healthFields(health: GarminDailyHealth): Prisma.DailyHealthUncheckedUpdateInput {
  const { sleep } = health;
  const fields: Record<string, unknown> = {
    sleepMinutes: health.sleepMinutes,
    napMinutes: health.napMinutes,
    restingHr: health.restingHr,
    hrv: health.hrv,
    weightKg: health.weightKg,
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
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => isSet(value)));
}

/**
 * Writes one Garmin day from a push, under the athlete's source policy (ADR-054, ADR-103),
 * then feeds the Core. `health.date` is Garmin's own `yyyy-mm-dd` for that day.
 */
export async function writeGarminHealthDay(
  athleteId: string,
  health: GarminDailyHealth,
): Promise<'updated' | 'empty'> {
  const update = healthFields(health);
  if (Object.keys(update).length === 0) {
    return 'empty';
  }
  const day = new Date(`${health.date}T00:00:00.000Z`);
  const write = garminHealthWrite(await loadResolvedSourcePrefs(athleteId));
  const existing = await prisma.dailyHealth.findUnique({
    where: { athleteId_date: { athleteId, date: day } },
  });
  await prisma.dailyHealth.upsert({
    where: { athleteId_date: { athleteId, date: day } },
    create: {
      ...restrictGarminHealthUpdate(update, null, write === 'off' ? 'off' : 'own'),
      athleteId,
      date: day,
    } as Prisma.DailyHealthUncheckedCreateInput,
    update: restrictGarminHealthUpdate(update, existing, write),
  });
  await ingestGarminHealth(athleteId, health, day, write);
  await prisma.garminAccount.updateMany({ where: { athleteId }, data: { lastSyncAt: new Date() } });
  return 'updated';
}
