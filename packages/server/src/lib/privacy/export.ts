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
 * Models the export deliberately leaves out, each with its reason. With
 * `EXPORT_COVERED_MODELS` it must account for every Prisma model (see export.test.ts),
 * so a new table forces a decision here.
 */
export const EXPORT_EXCLUDED_MODELS: Record<string, string> = {
  // shortcut: the JSON answer must stay under the function response limit; a streamed
  // archive is needed before raw streams and full inference history can ship in it.
  ActivityStream:
    'second-by-second streams, tens of MB per athlete; the activity summary is exported',
  DecisionRecord:
    'model runs rebuilt from observations; the current state is exported as digitalTwin',
  FeatureSet: 'features rebuilt from observations',
  AthleteSnapshotRecord: 'cache rebuilt from observations',
  EnvironmentalObservationRecord: 'weather readings for a place, not about the athlete',
  AnalysisRun: 'job bookkeeping, no athlete content',
  GoalProjectionSnapshot: 'projection rebuilt from the goal and observations',
  CoachTurnTrace: 'diagnostic trace of a conversation already exported',
  CoachToolExecution: 'diagnostic trace of a conversation already exported',
  AiUsageEvent: 'usage counters, no athlete content',
  GarminPushInbox: 'transient inbox with no athlete link, purged after 7 days',
};

/** Every model `buildAthleteExportJson` reads, directly or through an include. */
export const EXPORT_COVERED_MODELS: readonly string[] = [
  'AthleteProfile',
  'Activity',
  'RunMetrics',
  'BikeMetrics',
  'SwimMetrics',
  'HikeMetrics',
  'StrengthSet',
  'DailyHealth',
  'DailyNutrition',
  'BodyCompositionMeasurement',
  'Goal',
  'GoalAchievement',
  'PlannedSession',
  'PhysicalNote',
  'PhysicalCheckin',
  'HealthGround',
  'Condition',
  'ConditionEpisode',
  'ConditionObservation',
  'FunctionalCapacity',
  'ConditionKnowledge',
  'Conversation',
  'DailyBriefing',
  'WeeklyReview',
  'PerformanceRecord',
  'AnalysisEvidenceSnapshot',
  'FoodLogEntry',
  'FoodProduct',
  'AthleteFeedback',
  'GarminAccount',
  'StravaAccount',
  'GoogleAccount',
  'RenphoAccount',
  'WithingsAccount',
  'Observation',
  'AthleteDayJournal',
  'JournalHabitExperiment',
  'FoodLogSkippedMeal',
  'SavedMeal',
  'NutritionDayAnalysis',
  'TrainingPlan',
  'PlanWeek',
  'HikeTrip',
  'AthleteTravelContext',
  'AthleteThresholdSnapshot',
  'AthleteActivityStatus',
  'AthleteActivityStatusHistory',
  'BrickAnalysis',
  'BrickEvaluation',
  'CoachingDecision',
  'CoachingDecisionAction',
  'CoachingDecisionOutcome',
  'DigitalTwin',
  'CalendarBusySnapshot',
  'Subscription',
  'DeviceToken',
];

const OBSERVATION_EXPORT_LIMIT = 20000;

/** What the athlete entered or SHARPIT collected, beyond the legacy tables. */
async function loadObservationsAndJournal(athleteId: string) {
  const where = { athleteId };
  const [observations, dayJournal, habitExperiments, skippedMeals, savedMeals, nutritionAnalyses] =
    await Promise.all([
      prisma.observation.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: OBSERVATION_EXPORT_LIMIT,
      }),
      prisma.athleteDayJournal.findMany({ where }),
      prisma.journalHabitExperiment.findMany({ where }),
      prisma.foodLogSkippedMeal.findMany({ where }),
      prisma.savedMeal.findMany({ where }),
      prisma.nutritionDayAnalysis.findMany({ where }),
    ]);
  return {
    observations,
    dayJournal,
    habitExperiments,
    skippedMeals,
    savedMeals,
    nutritionAnalyses,
  };
}

