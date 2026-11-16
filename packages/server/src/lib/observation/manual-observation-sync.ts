import type {
  BodySide as PrismaBodySide,
  PhysicalCategory as PrismaPhysicalCategory,
} from '@prisma/client';
import type { getActivityById, getPhysicalNoteById } from '@sharpit/server/lib/queries';
import { observationEngine } from '@sharpit/server/lib/engines/observation-engine';
import { sessionIdentityOf } from '@sharpit/server/lib/observation/activity-to-session';
import { prisma } from '@sharpit/db/client';
import { computeTrainingDayId } from '@sharpit/core/training/training-day';
import type {
  RawPhysicalConditionObservation,
  RawSessionObservation,
  RawSubjectiveObservation,
  SessionHrData,
  SessionPaceData,
  SessionPowerData,
  SportType,
} from '@sharpit/core/observation';

function manualActivityExternalId(activityId: string): string {
  return `manual:activity:${activityId}`;
}

function manualConditionExternalId(noteId: string): string {
  return `manual:condition:${noteId}`;
}

function mapActivityTypeToSport(type: string): SportType {
  switch (type) {
    case 'RUN':
      return 'RUN';
    case 'BIKE':
      return 'BIKE';
    case 'SWIM':
      return 'SWIM';
    case 'STRENGTH':
      return 'STRENGTH';
    case 'TRIATHLON':
      return 'TRIATHLON';
    case 'HIKE':
      // Core SportType is frozen for this phase — HIKE observations fold into OTHER.
      return 'OTHER';
    default:
      return 'OTHER';
  }
}

function mapFeelingToMood(feeling: string | null | undefined): number | undefined {
  if (!feeling) {
    return undefined;
  }
  const moodMap: Record<string, number> = {
    'Très mal': 1,
    Mal: 2,
    Correct: 3,
    Bien: 4,
    'Très bien': 5,
  };

  return moodMap[feeling] ?? undefined;
}

function positivePowerData(
  avgPower: number | null | undefined,
  extras: Partial<SessionPowerData> = {},
): SessionPowerData | undefined {
  if (!avgPower || avgPower <= 0) {
    return undefined;
  }
  return {
    avgWatts: avgPower,
    quality: extras.quality ?? 'MEASURED_DIRECT',
    ...extras,
  };
}

function buildBikePowerData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionPowerData | undefined {
  return positivePowerData(activity.bikeMetrics?.avgPower, {
    normalizedPower: activity.bikeMetrics?.normalizedPower ?? undefined,
    intensityFactor: activity.bikeMetrics?.intensityFactor ?? undefined,
    quality: 'MEASURED_DIRECT',
  });
}

function buildRunPowerData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionPowerData | undefined {
  return positivePowerData(activity.runMetrics?.avgPower, {
    quality: 'MEASURED_OPTICAL',
  });
}

function buildPowerData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionPowerData | undefined {
  if (activity.type === 'BIKE' || activity.type === 'TRIATHLON') {
    return buildBikePowerData(activity);
  }
  if (activity.type === 'RUN') {
    return buildRunPowerData(activity);
  }
  return undefined;
}

function buildHrData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionHrData | undefined {
  const avgHr = activity.runMetrics?.avgHr ?? null;

  if (avgHr && avgHr > 0) {
    return {
      avgBpm: avgHr,
      quality: 'MEASURED_OPTICAL',
    };
  }

  return undefined;
}

function positivePaceData(
  distanceM: number | null | undefined,
  paceMinPerKm: number,
): SessionPaceData | undefined {
  if (!distanceM || distanceM <= 0 || paceMinPerKm <= 0) {
    return undefined;
  }
  return {
    avgMinPerKm: paceMinPerKm,
    distanceM,
  };
}

function buildRunPaceData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionPaceData | undefined {
  const paceSecPerKm = activity.runMetrics?.paceSecPerKm;
  return positivePaceData(activity.runMetrics?.distanceM, (paceSecPerKm ?? 0) / 60);
}

function buildSwimPaceData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionPaceData | undefined {
  const avgPaceSecPer100m = activity.swimMetrics?.avgPaceSecPer100m;
  return positivePaceData(activity.swimMetrics?.distanceM, (avgPaceSecPer100m ?? 0) / 10 / 60);
}

