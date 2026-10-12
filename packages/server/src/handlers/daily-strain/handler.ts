import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { featureEngine } from '@sharpit/server/lib/engines/feature-engine';
import { prisma } from '@sharpit/db/client';
import { computeDailyStrain } from '@sharpit/server/lib/training/load/daily-strain';
import {
  activityMatchesTrainingDay,
  approximateTrainingDayUtcRange,
  DEFAULT_TRAINING_DAY_START_HOUR,
  DEFAULT_TRAINING_DAY_TIMEZONE,
} from '@sharpit/core/training/training-day';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

function isValidTrainingDayId(trainingDayId: string | null): trainingDayId is string {
  return Boolean(trainingDayId && /^\d{4}-\d{2}-\d{2}$/.test(trainingDayId));
}

type DailyHealthEntry = {
  calories: number | null;
  recoveryScore: number | null;
  stress: number | null;
  bodyBattery: number | null;
  totalSteps: number | null;
  restingHr: number | null;
  hrv: number | null;
};

function buildHealthSignals(healthEntry: DailyHealthEntry | null) {
  if (!healthEntry) {
    return null;
  }
  return {
    calories: healthEntry.calories,
    recoveryScore: healthEntry.recoveryScore,
    stress: healthEntry.stress,
    bodyBattery: healthEntry.bodyBattery,
    totalSteps: healthEntry.totalSteps,
    restingHr: healthEntry.restingHr,
    hrv: healthEntry.hrv,
  };
}

function restingHrFromFeatures(features: Awaited<ReturnType<typeof featureEngine.getDayFeatures>>) {
  if (features.recovery === 'PENDING') {
    return null;
  }
  return features.recovery.rhrAbsolute ?? null;
}

async function loadDailyStrainData(athleteId: string, trainingDayId: string) {
  const [features, activities, athleteProfile, googleAccount, healthEntry] = await Promise.all([
    featureEngine.getDayFeatures(athleteId, trainingDayId),
    prisma.activity.findMany({
      where: {
        athleteId,
        ...visibleActivityWhere,
        date: approximateTrainingDayUtcRange(trainingDayId),
      },
      include: {
        runMetrics: true,
        bikeMetrics: true,
        swimMetrics: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.athleteProfile.findUnique({ where: { id: athleteId } }),
    prisma.googleAccount.findFirst({ select: { timeZone: true } }),
    prisma.dailyHealth.findUnique({
      where: {
        athleteId_date: { athleteId, date: new Date(`${trainingDayId}T00:00:00.000Z`) },
      },
    }),
  ]);
  return { features, activities, athleteProfile, googleAccount, healthEntry };
}

function buildStrainThresholds(
  features: Awaited<ReturnType<typeof featureEngine.getDayFeatures>>,
  athleteProfile: Awaited<ReturnType<typeof prisma.athleteProfile.findUnique>>,
) {
  return {
    ftpW: athleteProfile?.ftpW ?? null,
    maxHr: athleteProfile?.maxHr ?? null,
    lthr: athleteProfile?.lthr ?? null,
    restingHr: restingHrFromFeatures(features),
  };
}

async function computeAthleteDailyStrain(athleteId: string, trainingDayId: string) {
  const { features, activities, athleteProfile, googleAccount, healthEntry } =
    await loadDailyStrainData(athleteId, trainingDayId);
  const trainingDayOptions = {
    timezone: googleAccount?.timeZone ?? DEFAULT_TRAINING_DAY_TIMEZONE,
    trainingDayStartHour: DEFAULT_TRAINING_DAY_START_HOUR,
  };
  const filteredActivities = activities.filter((activity) =>
    activityMatchesTrainingDay(activity.date, trainingDayId, trainingDayOptions),
  );

  return computeDailyStrain({
    sessionFeatures: features.sessions,
    legacyActivities: filteredActivities,
    healthSignals: buildHealthSignals(healthEntry),
    thresholds: buildStrainThresholds(features, athleteProfile),
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const trainingDayId = searchParams.get('trainingDayId');

  if (!isValidTrainingDayId(trainingDayId)) {
    return NextResponse.json(
      { error: 'trainingDayId is required and must be in YYYY-MM-DD format.' },
      { status: 400 },
    );
  }

  try {
    const athleteId = await getCurrentAthleteId();
    const result = await computeAthleteDailyStrain(athleteId, trainingDayId);
    return NextResponse.json({
      athleteId,
      trainingDayId,
      ...result,
    });
  } catch (error) {
    console.error('[api/daily-strain]', error);
    return NextResponse.json(
      { error: 'Daily strain computation failed. Please try again.' },
      { status: 500 },
    );
  }
}
