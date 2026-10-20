import { Prisma } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { z } from 'zod';
import {
  deleteSessionFromGoogle,
  pushBrickToGoogleInBackground,
  pushSessionToGoogleInBackground,
} from '@sharpit/server/lib/integrations/google/google-sync';
import {
  createBrickSessions,
  createPlannedSession,
  deletePlannedSession,
  getBrickSessions,
  getPlannedSessionById,
  rescheduleBrickSessions,
  updatePlannedSession,
} from '@sharpit/server/lib/queries';
import {
  createTravelContext,
  applyTravelContextToUpcomingSessions,
} from '@sharpit/server/lib/travel-context/service';
import { prisma } from '@sharpit/db/client';
import { chainBrickLegStartTimes } from '@sharpit/server/lib/planned-session/brick/brick-schedule';
import {
  parseStrengthPrescription,
  resolveStrengthFieldsForPersist,
} from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import { resolveEnduranceFieldsForPersist } from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { auditStrengthPrescription } from '@sharpit/server/lib/planned-session/strength/strength-session-template';
import {
  findBrickTravelViolation,
  findExistingTravelOverlap,
  findSessionTravelViolation,
  strengthIntentsOf,
} from './coach-tools-travel-guard';
import {
  type CoachPlannedSessionInput,
  type CoachPlannedSessionResolved,
  endurancePrescriptionToolSchema,
  intensityEnum,
  resolveCoachDefaultGoalId,
  roundOptionalMetric,
  scheduleSessionContextRefresh,
  strengthPrescriptionToolSchema,
  toDate,
  typeEnum,
  exposureEnum,
} from './coach-tools-shared';

function buildCoachPlannedSessionLocationFields(input: CoachPlannedSessionInput) {
  return {
    exposureSetting: input.exposureSetting ?? null,
    locationLabel: input.locationLabel ?? null,
    locationLat: input.locationLat ?? null,
    locationLng: input.locationLng ?? null,
  };
}

function buildCoachPlannedSessionPayload(
  input: CoachPlannedSessionInput,
  resolved: CoachPlannedSessionResolved,
) {
  return {
    type: input.type,
    date: toDate(input.date),
    startTime: input.startTime ?? null,
    title: input.title,
    description: resolved.endurance.description,
    strengthPrescription: resolved.strength.strengthPrescription ?? undefined,
    endurancePrescription: resolved.endurance.endurancePrescription ?? undefined,
    durationMin: roundOptionalMetric(input.durationMin),
    load: roundOptionalMetric(input.load),
    intensity: input.intensity ?? null,
    goalId: resolved.goalId,
    ...buildCoachPlannedSessionLocationFields(input),
  };
}

async function createCoachPlannedSessionRecord(
  athleteId: string,
  input: CoachPlannedSessionInput,
  resolved: CoachPlannedSessionResolved,
) {
  return createPlannedSession(athleteId, buildCoachPlannedSessionPayload(input, resolved));
}

async function resolveCoachPlannedSessionFields(
  athleteId: string,
  input: CoachPlannedSessionInput,
): Promise<CoachPlannedSessionResolved> {
  const strength = resolveStrengthFieldsForPersist({
    type: input.type,
    description: input.description,
    strengthPrescription: input.strengthPrescription,
  });
  const endurance = resolveEnduranceFieldsForPersist({
    type: input.type,
    description: strength.description,
    intensity: input.intensity ?? null,
    endurancePrescription: input.endurancePrescription,
  });
  const goalId = await resolveCoachDefaultGoalId(athleteId);
  return { strength, endurance, goalId };
}

export async function executeCreatePlannedSessionTool(
  athleteId: string,
  input: CoachPlannedSessionInput,
) {
  const violation = await findSessionTravelViolation(athleteId, {
    date: input.date,
    type: input.type,
    strengthIntents: strengthIntentsOf(input.strengthPrescription),
  });
  if (violation) {
    return { ok: false as const, error: violation };
  }
  const resolved = await resolveCoachPlannedSessionFields(athleteId, input);
  const s = await createCoachPlannedSessionRecord(athleteId, input, resolved);

  pushSessionToGoogleInBackground(s);
  scheduleSessionContextRefresh(athleteId, s.id);

  return {
    ok: true as const,
    id: s.id,
    action: 'created' as const,
    date: input.date,
    startTime: input.startTime ?? null,
    type: input.type,
    title: input.title,
    addedToGoogle: false,
    strengthAudit: auditStrengthPrescription({
      durationMin: input.durationMin,
      prescription: resolved.strength.strengthPrescription,
    }),
  };
}

function applyPlannedSessionScheduleUpdate(
  input: { date?: string; startTime?: string },
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  if (input.date) {
    data.date = toDate(input.date);
  }
  if (input.startTime !== undefined) {
    data.startTime = input.startTime;
  }
}