function buildPaceData(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): SessionPaceData | undefined {
  if (activity.type === 'RUN') {
    return buildRunPaceData(activity);
  }
  if (activity.type === 'SWIM') {
    return buildSwimPaceData(activity);
  }
  return undefined;
}

function sessionElevationM(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): number | undefined {
  return activity.runMetrics?.elevationM ?? activity.bikeMetrics?.elevationM ?? undefined;
}

function buildManualSessionObservation(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): RawSessionObservation | null {
  if (!activity.duration || activity.duration <= 0) {
    return null;
  }

  return {
    type: 'SESSION',
    source: 'MANUAL',
    timestamp: activity.date,
    receivedAt: new Date(),
    sportType: mapActivityTypeToSport(activity.type),
    durationSec: activity.duration,
    externalId: manualActivityExternalId(activity.id),
    title: activity.title ?? undefined,
    notes: activity.notes ?? undefined,
    powerData: buildPowerData(activity),
    hrData: buildHrData(activity),
    paceData: buildPaceData(activity),
    elevationM: sessionElevationM(activity),
    calories: activity.bikeMetrics?.calories ?? undefined,
    // sourceProvidedStress is deliberately omitted: Activity.load coalesced
    // Garmin's TSS with its EPOC training load for every row written before that
    // was separated, so feeding it in would import two mixed scales into the Core,
    // which computes its own Training Stress from raw power and heart rate anyway.
  };
}

function buildManualSubjectiveObservation(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
  sessionExternalId: string,
): RawSubjectiveObservation | null {
  const mood = mapFeelingToMood(activity.feeling);
  if (
    (activity.rpe === undefined || activity.rpe === null) &&
    (mood === undefined || mood === null)
  ) {
    return null;
  }

  return {
    type: 'SUBJECTIVE',
    source: 'MANUAL',
    timestamp: activity.date,
    receivedAt: new Date(),
    rpe: activity.rpe ?? undefined,
    mood,
    sessionExternalId,
    notes: activity.notes ?? undefined,
  };
}

async function deleteManualSubjectiveObservations(
  athleteId: string,
  sessionExternalId: string,
): Promise<void> {
  const rows = await prisma.observation.findMany({
    where: {
      athleteId,
      type: 'SUBJECTIVE',
      source: 'MANUAL',
    },
    select: { id: true, data: true },
  });

  const ids = rows
    .filter((row) => {
      const data = row.data as Record<string, unknown>;
      return data.sessionExternalId === sessionExternalId;
    })
    .map((row) => row.id);

  if (ids.length > 0) {
    await prisma.observation.deleteMany({ where: { id: { in: ids } } });
  }
}

export async function removeManualActivityObservations(
  athleteId: string,
  activityId: string,
): Promise<void> {
  const externalId = manualActivityExternalId(activityId);

  await prisma.observation.deleteMany({
    where: {
      athleteId,
      type: 'SESSION',
      externalId,
    },
  });

  await deleteManualSubjectiveObservations(athleteId, externalId);
}

/**
 * Removes every session observation of an activity that is being deleted, under each identity
 * it may carry: the manual one, Garmin's and Strava's. Removing only the manual one left the
 * provider's session behind, and the load kept counting an outing that no longer existed. The
 * loads from that day on are computed again on the next read.
 */
export async function removeActivityObservations(
  athleteId: string,
  activity: { id: string; garminId: string | null; stravaId: string | null; date: Date },
): Promise<void> {
  await removeManualActivityObservations(athleteId, activity.id);
  const providerSessions = [
    { source: 'GARMIN', externalId: activity.garminId },
    { source: 'STRAVA', externalId: activity.stravaId },
  ];
  for (const { source, externalId } of providerSessions) {
    if (externalId) {
      await prisma.observation.deleteMany({
        where: { athleteId, type: 'SESSION', source, externalId },
      });
      await deleteManualSubjectiveObservations(athleteId, externalId);
    }
  }
  await prisma.featureSet.updateMany({
    where: {
      athleteId,
      category: 'LOAD',
      status: 'COMPUTED',
      trainingDayId: { gte: computeTrainingDayId(activity.date) },
    },
    data: { status: 'INVALIDATED' },
  });
}

