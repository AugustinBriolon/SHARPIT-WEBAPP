import { prisma } from '@sharpit/db/client';
import {
  CURRENT_PRIVACY_VERSION,
  PRIVACY_PURGE_DELAY_DAYS,
} from '@sharpit/app/lib/privacy/constants';
import { ANALYSIS_EVIDENCE_RETENTION } from '@sharpit/server/lib/science/reliability/analysis-evidence';
import { listAnalysisEvidenceForExport } from '@sharpit/server/lib/science/reliability/analysis-evidence-store';

function serializeEvidenceForExport(
  rows: Awaited<ReturnType<typeof listAnalysisEvidenceForExport>>,
) {
  return rows.map((row) => ({
    id: row.id,
    trainingDayId: row.trainingDayId,
    snapshotId: row.snapshotId,
    inputs: row.inputs,
    verdict: row.verdict,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * Athlete data export (JSON). Omits encrypted provider credentials and never
 * includes plaintext secrets. Body metrics and health rows are included as
 * stored — this is the athlete's own copy under GDPR art. 15 / 20.
 *
 * Health category includes AnalysisEvidenceSnapshot rows inside the locked
 * retention window (N=5 OR 14 days, whichever shorter).
 */
export async function buildAthleteExportJson(athleteId: string) {
  const profile = await prisma.athleteProfile.findUniqueOrThrow({
    where: { id: athleteId },
    select: {
      id: true,
      clerkUserId: true,
      tier: true,
      heightCm: true,
      birthDate: true,
      ftpW: true,
      maxHr: true,
      lthr: true,
      runThresholdPaceSecPerKm: true,
      swimCssSecPer100m: true,
      vo2maxRunning: true,
      vo2maxCycling: true,
      displayMode: true,
      equipment: true,
      practicedSports: true,
      defaultPoolLengthM: true,
      sleepTargetMinutes: true,
      sleepBedtimeTargetMin: true,
      homeLocationLabel: true,
      homeLocationLat: true,
      homeLocationLng: true,
      onboardingCompletedAt: true,
      integrationSourcePrefs: true,
      termsAcceptedAt: true,
      privacyAcceptedAt: true,
      privacyVersion: true,
      healthDataConsentAt: true,
      aiProcessingConsentAt: true,
      unofficialProvidersAckAt: true,
      deletedAt: true,
      createdAt: true,
      updatedAt: true,
      // Exclude free-text coach context if desired later; included for completeness.
      context: true,
    },
  });

  const [
    activities,
    dailyHealth,
    dailyNutrition,
    bodyComposition,
    goals,
    plannedSessions,
    physicalNotes,
    conditions,
    conversations,
    dailyBriefings,
    weeklyReviews,
    performanceRecords,
    analysisEvidenceSnapshots,
    foodLogEntries,
    customFoods,
    feedback,
  ] = await Promise.all([
    prisma.activity.findMany({
      where: { athleteId },
      include: {
        runMetrics: true,
        bikeMetrics: true,
        swimMetrics: true,
        hikeMetrics: true,
        strengthSets: true,
      },
      orderBy: { date: 'desc' },
      take: 5000,
    }),
    prisma.dailyHealth.findMany({ where: { athleteId }, orderBy: { date: 'desc' }, take: 2000 }),
    prisma.dailyNutrition.findMany({
      where: { athleteId },
      orderBy: { date: 'desc' },
      take: 2000,
    }),
    prisma.bodyCompositionMeasurement.findMany({
      where: { athleteId },
      orderBy: { measuredAt: 'desc' },
      take: 2000,
    }),
    prisma.goal.findMany({ where: { athleteId } }),
    prisma.plannedSession.findMany({ where: { athleteId }, orderBy: { date: 'desc' }, take: 2000 }),
    prisma.physicalNote.findMany({ where: { athleteId } }),
    prisma.condition.findMany({ where: { athleteId } }),
    prisma.conversation.findMany({
      where: { athleteId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    }),
    prisma.dailyBriefing.findMany({
      where: { athleteId },
      orderBy: { date: 'desc' },
      take: 365,
    }),
    prisma.weeklyReview.findMany({
      where: { athleteId },
      orderBy: { weekStart: 'desc' },
      take: 104,
    }),
    prisma.performanceRecord.findMany({ where: { athleteId } }),
    listAnalysisEvidenceForExport(athleteId),
    prisma.foodLogEntry.findMany({ where: { athleteId }, orderBy: { date: 'desc' }, take: 20000 }),
    prisma.foodProduct.findMany({ where: { ownerId: athleteId } }),
    prisma.athleteFeedback.findMany({ where: { athleteId }, orderBy: { createdAt: 'desc' } }),
  ]);

  // Connection status only — never encrypted tokens / passwords.
  const [garmin, strava, google, renpho, withings, mfp] = await Promise.all([
    prisma.garminAccount.findUnique({
      where: { athleteId },
      select: { athleteId: true, createdAt: true, updatedAt: true },
    }),
    prisma.stravaAccount.findUnique({
      where: { athleteId },
      select: { athleteId: true, stravaAthleteId: true, createdAt: true, updatedAt: true },
    }),
    prisma.googleAccount.findUnique({
      where: { athleteId },
      select: { athleteId: true, createdAt: true, updatedAt: true },
    }),
    prisma.renphoAccount.findUnique({
      where: { athleteId },
      select: { athleteId: true, email: true, createdAt: true, updatedAt: true },
    }),
    prisma.withingsAccount.findUnique({
      where: { athleteId },
      select: { athleteId: true, createdAt: true, updatedAt: true },
    }),
    prisma.myFitnessPalAccount.findUnique({
      where: { athleteId },
      select: { athleteId: true, displayName: true, createdAt: true, updatedAt: true },
    }),
  ]);

  const healthEvidenceExport = serializeEvidenceForExport(analysisEvidenceSnapshots);

  return {
    exportedAt: new Date().toISOString(),
    privacyVersion: profile.privacyVersion ?? CURRENT_PRIVACY_VERSION,
    retention: {
      softDeletePurgeDays: PRIVACY_PURGE_DELAY_DAYS,
      note: 'Une demande de suppression efface immédiatement le compte et ses données.',
      analysisEvidence: {
        maxRows: ANALYSIS_EVIDENCE_RETENTION.maxRowsPerAthlete,
        maxAgeDays: ANALYSIS_EVIDENCE_RETENTION.maxAgeDays,
        note: 'Preuves d’analyse : 5 dernières ou 14 jours (la fenêtre la plus courte).',
      },
    },
    profile,
    activities,
    dailyHealth,
    dailyNutrition,
    foodLogEntries,
    customFoods,
    bodyComposition,
    goals,
    plannedSessions,
    physicalNotes,
    conditions,
    conversations,
    dailyBriefings,
    weeklyReviews,
    performanceRecords,
    feedback,
    /** Art. 9 health category — inferences / pack evidence (no secrets). */
    categories: {
      health: {
        analysisEvidenceSnapshots: healthEvidenceExport,
        dailyHealth,
        bodyComposition,
        physicalNotes,
        conditions,
      },
    },
    integrations: {
      garmin: garmin ? { connected: true, ...garmin } : { connected: false },
      strava: strava ? { connected: true, ...strava } : { connected: false },
      google: google ? { connected: true, ...google } : { connected: false },
      renpho: renpho ? { connected: true, email: renpho.email } : { connected: false },
      withings: withings ? { connected: true, ...withings } : { connected: false },
      myfitnesspal: mfp ? { connected: true, displayName: mfp.displayName } : { connected: false },
    },
  };
}