function applyPlannedSessionMetaUpdate(
  input: {
    type?: z.infer<typeof typeEnum>;
    intensity?: z.infer<typeof intensityEnum>;
    title?: string;
    description?: string;
    durationMin?: number;
    load?: number;
  },
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  if (input.type) {
    data.type = input.type;
  }
  if (input.intensity) {
    data.intensity = input.intensity;
  }
  if (input.title !== undefined) {
    data.title = input.title;
  }
  if (input.description !== undefined) {
    data.description = input.description;
  }
  if (input.durationMin !== undefined) {
    data.durationMin = input.durationMin;
  }
  if (input.load !== undefined) {
    data.load = input.load;
  }
}

function applyPlannedSessionLocationUpdate(
  input: {
    exposureSetting?: z.infer<typeof exposureEnum>;
    locationLabel?: string;
    locationLat?: number;
    locationLng?: number;
  },
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  if (input.exposureSetting !== undefined) {
    data.exposureSetting = input.exposureSetting;
  }
  if (input.locationLabel !== undefined) {
    data.locationLabel = input.locationLabel;
  }
  if (input.locationLat !== undefined) {
    data.locationLat = input.locationLat;
  }
  if (input.locationLng !== undefined) {
    data.locationLng = input.locationLng;
  }
}

function applyScalarPlannedSessionUpdate(
  input: {
    date?: string;
    startTime?: string;
    type?: z.infer<typeof typeEnum>;
    intensity?: z.infer<typeof intensityEnum>;
    title?: string;
    description?: string;
    durationMin?: number;
    load?: number;
    exposureSetting?: z.infer<typeof exposureEnum>;
    locationLabel?: string;
    locationLat?: number;
    locationLng?: number;
  },
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  applyPlannedSessionScheduleUpdate(input, data);
  applyPlannedSessionMetaUpdate(input, data);
  applyPlannedSessionLocationUpdate(input, data);
}

function applyStrengthPrescriptionUpdate(
  input: {
    type?: z.infer<typeof typeEnum>;
    description?: string;
    strengthPrescription?: z.infer<typeof strengthPrescriptionToolSchema>;
  },
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>,
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  const nextType = input.type ?? existing.type;
  if (input.strengthPrescription !== undefined) {
    const strength = resolveStrengthFieldsForPersist({
      type: nextType,
      description: input.description !== undefined ? input.description : existing.description,
      strengthPrescription: input.strengthPrescription,
    });
    data.description = strength.description;
    data.strengthPrescription =
      strength.strengthPrescription === undefined || strength.strengthPrescription === null
        ? Prisma.DbNull
        : strength.strengthPrescription;
    return;
  }
  if (input.type && input.type !== 'STRENGTH') {
    data.strengthPrescription = Prisma.DbNull;
  }
}

function applyEndurancePrescriptionUpdate(
  input: {
    type?: z.infer<typeof typeEnum>;
    description?: string;
    intensity?: z.infer<typeof intensityEnum>;
    endurancePrescription?: z.infer<typeof endurancePrescriptionToolSchema>;
  },
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>,
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  const nextType = input.type ?? existing.type;
  if (input.endurancePrescription !== undefined) {
    const endurance = resolveEnduranceFieldsForPersist({
      type: nextType,
      description: typeof data.description === 'string' ? data.description : null,
      intensity: input.intensity ?? existing.intensity,
      endurancePrescription: input.endurancePrescription,
    });
    data.description = endurance.description;
    data.endurancePrescription =
      endurance.endurancePrescription === undefined || endurance.endurancePrescription === null
        ? Prisma.DbNull
        : endurance.endurancePrescription;
    return;
  }
  if (input.type === 'STRENGTH') {
    data.endurancePrescription = Prisma.DbNull;
  }
}

function applyPrescriptionUpdates(
  input: {
    type?: z.infer<typeof typeEnum>;
    description?: string;
    intensity?: z.infer<typeof intensityEnum>;
    strengthPrescription?: z.infer<typeof strengthPrescriptionToolSchema>;
    endurancePrescription?: z.infer<typeof endurancePrescriptionToolSchema>;
    date?: string;
  },
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>,
  data: Prisma.PlannedSessionUncheckedUpdateInput,
): void {
  applyStrengthPrescriptionUpdate(input, existing, data);
  applyEndurancePrescriptionUpdate(input, existing, data);
}

/**
 * Only a change of day, sport or prescription can newly break a travel restriction:
 * renaming a session that already sits in one must stay possible.
 */
