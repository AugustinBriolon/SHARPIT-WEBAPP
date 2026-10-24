import 'server-only';

import {
  BODY_SERIES_RANGES,
  type BodyInputs,
  type BodySeriesRange,
} from '@sharpit/server/lib/body/body-v1';
import { getGarminAccount } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { hasProAccess } from '@sharpit/app/lib/access/tier';
import { prisma } from '@sharpit/db/client';
import { getBodyCompositionMeasurements } from '@sharpit/server/lib/queries';

/** HRV / resting HR windows reach 30 days back from the latest reading, with margin. */
const OVERVIEW_DAILY_DAYS = 45;
const OVERVIEW_COMPOSITION_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

function sinceDays(days: number | null): Date | null {
  return days === null ? null : new Date(Date.now() - days * DAY_MS);
}

async function loadBodyInputs(options: {
  athleteId: string;
  compositionDays: number | null;
  dailyDays: number | null;
  snapshotsSince: Date | null;
}): Promise<BodyInputs> {
  const { athleteId } = options;
  const dailySince = sinceDays(options.dailyDays);
  const [composition, daily, profile, snapshots, garmin] = await Promise.all([
    // Deduplicated per day and per the athlete's source preferences (ADR-027).
    getBodyCompositionMeasurements(athleteId, options.compositionDays ?? undefined),
    prisma.dailyHealth.findMany({
      where: { athleteId, ...(dailySince ? { date: { gte: dailySince } } : {}) },
      select: {
        date: true,
        hrv: true,
        restingHr: true,
        hrvBaselineLow: true,
        hrvBaselineHigh: true,
        weightKg: true,
      },
      orderBy: { date: 'desc' },
    }),
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: {
        vo2maxRunning: true,
        vo2maxCycling: true,
        ftpW: true,
        maxHr: true,
        lthr: true,
        runThresholdPaceSecPerKm: true,
        swimCssSecPer100m: true,
        thresholdsSyncedAt: true,
        updatedAt: true,
        birthDate: true,
        sex: true,
        tier: true,
      },
    }),
    prisma.athleteThresholdSnapshot.findMany({
      where: {
        profileId: athleteId,
        ...(options.snapshotsSince ? { createdAt: { gte: options.snapshotsSince } } : {}),
      },
      select: {
        createdAt: true,
        source: true,
        ftpW: true,
        lthr: true,
        runThresholdPaceSecPerKm: true,
        swimCssSecPer100m: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    getGarminAccount(athleteId),
  ]);
  return {
    composition,
    daily,
    dailySource: garmin ? 'garmin' : 'apple_health',
    profile,
    snapshots,
    demographics: profile ? { birthDate: profile.birthDate, sex: profile.sex } : null,
    isPro: hasProAccess(profile?.tier ?? 'FREE'),
  };
}

export function loadBodyOverviewInputs(athleteId: string): Promise<BodyInputs> {
  return loadBodyInputs({
    athleteId,
    compositionDays: OVERVIEW_COMPOSITION_DAYS,
    dailyDays: OVERVIEW_DAILY_DAYS,
    snapshotsSince: null,
  });
}

export function loadBodySeriesInputs(
  athleteId: string,
  range: BodySeriesRange,
): Promise<BodyInputs> {
  const days = BODY_SERIES_RANGES[range];
  return loadBodyInputs({
    athleteId,
    compositionDays: days,
    dailyDays: days,
    snapshotsSince: sinceDays(days),
  });
}