/**
 * Writes what the athlete said of an activity into the observation store.
 *
 * An activity that came from a provider already has its session observation, written at sync
 * under the provider's identity. Writing a second one here, under a manual identity, counted
 * the outing twice in the load each time the athlete edited it, and tied the effort they
 * reported to the duplicate instead of the recorded session. Only an activity with no provider
 * gets its session from here; the reported effort always goes to the session that exists.
 */
export async function syncManualActivityObservations(
  activity: NonNullable<Awaited<ReturnType<typeof getActivityById>>>,
): Promise<void> {
  const { athleteId } = activity;
  const identity = sessionIdentityOf(activity);
  await removeManualActivityObservations(athleteId, activity.id);

  if (identity.source === 'MANUAL') {
    const rawSession = buildManualSessionObservation(activity);
    if (!rawSession) {
      return;
    }
    await observationEngine.ingest(athleteId, rawSession);
  } else {
    await deleteManualSubjectiveObservations(athleteId, identity.externalId);
  }

  const rawSubjective = buildManualSubjectiveObservation(activity, identity.externalId);
  if (rawSubjective) {
    await observationEngine.ingest(athleteId, rawSubjective);
  }
}

function mapPhysicalCategory(
  category: PrismaPhysicalCategory,
): RawPhysicalConditionObservation['category'] {
  return category;
}

function mapBodySide(
  side: PrismaBodySide | null | undefined,
): RawPhysicalConditionObservation['bodySide'] {
  return side ?? 'NA';
}

function resolveConditionSeverity(
  note: NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>,
): number {
  const latestCheckin = note.checkins[0] ?? null;
  return note.status === 'RESOLVED' ? 0 : (latestCheckin?.severity ?? note.severity ?? 0);
}

function physicalConditionTimestamp(
  note: NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>,
  latestCheckin:
    NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>['checkins'][number] | null,
): Date {
  if (latestCheckin?.date) {
    return latestCheckin.date;
  }
  if (note.resolvedAt) {
    return note.resolvedAt;
  }
  if (note.startDate) {
    return note.startDate;
  }
  return note.updatedAt;
}

function physicalConditionDescription(
  note: NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>,
  latestCheckin:
    NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>['checkins'][number] | null,
): string {
  if (latestCheckin?.comment) {
    return latestCheckin.comment;
  }
  if (note.description) {
    return note.description;
  }
  return note.title;
}

function buildPhysicalConditionObservation(
  note: NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>,
): RawPhysicalConditionObservation {
  const latestCheckin = note.checkins[0] ?? null;
  const affectsTraining = note.status !== 'RESOLVED' && note.affectsTraining;

  return {
    type: 'PHYSICAL_CONDITION',
    source: 'MANUAL',
    timestamp: physicalConditionTimestamp(note, latestCheckin),
    receivedAt: new Date(),
    category: mapPhysicalCategory(note.category),
    bodyRegion: note.bodyPart ?? note.title,
    bodySide: mapBodySide(note.side),
    severity: resolveConditionSeverity(note),
    description: physicalConditionDescription(note, latestCheckin),
    conditionId: manualConditionExternalId(note.id),
    affectsTraining,
  };
}

export async function removePhysicalConditionObservations(
  athleteId: string,
  noteId: string,
): Promise<void> {
  const conditionId = manualConditionExternalId(noteId);
  const rows = await prisma.observation.findMany({
    where: {
      athleteId,
      type: 'PHYSICAL_CONDITION',
      source: 'MANUAL',
    },
    select: { id: true, data: true },
  });

  const ids = rows
    .filter((row) => {
      const data = row.data as Record<string, unknown>;
      return data.conditionId === conditionId;
    })
    .map((row) => row.id);

  if (ids.length > 0) {
    await prisma.observation.deleteMany({ where: { id: { in: ids } } });
  }
}

export async function syncPhysicalConditionObservation(
  note: NonNullable<Awaited<ReturnType<typeof getPhysicalNoteById>>>,
): Promise<void> {
  await removePhysicalConditionObservations(note.athleteId, note.id);
  await observationEngine.ingest(note.athleteId, buildPhysicalConditionObservation(note));
}
