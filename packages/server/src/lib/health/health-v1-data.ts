import 'server-only';

import { hasProAccess } from '@sharpit/app/lib/access/tier';
import { prisma } from '@sharpit/db/client';
import { biologicalAgeFor, thresholdsMeasuredAt } from '@sharpit/server/lib/body/body-v1';
import type { HealthInputs } from '@sharpit/server/lib/health/health-v1';
import { getBodyCompositionMeasurements } from '@sharpit/server/lib/queries';

/** Two months for the HRV range, plus the week read against it. */
const DAILY_DAYS = 70;
/** A scale is read weekly at best: the trend needs the month before the last two weeks. */
const COMPOSITION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadHealthOverviewInputs(
  athleteId: string,
  now = new Date(),
): Promise<HealthInputs> {
  const [daily, composition, profile] = await Promise.all([
    prisma.dailyHealth.findMany({
      where: { athleteId, date: { gte: new Date(now.getTime() - DAILY_DAYS * DAY_MS) } },
      select: {
        date: true,
        restingHr: true,
        hrv: true,
        hrvBaselineLow: true,
        hrvBaselineHigh: true,
        sleepMinutes: true,
        totalSteps: true,
        sleepRespiration: true,
        weightKg: true,
      },
    }),
    // Deduplicated per day and per the athlete's source preferences (ADR-027).
    getBodyCompositionMeasurements(athleteId, COMPOSITION_DAYS),
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: {
        birthDate: true,
        sex: true,
        tier: true,
        targetWeightKg: true,
        vo2maxRunning: true,
        vo2maxCycling: true,
        ftpW: true,
        maxHr: true,
        lthr: true,
        runThresholdPaceSecPerKm: true,
        swimCssSecPer100m: true,
        thresholdsSyncedAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const isPro = hasProAccess(profile?.tier ?? 'FREE');
  const demographics = profile ? { birthDate: profile.birthDate, sex: profile.sex } : null;
  return {
    daily,
    composition,
    profile: profile && {
      birthDate: profile.birthDate,
      sex: profile.sex,
      vo2max: profile.vo2maxRunning ?? profile.vo2maxCycling,
      vo2maxMeasuredAt:
        profile.vo2maxRunning || profile.vo2maxCycling ? thresholdsMeasuredAt(profile) : null,
      targetWeightKg: profile.targetWeightKg,
    },
    biologicalAge: biologicalAgeFor({ isPro, profile, demographics }, now),
    biologicalAgeAccess: isPro ? 'granted' : 'pro_required',
  };
}