async function findUpdatedSessionTravelViolation(
  athleteId: string,
  input: {
    date?: string;
    type?: z.infer<typeof typeEnum>;
    strengthPrescription?: z.infer<typeof strengthPrescriptionToolSchema>;
  },
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>,
): Promise<string | null> {
  if (!input.date && !input.type && !input.strengthPrescription) {
    return null;
  }
  return findSessionTravelViolation(athleteId, {
    date: input.date ?? dayKeyFromDate(existing.date),
    type: input.type ?? existing.type,
    strengthIntents: strengthIntentsOf(
      input.strengthPrescription ?? parseStrengthPrescription(existing.strengthPrescription),
    ),
  });
}

function buildUpdatedSessionResult(
  s: NonNullable<Awaited<ReturnType<typeof updatePlannedSession>>>,
  durationMin: number | null | undefined,
) {
  return {
    ok: true as const,
    id: s.id,
    action: 'updated' as const,
    date: dayKeyFromDate(s.date),
    startTime: s.startTime,
    type: s.type,
    title: s.title,
    strengthAudit: auditStrengthPrescription({
      durationMin,
      prescription: parseStrengthPrescription(s.strengthPrescription),
    }),
  };
}

export async function executeUpdatePlannedSessionTool(
  athleteId: string,
  input: {
    id: string;
    date?: string;
    startTime?: string;
    type?: z.infer<typeof typeEnum>;
    intensity?: z.infer<typeof intensityEnum>;
    title?: string;
    description?: string;
    strengthPrescription?: z.infer<typeof strengthPrescriptionToolSchema>;
    endurancePrescription?: z.infer<typeof endurancePrescriptionToolSchema>;
    durationMin?: number;
    load?: number;
    exposureSetting?: z.infer<typeof exposureEnum>;
    locationLabel?: string;
    locationLat?: number;
    locationLng?: number;
  },
) {
  const existing = await getPlannedSessionById(athleteId, input.id);
  if (!existing) {
    return { ok: false as const, error: 'Séance introuvable' };
  }
  const violation =
    (await findUpdatedSessionTravelViolation(athleteId, input, existing)) ??
    (await findMovedBrickTravelViolation(athleteId, input, existing));
  if (violation) {
    return { ok: false as const, error: violation };
  }
  const data: Prisma.PlannedSessionUncheckedUpdateInput = {};
  applyScalarPlannedSessionUpdate(input, data);
  applyPrescriptionUpdates(input, existing, data);

  const updated = await updatePlannedSession(athleteId, input.id, data);
  if (!updated) {
    return { ok: false as const, error: 'Séance introuvable.' };
  }
  const brickLegs = await moveBrickWithLeg(athleteId, input, existing);
  const s = brickLegs?.find((leg) => leg.id === updated.id) ?? updated;
  scheduleSessionContextRefresh(athleteId, s.id);
  if (brickLegs) {
    pushBrickToGoogleInBackground(brickLegs);
  } else {
    pushSessionToGoogleInBackground(s);
  }

  return {
    ...buildUpdatedSessionResult(s, input.durationMin ?? existing.durationMin),
    ...(brickLegs ? { brickLegsMoved: brickLegs.map(describeMovedLeg) } : {}),
  };
}

type ExistingSession = NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>;

function movesBrick(
  input: { date?: string; startTime?: string },
  existing: ExistingSession,
): boolean {
  return Boolean(existing.brickGroupId && (input.date || input.startTime));
}

/** A brick moved to a new day must be allowed there for every leg's sport, not only this one's. */
async function findMovedBrickTravelViolation(
  athleteId: string,
  input: { date?: string },
  existing: ExistingSession,
): Promise<string | null> {
  if (!existing.brickGroupId || !input.date) {
    return null;
  }
  const legs = await getBrickSessions(athleteId, existing.brickGroupId);
  return findBrickTravelViolation(athleteId, { date: input.date, legs });
}

/**
 * Changing a leg's day or time moves the whole brick: its legs share one day, and chain from its
 * start. Null when the session is no brick leg, or neither its day nor its time changes.
 */
async function moveBrickWithLeg(
  athleteId: string,
  input: { date?: string; startTime?: string },
  existing: ExistingSession,
) {
  if (!movesBrick(input, existing)) {
    return null;
  }
  return rescheduleBrickSessions(athleteId, existing.brickGroupId!, {
    date: input.date ? toDate(input.date) : undefined,
    startTime: input.startTime,
  });
}

function describeMovedLeg(leg: {
  id: string;
  date: Date;
  startTime: string | null;
  title: string | null;
}) {
  return { id: leg.id, date: dayKeyFromDate(leg.date), startTime: leg.startTime, title: leg.title };
}

type BrickLegInput = {
  type: z.infer<typeof typeEnum>;
  intensity?: z.infer<typeof intensityEnum>;
  title: string;
  description?: string;
  durationMin?: number;
  load?: number;
};

