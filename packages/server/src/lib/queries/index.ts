import { cache } from 'react';
import { isSet } from '@sharpit/shared/value';
import { after } from 'next/server';
import { dedupeBodyCompositionByDay } from '@sharpit/app/lib/health/body-composition';
import { isMultisportLegArray, type MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import {
  activityInclude,
  activityDetailInclude,
  activityListSelect,
  activityCoachSelect,
  activityPmcSelect,
} from '@sharpit/app/lib/query/activity-include';
import { physicalNoteInclude, planWeekInclude } from '@sharpit/app/lib/query/activity-include';
import { linkPlannedSessionActivity } from '@sharpit/server/lib/queries/planned-sessions';
import {
  ActivityType,
  type AthleteSex,
  FunctionalImpact,
  type PhysicalStatus,
  Prisma,
} from '@prisma/client';
import { RELAPSE_WATCH_DAYS } from '@sharpit/app/lib/physical-health/zone-follow-up';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import { dedupeNutritionRowsByDay } from '@sharpit/app/lib/nutrition/food-log/nutrition-source';
import type { DisplayMode } from '@sharpit/app/lib/preferences/display-mode';

export {
  createBrickSessions,
  createPlannedSession,
  deletePlannedSession,
  getBrickAnalysis,
  getBrickEvaluation,
  getBrickSessions,
  getPlannedSessionById,
  getPlannedSessions,
  getPlannedSessionsForCoach,
  linkPlannedSessionActivity,
  rescheduleBrickSessions,
  setBrickAnalysis,
  setBrickEvaluation,
  setPlannedSessionAnalysis,
  updatePlannedSession,
} from '@sharpit/server/lib/queries/planned-sessions';

export {
  createHikeTrip,
  deleteHikeTrip,
  getHikeTripById,
  HikeTripConflictError,
  HikeTripValidationError,
  listHikeTrips,
  updateHikeTrip,
  type HikeTripListItem,
  type HikeTripWithActivities,
} from '@sharpit/server/lib/queries/hike-trips';

export async function getActivities(
  athleteId: string,
  params?: { type?: ActivityType; limit?: number },
) {
  return prisma.activity.findMany({
    where: params?.type ? { athleteId, type: params.type } : { athleteId },
    include: activityInclude,
    orderBy: { date: 'desc' },
    take: params?.limit,
  });
}

export async function getActivitiesList(
  athleteId: string,
  params?: {
    type?: ActivityType;
    limit?: number;
    sinceDays?: number;
  },
) {
  const where: Prisma.ActivityWhereInput = { athleteId };
  if (params?.type) {
    where.type = params.type;
  }
  if (params?.sinceDays) {
    where.date = { gte: startOfDay(addDays(new Date(), -params.sinceDays)) };
  }
  return prisma.activity.findMany({
    where,
    select: activityListSelect,
    orderBy: { date: 'desc' },
    take: params?.limit,
  });
}

/** Slim activities for Coach context assembly (prompt + PMC). */
export async function getActivitiesForCoach(
  athleteId: string,
  params?: { limit?: number; sinceDays?: number },
) {
  const where: Prisma.ActivityWhereInput = { athleteId };
  if (params?.sinceDays) {
    where.date = { gte: startOfDay(addDays(new Date(), -params.sinceDays)) };
  }
  return prisma.activity.findMany({
    where,
    select: activityCoachSelect,
    orderBy: { date: 'desc' },
    take: params?.limit,
  });
}

/**
 * Every activity ever recorded, narrowest possible shape, for the PMC.
 *
 * No `sinceDays`, no `limit`, on purpose: the CTL/ATL recurrence converges over
 * ~3x its 42-day time constant, so truncating the input silently understates
 * chronic load. See ADR-011.
 */
export async function getActivitiesForPmc(athleteId: string) {
  return prisma.activity.findMany({
    where: { athleteId },
    select: activityPmcSelect,
    orderBy: { date: 'asc' },
  });
}

/**
 * Minimal activity rows for AthleteSnapshot phase context.
 * Avoids metrics / strength sets / plannedSession joins used by detail views.
 */
export async function getActivitiesForSnapshotPhase(athleteId: string, limit = 40) {
  return prisma.activity.findMany({
    where: { athleteId },
    select: {
      id: true,
      date: true,
      type: true,
      load: true,
      duration: true,
      title: true,
    },
    orderBy: { date: 'desc' },
    take: limit,
  });
}

/** Per-request dedupe — detail page + nested helpers share one DB round-trip. */
export const getActivityById = cache(async (athleteId: string, id: string) => {
  return prisma.activity.findFirst({
    where: { id, athleteId },
    include: activityDetailInclude,
  });
});

/** One activity in the Coach prompt shape (same select as `getActivitiesForCoach`). */
export async function getActivityForCoach(athleteId: string, id: string) {
  return prisma.activity.findFirst({
    where: { id, athleteId },
    select: activityCoachSelect,
  });
}

/** Multisport legs — persisted or fetched from Garmin when missing.
 *
 * Persist is intentionally non-blocking: this helper is called from RSC pages
 * where `after()` is not always available. Prefer `after()` when in a request
 * context; otherwise fire-and-forget so the legs return immediately.
 */
async function fetchAndPersistMultisportLegs(
  athleteId: string,
  activity: { id: string; garminId: string },
): Promise<MultisportLeg[] | null> {
  const { getGarminAccount, buildFreshGarminClient } =
    await import('@sharpit/server/lib/integrations/garmin/garmin-sync');
  const { fetchGarminMultisportLegs } =
    await import('@sharpit/server/lib/integrations/garmin/garmin-multisport');

  const account = await getGarminAccount(athleteId);
  if (!account) {
    return null;
  }

  const client = await buildFreshGarminClient(athleteId, account).catch(() => null);
  if (!client) {
    return null;
  }

  const legs = await fetchGarminMultisportLegs(client, Number(activity.garminId));
  if (!legs) {
    return null;
  }

  const persist = () =>
    prisma.activity
      .update({
        where: { id: activity.id },
        data: { multisportLegs: legs as unknown as Prisma.InputJsonValue },
      })
      .catch((err) => {
        console.error('[getMultisportLegsForActivity] persist failed', err);
      });

  try {
    after(() => {
      void persist();
    });
  } catch {
    void persist();
  }

  return legs;
}

export async function getMultisportLegsForActivity(
  athleteId: string,
  activity: {
    id: string;
    type: ActivityType;
    garminId: string | null;
    multisportLegs: unknown;
  },
): Promise<MultisportLeg[] | null> {
  if (activity.type !== ActivityType.TRIATHLON) {
    return null;
  }
  if (isMultisportLegArray(activity.multisportLegs)) {
    return activity.multisportLegs;
  }
  if (!activity.garminId) {
    return null;
  }
  return fetchAndPersistMultisportLegs(athleteId, {
    id: activity.id,
    garminId: activity.garminId,
  });
}

export async function createActivity(athleteId: string, data: Prisma.ActivityUncheckedCreateInput) {
  return prisma.activity.create({
    data: { ...data, athleteId },
    include: activityDetailInclude,
  });
}

export async function updateActivity(
  athleteId: string,
  id: string,
  data: Prisma.ActivityUpdateInput,
) {
  // updateMany rejects nested relation writes (runMetrics / swimMetrics / …).
  // Scope by athleteId first (IDOR), then update by primary key so upserts work.
  const owned = await prisma.activity.findFirst({
    where: { id, athleteId },
    select: { id: true },
  });
  if (!owned) {
    return null;
  }
  return prisma.activity.update({
    where: { id },
    data,
    include: activityDetailInclude,
  });
}

export async function deleteActivity(athleteId: string, id: string) {
  const owned = await prisma.activity.findFirst({ where: { id, athleteId }, select: { id: true } });
  if (!owned) {
    return null;
  }

  // Prisma onDelete:SetNull only clears activityId — completed/analysis stay.
  // Reuse the full unlink path so the planned session returns to "planned".
  const linked = await prisma.plannedSession.findFirst({
    where: { activityId: id, athleteId },
    select: { id: true },
  });
  if (linked) {
    await linkPlannedSessionActivity(athleteId, linked.id, null);
  }
  return prisma.activity.delete({ where: { id } });
}

export async function getDashboardData(athleteId: string) {
  const today = startOfDay(new Date());
  const weekAgo = addDays(today, -42);

  const [todayActivities, recentActivities, todayHealth, primaryGoal] = await Promise.all([
    prisma.activity.findMany({
      where: { athleteId, date: { gte: today, lt: addDays(today, 1) } },
      include: activityInclude,
      orderBy: { date: 'asc' },
    }),
    prisma.activity.findMany({
      where: { athleteId, date: { gte: weekAgo } },
      select: { load: true, date: true },
      orderBy: { date: 'desc' },
    }),
    prisma.dailyHealth.findUnique({
      where: { athleteId_date: { athleteId, date: today } },
    }),
    prisma.goal.findFirst({
      where: {
        athleteId,
        kind: 'RACE',
        achieved: false,
        targetDate: { gte: today },
      },
      orderBy: { targetDate: 'asc' },
    }),
  ]);

  return {
    todayActivities,
    recentActivities,
    todayHealth,
    primaryGoal,
  };
}

export async function getAnalyticsActivities(athleteId: string) {
  return prisma.activity.findMany({
    where: { athleteId },
    select: {
      date: true,
      type: true,
      duration: true,
      load: true,
      bikeMetrics: { select: { tss: true } },
    },
    orderBy: { date: 'asc' },
  });
}

export async function getGoals(athleteId: string) {
  return prisma.goal.findMany({
    where: { athleteId },
    orderBy: [{ achieved: 'asc' }, { targetDate: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getGoalById(athleteId: string, id: string) {
  return prisma.goal.findFirst({ where: { id, athleteId } });
}

export async function createGoal(athleteId: string, data: Prisma.GoalUncheckedCreateInput) {
  return prisma.goal.create({ data: { ...data, athleteId } });
}

export async function updateGoal(athleteId: string, id: string, data: Prisma.GoalUpdateInput) {
  const { count } = await prisma.goal.updateMany({ where: { id, athleteId }, data });
  if (count === 0) {
    return null;
  }
  return prisma.goal.findUnique({ where: { id } });
}

export async function deleteGoal(athleteId: string, id: string) {
  const owned = await prisma.goal.findFirst({ where: { id, athleteId }, select: { id: true } });
  if (!owned) {
    return null;
  }
  return prisma.goal.delete({ where: { id } });
}

export async function getNextRace(athleteId: string) {
  return prisma.goal.findFirst({
    where: {
      athleteId,
      kind: 'RACE',
      achieved: false,
      targetDate: { gte: startOfDay(new Date()) },
    },
    orderBy: { targetDate: 'asc' },
  });
}

export async function getHealthEntries(athleteId: string, days = 90, refDate: Date = new Date()) {
  const { loadResolvedSourcePrefs } =
    await import('@sharpit/server/lib/integrations/source-prefs-store');
  const prefs = await loadResolvedSourcePrefs(athleteId);
  // Any source enabled for the class feeds the day rows — Garmin, or Apple Health alone.
  if ((prefs.classes.wearable_health?.enabled.length ?? 0) === 0) {
    return [];
  }
  const end = endOfDay(refDate);
  const since = startOfDay(addDays(refDate, -(days - 1)));
  return prisma.dailyHealth.findMany({
    where: { athleteId, date: { gte: since, lte: end } },
    orderBy: { date: 'desc' },
  });
}

/** Start instants only — callers map them to training days. */
export async function getActivityDatesInRange(athleteId: string, from: Date, to: Date) {
  const rows = await prisma.activity.findMany({
    where: { athleteId, date: { gte: startOfDay(from), lte: endOfDay(to) } },
    select: { date: true },
  });
  return rows.map((row) => row.date);
}

/** `from` / `to` are `YYYY-MM-DD` — nutrition days are stored at UTC midnight. */
export async function getNutritionCaloriesInRange(athleteId: string, from: string, to: string) {
  const rows = await prisma.dailyNutrition.findMany({
    where: {
      athleteId,
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
    },
    select: { date: true, calories: true, provider: true },
  });
  return dedupeNutritionRowsByDay(rows).map(({ date, calories }) => ({ date, calories }));
}

export async function getBodyCompositionMeasurements(athleteId: string, days?: number) {
  const { loadResolvedSourcePrefs } =
    await import('@sharpit/server/lib/integrations/source-prefs-store');
  const prefs = await loadResolvedSourcePrefs(athleteId);
  const since = isSet(days) ? startOfDay(addDays(new Date(), -days)) : null;
  const rows = await prisma.bodyCompositionMeasurement.findMany({
    where: since ? { athleteId, measuredAt: { gte: since } } : { athleteId },
    orderBy: { measuredAt: 'desc' },
  });
  return dedupeBodyCompositionByDay(rows, prefs.classes.body);
}

export async function getPhysicalNotes(athleteId: string) {
  return prisma.physicalNote.findMany({
    where: { athleteId },
    include: physicalNoteInclude,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
  });
}

export async function getPhysicalNoteById(athleteId: string, id: string) {
  return prisma.physicalNote.findFirst({
    where: { id, athleteId },
    include: physicalNoteInclude,
  });
}

export async function getActivePhysicalNotes(athleteId: string) {
  return prisma.physicalNote.findMany({
    where: { athleteId, status: { not: 'RESOLVED' }, affectsTraining: true },
    include: physicalNoteInclude,
    orderBy: { severity: 'desc' },
  });
}

/**
 * The zones generation reads (ADR-068): every open one, and the pains resolved recently
 * enough to still warrant care against a relapse.
 */
export async function getTrainingZoneNotes(athleteId: string, now = new Date()) {
  const relapseSince = new Date(now.getTime() - RELAPSE_WATCH_DAYS * 86_400_000);
  return prisma.physicalNote.findMany({
    where: {
      athleteId,
      affectsTraining: true,
      OR: [{ status: { not: 'RESOLVED' } }, { resolvedAt: { gte: relapseSince } }],
    },
    include: physicalNoteInclude,
    orderBy: { severity: 'desc' },
  });
}

/** A status change is a point on the zone's timeline: resolved, under watch, reopened. */
export async function recordPhysicalStatusChange(noteId: string, status: PhysicalStatus) {
  return prisma.physicalCheckin.create({ data: { noteId, status } });
}

export async function createPhysicalNote(
  athleteId: string,
  data: Prisma.PhysicalNoteUncheckedCreateInput,
) {
  return prisma.physicalNote.create({ data: { ...data, athleteId }, include: physicalNoteInclude });
}

export async function updatePhysicalNote(
  athleteId: string,
  id: string,
  data: Prisma.PhysicalNoteUncheckedUpdateInput,
) {
  const { count } = await prisma.physicalNote.updateMany({ where: { id, athleteId }, data });
  if (count === 0) {
    return null;
  }
  return prisma.physicalNote.findUnique({ where: { id }, include: physicalNoteInclude });
}

export async function deletePhysicalNote(athleteId: string, id: string) {
  const owned = await prisma.physicalNote.findFirst({
    where: { id, athleteId },
    select: { id: true },
  });
  if (!owned) {
    return null;
  }
  return prisma.physicalNote.delete({ where: { id } });
}

function severityToFunctionalImpact(severity: number | null | undefined) {
  if (severity === undefined || severity === null || severity === undefined) {
    return null;
  }
  if (severity === 0) {
    return 'NONE';
  }
  if (severity <= 3) {
    return 'MILD';
  }
  if (severity <= 6) {
    return 'MODERATE';
  }
  if (severity <= 8) {
    return 'LIMITING';
  }
  return 'STOPPED';
}

async function recordConditionObservationForCheckin(input: {
  athleteId: string;
  noteId: string;
  condition: NonNullable<Awaited<ReturnType<typeof prisma.condition.findFirst>>>;
  checkin: Awaited<ReturnType<typeof prisma.physicalCheckin.create>>;
  data: {
    severity?: number | null;
    comment?: string | null;
    date?: Date;
    functionalImpact?: FunctionalImpact | null;
  };
}) {
  const { athleteId, condition, checkin, data } = input;
  const observedAt = data.date ?? new Date();
  const symptomPresent = isSet(data.severity) ? data.severity > 0 : true;

  await prisma.conditionObservation.create({
    data: {
      athleteId,
      conditionId: condition.id,
      observedAt,
      context: 'MANUAL',
      source: 'ATHLETE',
      symptomPresent,
      severityReported: data.severity ?? null,
      functionalImpact: data.functionalImpact ?? severityToFunctionalImpact(data.severity),
      bodyRegion: condition.bodyRegion,
      side: condition.side,
      type: condition.type,
      comment: data.comment ?? null,
      legacyPhysicalCheckinId: checkin.id,
    },
  });

  await prisma.condition.update({
    where: { id: condition.id },
    data: {
      lastObservationAt: observedAt,
      observationCount: { increment: 1 },
    },
  });
}

export async function addPhysicalCheckin(
  athleteId: string,
  noteId: string,
  data: {
    severity?: number | null;
    comment?: string | null;
    date?: Date;
    functionalImpact?: FunctionalImpact | null;
  },
) {
  const note = await prisma.physicalNote.findFirst({
    where: { id: noteId, athleteId },
    select: { id: true },
  });
  if (!note) {
    return null;
  }

  const checkin = await prisma.physicalCheckin.create({
    data: {
      noteId,
      severity: data.severity ?? null,
      comment: data.comment ?? null,
      functionalImpact: data.functionalImpact ?? null,
      ...(data.date ? { date: data.date } : {}),
    },
  });

  // The latest reading is the zone's current state — what the training strategy reads.
  if (isSet(data.severity) || data.functionalImpact) {
    await prisma.physicalNote.update({
      where: { id: noteId },
      data: {
        ...(isSet(data.severity) ? { severity: data.severity } : {}),
        ...(data.functionalImpact ? { functionalImpact: data.functionalImpact } : {}),
      },
    });
  }

  const condition = await prisma.condition.findFirst({
    where: { legacyPhysicalNoteId: noteId, athleteId },
  });

  if (condition) {
    await recordConditionObservationForCheckin({
      athleteId,
      noteId,
      condition,
      checkin,
      data,
    });
  }

  return getPhysicalNoteById(athleteId, noteId);
}

export async function deletePhysicalCheckin(athleteId: string, id: string) {
  const owned = await prisma.physicalCheckin.findFirst({
    where: { id, note: { athleteId } },
    select: { id: true },
  });
  if (!owned) {
    return null;
  }
  return prisma.physicalCheckin.delete({ where: { id } });
}

/** Per-request dedupe across settings / coach / presentation readers. */
export const getAthleteProfile = cache(async (athleteId: string) => {
  return prisma.athleteProfile.findUnique({ where: { id: athleteId } });
});

/**
 * One versioned JSON column of the athlete profile, patched the Prisma way:
 * an absent key leaves the column untouched, an explicit null clears it.
 *
 * Shared by the three blobs — equipment, practiced sports and training
 * availability — which otherwise repeat the same ternary three times.
 */
function jsonBlobPatch(
  key:
    'equipment' | 'practicedSports' | 'trainingAvailability' | 'notificationPrefs' | 'featurePrefs',
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull | null | undefined,
): Record<string, Prisma.InputJsonValue | typeof Prisma.JsonNull> {
  if (value === undefined) {
    return {};
  }
  return { [key]: value === null ? Prisma.JsonNull : value };
}

export async function upsertAthleteProfile(
  athleteId: string,
  data: {
    heightCm?: number | null;
    targetWeightKg?: number | null;
    birthDate?: Date | null;
    sex?: AthleteSex | null;
    ftpW?: number | null;
    maxHr?: number | null;
    lthr?: number | null;
    runThresholdPaceSecPerKm?: number | null;
    swimCssSecPer100m?: number | null;
    defaultPoolLengthM?: number | null;
    homeLocationLabel?: string | null;
    homeLocationLat?: number | null;
    homeLocationLng?: number | null;
    context?: string | null;
    thresholdsSyncedAt?: Date | null;
    sleepTargetMinutes?: number | null;
    sleepBedtimeTargetMin?: number | null;
    equipment?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
    practicedSports?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
    trainingAvailability?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
    notificationPrefs?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
    featurePrefs?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
    displayMode?: DisplayMode;
  },
) {
  const {
    equipment,
    practicedSports,
    trainingAvailability,
    notificationPrefs,
    featurePrefs,
    ...rest
  } = data;
  const payload = {
    ...rest,
    ...jsonBlobPatch('equipment', equipment),
    ...jsonBlobPatch('practicedSports', practicedSports),
    ...jsonBlobPatch('trainingAvailability', trainingAvailability),
    ...jsonBlobPatch('notificationPrefs', notificationPrefs),
    ...jsonBlobPatch('featurePrefs', featurePrefs),
  };

  // Every AthleteProfile row now carries a required clerkUserId — there is no
  // longer a placeholder value an upsert's create branch could invent. The
  // multi-tenant migration guarantees this row already exists; a real create
  // path belongs to `getCurrentAthleteId()`'s lazy provisioning instead.
  return prisma.athleteProfile.update({
    where: { id: athleteId },
    data: payload,
  });
}

export async function createThresholdSnapshot(
  athleteId: string,
  data: {
    source: string;
    ftpW?: number | null;
    lthr?: number | null;
    runThresholdPaceSecPerKm?: number | null;
    swimCssSecPer100m?: number | null;
  },
) {
  return prisma.athleteThresholdSnapshot.create({
    data: { profileId: athleteId, ...data },
  });
}

export async function getThresholdSnapshots(athleteId: string, limit = 12) {
  return prisma.athleteThresholdSnapshot.findMany({
    where: { profileId: athleteId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getActiveTrainingPlan(athleteId: string) {
  return prisma.trainingPlan.findFirst({
    where: { athleteId, status: 'ACTIVE' },
    include: planWeekInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function archiveActiveTrainingPlans(athleteId: string) {
  return prisma.trainingPlan.updateMany({
    where: { athleteId, status: 'ACTIVE' },
    data: { status: 'ARCHIVED' },
  });
}

export async function createTrainingPlan(
  athleteId: string,
  data: Omit<Prisma.TrainingPlanUncheckedCreateInput, 'athleteId'> & {
    weeks: Omit<Prisma.PlanWeekUncheckedCreateInput, 'planId'>[];
  },
) {
  const { weeks, ...planData } = data;
  return prisma.trainingPlan.create({
    data: {
      ...planData,
      athleteId,
      weeks: { create: weeks },
    },
    include: planWeekInclude,
  });
}

export async function archiveTrainingPlan(athleteId: string, id: string) {
  const { count } = await prisma.trainingPlan.updateMany({
    where: { id, athleteId },
    data: { status: 'ARCHIVED' },
  });
  if (count === 0) {
    return null;
  }
  return prisma.trainingPlan.findUnique({ where: { id }, include: planWeekInclude });
}
