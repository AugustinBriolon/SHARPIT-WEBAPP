import { Prisma } from '@prisma/client';
import { dayKeyFromDate, shortDayFromDate } from '@sharpit/app/lib/date/day-key';
import {
  enduranceSportFromActivityType,
  type EnduranceSport,
} from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { effectiveEndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/endurance-session';
import type { AthleteThresholds } from '@sharpit/app/lib/planned-session/endurance/endurance-targets';
import { prisma } from '@sharpit/db/client';
import {
  createGarminWorkout,
  deleteGarminWorkout,
  GARMIN_PERMISSION_MESSAGE,
  GarminWorkoutPushError,
  scheduleGarminWorkout,
} from '@sharpit/server/lib/integrations/garmin/garmin-training-api';
import {
  buildGarminWorkoutPayload,
  GARMIN_MAX_SINGLE_SPORT_STEPS,
} from '@sharpit/server/lib/integrations/garmin/garmin-workout-payload';
import {
  getGarminAccount,
  getValidGarminAccessToken,
} from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { athleteThresholds } from '@sharpit/server/lib/planned-session/session-steps';

/** The Training API permission the athlete grants on Garmin's consent page. */
export const GARMIN_WORKOUT_PERMISSION = 'WORKOUT_IMPORT';

const SPORT_LABEL_FR: Record<EnduranceSport, string> = {
  RUN: 'Course',
  BIKE: 'Vélo',
  SWIM: 'Natation',
};

export type GarminWorkoutReceipt = {
  workoutId: string;
  scheduledDate: string;
  pushedAt: string;
  /** Targets sent without guidance, athlete-facing. */
  warnings: string[];
  /** True when the session had no structure and was derived from duration and intensity. */
  derived: boolean;
};

async function loadSession(athleteId: string, plannedSessionId: string) {
  const session = await prisma.plannedSession.findFirst({
    where: { id: plannedSessionId, athleteId },
    select: {
      id: true,
      type: true,
      title: true,
      date: true,
      description: true,
      durationMin: true,
      intensity: true,
      endurancePrescription: true,
      garminWorkoutId: true,
    },
  });
  if (!session) {
    throw new GarminWorkoutPushError('not_found', 'Séance planifiée introuvable', 404);
  }
  const sport = enduranceSportFromActivityType(session.type);
  if (!sport) {
    throw new GarminWorkoutPushError(
      'unsupported_sport',
      'Seules les séances course, vélo et natation partent sur la montre pour l’instant.',
      422,
    );
  }
  return { session, sport };
}

async function assertCanImportWorkouts(athleteId: string): Promise<void> {
  const account = await getGarminAccount(athleteId);
  if (!account) {
    throw new GarminWorkoutPushError(
      'not_connected',
      'Connecte Garmin pour envoyer la séance.',
      404,
    );
  }
  if (!account.permissions.includes(GARMIN_WORKOUT_PERMISSION)) {
    throw new GarminWorkoutPushError('permission', GARMIN_PERMISSION_MESSAGE, 403);
  }
}

async function loadThresholds(athleteId: string) {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: {
      runThresholdPaceSecPerKm: true,
      swimCssSecPer100m: true,
      ftpW: true,
      lthr: true,
      maxHr: true,
      defaultPoolLengthM: true,
    },
  });
  return {
    thresholds: athleteThresholds(profile),
    defaultPoolLengthM: profile?.defaultPoolLengthM ?? null,
  };
}

/** Best effort: a workout left behind in the library is untidy, not harmful. */
async function deleteQuietly(accessToken: string, workoutId: string): Promise<void> {
  await deleteGarminWorkout(accessToken, workoutId).catch((error: unknown) => {
    console.warn('[garmin-workout] delete failed', {
      name: error instanceof Error ? error.name : 'Error',
    });
  });
}

/** Creates then schedules; a workout that cannot be scheduled is removed again. */
async function createAndSchedule(
  accessToken: string,
  payload: Record<string, unknown>,
  date: string,
): Promise<string> {
  const workoutId = await createGarminWorkout(accessToken, payload);
  try {
    await scheduleGarminWorkout(accessToken, workoutId, date);
  } catch (error) {
    await deleteQuietly(accessToken, workoutId);
    throw error;
  }
  return workoutId;
}

async function persistReceipt(
  sessionId: string,
  receipt: Pick<GarminWorkoutReceipt, 'workoutId' | 'scheduledDate' | 'pushedAt'>,
  thresholds: AthleteThresholds,
): Promise<void> {
  await prisma.plannedSession.update({
    where: { id: sessionId },
    data: {
      garminWorkoutId: receipt.workoutId,
      garminWorkoutScheduledDate: receipt.scheduledDate,
      garminWorkoutPushedAt: new Date(receipt.pushedAt),
      garminWorkoutThresholds: thresholds as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Sends a planned endurance session to the athlete's watch through the Training API: the
 * workout is created in Garmin Connect and scheduled on the session's day. Targets are
 * resolved now against the current thresholds, which are kept with the receipt so a later
 * threshold change shows the session on the watch as out of date (endurance-staleness).
 *
 * A session already sent is refused unless `replace` is set, which deletes the previous
 * workout first: Starter allows 200 calls per athlete a day, so a resend is never implicit.
 */
export async function pushPlannedSessionToGarmin(
  athleteId: string,
  input: { plannedSessionId: string; replace?: boolean },
): Promise<GarminWorkoutReceipt> {
  const { session, sport } = await loadSession(athleteId, input.plannedSessionId);
  if (session.garminWorkoutId && !input.replace) {
    throw new GarminWorkoutPushError('already_pushed', 'Séance déjà envoyée sur ta montre.', 409);
  }
  await assertCanImportWorkouts(athleteId);

  const { thresholds, defaultPoolLengthM } = await loadThresholds(athleteId);
  const effective = effectiveEndurancePrescription({
    sport,
    durationMin: session.durationMin,
    intensity: session.intensity,
    stored: session.endurancePrescription,
    thresholds,
    defaultPoolLengthM,
  });
  const built = buildGarminWorkoutPayload({
    workoutName:
      session.title?.trim() || `${SPORT_LABEL_FR[sport]} ${shortDayFromDate(session.date)}`,
    description: session.description,
    prescription: effective.prescription,
    thresholds,
  });
  if (built.stepCount === 0) {
    throw new GarminWorkoutPushError('empty', 'Aucune étape à envoyer.', 422);
  }
  if (built.stepCount > GARMIN_MAX_SINGLE_SPORT_STEPS) {
    throw new GarminWorkoutPushError(
      'too_many_steps',
      `Garmin accepte ${GARMIN_MAX_SINGLE_SPORT_STEPS} étapes au plus par séance.`,
      422,
    );
  }

  const accessToken = await getValidGarminAccessToken(athleteId);
  if (session.garminWorkoutId) {
    await deleteQuietly(accessToken, session.garminWorkoutId);
  }
  const scheduledDate = dayKeyFromDate(session.date);
  const workoutId = await createAndSchedule(accessToken, built.payload, scheduledDate);
  const receipt = { workoutId, scheduledDate, pushedAt: new Date().toISOString() };
  await persistReceipt(session.id, receipt, thresholds);

  return {
    ...receipt,
    warnings: [...new Set([...effective.warnings, ...built.warnings])],
    derived: effective.derived,
  };
}