function buildBrickLegRows(input: { date: string; legs: BrickLegInput[] }, goalId: string | null) {
  return input.legs.map((leg) => ({
    type: leg.type,
    date: toDate(input.date),
    title: leg.title,
    description: leg.description ?? null,
    durationMin: isSet(leg.durationMin) ? Math.round(leg.durationMin) : null,
    load: isSet(leg.load) ? Math.round(leg.load) : null,
    intensity: leg.intensity ?? null,
    goalId,
  }));
}

export async function executeCreateBrickSessionTool(
  athleteId: string,
  input: {
    date: string;
    startTime?: string;
    title?: string;
    legs: BrickLegInput[];
  },
) {
  const violation = await findBrickTravelViolation(athleteId, input);
  if (violation) {
    return { ok: false as const, error: violation };
  }
  const goalId = await resolveCoachDefaultGoalId(athleteId);
  const legRows = buildBrickLegRows(input, goalId);
  const legStartTimes = chainBrickLegStartTimes(input.startTime, legRows);
  const created = await createBrickSessions(
    athleteId,
    legRows.map((leg, index) => ({ ...leg, startTime: legStartTimes[index] ?? null })),
  );

  pushBrickToGoogleInBackground(created);

  return {
    ok: true as const,
    action: 'created' as const,
    brickGroupId: created[0]?.brickGroupId ?? null,
    date: input.date,
    title: input.title ?? created[0]?.title ?? 'Brick',
    legs: created.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      brickOrder: s.brickOrder,
    })),
  };
}

export async function executeDeletePlannedSessionTool(athleteId: string, id: string) {
  const existing = await getPlannedSessionById(athleteId, id);
  if (!existing) {
    return { ok: false as const, error: 'Séance introuvable' };
  }

  if (existing.googleEventId) {
    try {
      await deleteSessionFromGoogle(existing);
    } catch (error) {
      console.error('Suppression Google Calendar échouée', error);
    }
  }

  await deletePlannedSession(athleteId, id);
  return {
    ok: true,
    id,
    action: 'deleted' as const,
    title: existing.title,
    date: dayKeyFromDate(existing.date),
  };
}

export async function executeSetTravelContextTool(
  athleteId: string,
  input: {
    locationLabel: string;
    startDate: string;
    endDate: string;
    label?: string;
    note?: string;
    allowedDisciplines?: Array<'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH' | 'MOBILITY'>;
    noStructuredTraining?: boolean;
    trainingConstraint?: 'FULL' | 'REDUCED' | 'MOBILITY_ONLY' | 'NONE';
    applyToPlannedSessions?: boolean;
  },
) {
  const alreadyDeclared = await findExistingTravelOverlap(
    athleteId,
    new Date(input.startDate),
    new Date(input.endDate),
  );
  if (alreadyDeclared.length > 0) {
    return {
      ok: false as const,
      error:
        "Un déplacement est déjà enregistré sur ces dates : ne le recrée pas et ne modifie pas ses sports. Applique-le tel quel. Si l'athlète veut le changer, il le modifie dans Mémoire coach.",
      existing: alreadyDeclared,
    };
  }
  const travel = await createTravelContext(prisma, athleteId, {
    label: input.label ?? null,
    locationLabel: input.locationLabel,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    note: input.note ?? null,
    allowedDisciplines: input.allowedDisciplines ?? [],
    noStructuredTraining: input.noStructuredTraining,
    trainingConstraint: input.trainingConstraint ?? null,
    source: 'COACH',
  });
  const updatedSessions =
    input.applyToPlannedSessions === false
      ? 0
      : await applyTravelContextToUpcomingSessions(prisma, athleteId, travel.id);
  return {
    ok: true as const,
    travelId: travel.id,
    locationLabel: travel.locationLabel,
    updatedSessions,
  };
}

export async function executeSetTrainingConstraintTool(
  athleteId: string,
  input: {
    startDate: string;
    endDate: string;
    label?: string;
    note?: string;
    allowedDisciplines?: Array<'RUN' | 'BIKE' | 'SWIM' | 'STRENGTH' | 'MOBILITY'>;
    noStructuredTraining?: boolean;
    trainingConstraint?: 'FULL' | 'REDUCED' | 'MOBILITY_ONLY' | 'NONE';
  },
) {
  const constraint = await createTravelContext(prisma, athleteId, {
    type: 'CONSTRAINT',
    label: input.label ?? null,
    startDate: toDate(input.startDate),
    endDate: toDate(input.endDate),
    note: input.note ?? null,
    allowedDisciplines: input.allowedDisciplines ?? [],
    noStructuredTraining: input.noStructuredTraining,
    trainingConstraint: input.trainingConstraint ?? null,
    source: 'COACH',
  });
  return {
    ok: true as const,
    constraintId: constraint.id,
    trainingConstraint: constraint.trainingConstraint,
  };
}