/** Plan, context and the coaching state derived for the athlete. */
async function loadPlanAndCoachingState(athleteId: string) {
  const where = { athleteId };
  const [
    trainingPlans,
    hikeTrips,
    travelContexts,
    thresholdHistory,
    activityStatus,
    activityStatusHistory,
    brickAnalyses,
    brickEvaluations,
    coachingDecisions,
    digitalTwin,
  ] = await Promise.all([
    prisma.trainingPlan.findMany({ where, include: { weeks: true } }),
    prisma.hikeTrip.findMany({ where }),
    prisma.athleteTravelContext.findMany({ where }),
    prisma.athleteThresholdSnapshot.findMany({ where: { profileId: athleteId } }),
    prisma.athleteActivityStatus.findMany({ where }),
    prisma.athleteActivityStatusHistory.findMany({ where }),
    prisma.brickAnalysis.findMany({ where }),
    prisma.brickEvaluation.findMany({ where }),
    prisma.coachingDecision.findMany({ where, include: { actions: true, outcome: true } }),
    prisma.digitalTwin.findMany({ where }),
  ]);
  return {
    trainingPlans,
    hikeTrips,
    travelContexts,
    thresholdHistory,
    activityStatus,
    activityStatusHistory,
    brickAnalyses,
    brickEvaluations,
    coachingDecisions,
    digitalTwin,
  };
}

/** Account-side rows. Push tokens and store transaction ids are credentials, left out. */
async function loadAccountRecords(athleteId: string) {
  const where = { athleteId };
  const [calendarBusy, subscriptions, devices] = await Promise.all([
    prisma.calendarBusySnapshot.findMany({ where }),
    prisma.subscription.findMany({
      where,
      select: { source: true, productId: true, status: true, expiresAt: true, willRenew: true },
    }),
    prisma.deviceToken.findMany({
      where,
      select: { platform: true, enabled: true, lastUsedAt: true, createdAt: true },
    }),
  ]);
  return { calendarBusy, subscriptions, devices };
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
      runEasyPaceSecPerKm: true,
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
    healthGrounds,
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
    prisma.goal.findMany({ where: { athleteId }, include: { achievements: true } }),
    prisma.plannedSession.findMany({ where: { athleteId }, orderBy: { date: 'desc' }, take: 2000 }),
    prisma.physicalNote.findMany({ where: { athleteId }, include: { checkins: true } }),
    prisma.healthGround.findMany({ where: { athleteId } }),
    prisma.condition.findMany({
      where: { athleteId },
      include: { episodes: true, observations: true, functionalCapacities: true, knowledge: true },
    }),
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
  const [garmin, strava, google, renpho, withings] = await Promise.all([
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
  ]);

  const healthEvidenceExport = serializeEvidenceForExport(analysisEvidenceSnapshots);
  const [observationsAndJournal, planAndCoachingState, accountRecords] = await Promise.all([
    loadObservationsAndJournal(athleteId),
    loadPlanAndCoachingState(athleteId),
    loadAccountRecords(athleteId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    privacyVersion: profile.privacyVersion ?? CURRENT_PRIVACY_VERSION,
    retention: {
      softDeletePurgeDays: PRIVACY_PURGE_DELAY_DAYS,
      note: 'Une demande de suppression désactive le compte immédiatement ; les données sont effacées après le délai softDeletePurgeDays.',
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
    healthGrounds,
    conditions,
    conversations,
    dailyBriefings,
    weeklyReviews,
    performanceRecords,
    feedback,
    ...observationsAndJournal,
    ...planAndCoachingState,
    ...accountRecords,
    notExported: EXPORT_EXCLUDED_MODELS,
    /** Art. 9 health category — inferences / pack evidence (no secrets). */
    categories: {
      health: {
        analysisEvidenceSnapshots: healthEvidenceExport,
        dailyHealth,
        bodyComposition,
        physicalNotes,
        healthGrounds,
        conditions,
      },
    },
    integrations: {
      garmin: garmin ? { connected: true, ...garmin } : { connected: false },
      strava: strava ? { connected: true, ...strava } : { connected: false },
      google: google ? { connected: true, ...google } : { connected: false },
      renpho: renpho ? { connected: true, email: renpho.email } : { connected: false },
      withings: withings ? { connected: true, ...withings } : { connected: false },
      /** Product linking and sync were withdrawn (ADR-073) and table dropped. */
      myfitnesspal: { connected: false, historicalAccount: false },
    },
  };
}
