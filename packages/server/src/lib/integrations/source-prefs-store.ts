import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import {
  parseSourcePrefs,
  resolveSourcePrefs,
  type IntegrationSourcePrefs,
} from '@sharpit/app/lib/integrations/source-prefs';
import { prisma } from '@sharpit/db/client';
import { Prisma } from '@prisma/client';

export async function loadConnectedIntegrationIds(athleteId: string): Promise<IntegrationId[]> {
  const [garmin, strava, withings, renpho, google, profile] = await Promise.all([
    prisma.garminAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.stravaAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.withingsAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.renphoAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.googleAccount.findUnique({ where: { athleteId }, select: { athleteId: true } }),
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { appleHealthLinkedAt: true, appleCalendarLinkedAt: true },
    }),
  ]);

  /** Sharpit nutrition is always available — no OAuth account. */
  const ids: IntegrationId[] = ['sharpit'];
  if (garmin) {
    ids.push('garmin');
  }
  if (strava) {
    ids.push('strava');
  }
  if (withings) {
    ids.push('withings');
  }
  if (renpho) {
    ids.push('renpho');
  }
  if (google) {
    ids.push('google');
  }
  if (profile?.appleHealthLinkedAt) {
    ids.push('apple-health');
  }
  if (profile?.appleCalendarLinkedAt) {
    ids.push('apple-calendar');
  }
  return ids;
}

export async function loadResolvedSourcePrefs(athleteId: string): Promise<IntegrationSourcePrefs> {
  const [profile, connected] = await Promise.all([
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { integrationSourcePrefs: true },
    }),
    loadConnectedIntegrationIds(athleteId),
  ]);
  return resolveSourcePrefs(profile?.integrationSourcePrefs, connected);
}

export async function saveSourcePrefs(
  athleteId: string,
  prefs: IntegrationSourcePrefs,
): Promise<IntegrationSourcePrefs> {
  const connected = await loadConnectedIntegrationIds(athleteId);
  const sanitized = resolveSourcePrefs(prefs, connected);
  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: { integrationSourcePrefs: sanitized as unknown as Prisma.InputJsonValue },
  });
  return sanitized;
}

/** Persist prefs only if the athlete already has an explicit prefs document (or force). */
export async function persistSourcePrefsMutation(
  athleteId: string,
  mutate: (current: IntegrationSourcePrefs) => IntegrationSourcePrefs,
): Promise<IntegrationSourcePrefs> {
  const [profile, connected] = await Promise.all([
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: { integrationSourcePrefs: true },
    }),
    loadConnectedIntegrationIds(athleteId),
  ]);
  const current =
    parseSourcePrefs(profile?.integrationSourcePrefs) ?? resolveSourcePrefs(null, connected);
  const next = mutate(current);
  return saveSourcePrefs(athleteId, next);
}
