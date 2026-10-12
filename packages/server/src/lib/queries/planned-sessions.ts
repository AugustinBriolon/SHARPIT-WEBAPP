import { Prisma } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { prisma } from '@sharpit/db/client';
import {
  clearedBrickMetadata,
  shouldDemoteBrick,
} from '@sharpit/app/lib/planned-session/brick/brick-demotion';
import {
  plannedSessionCoachSelect,
  plannedSessionInclude,
  visibleActivityWhere,
} from '@sharpit/app/lib/query/activity-include';
import type { BrickEvaluationFields } from '@sharpit/app/lib/validators/brick-evaluation';
import { chainBrickLegStartTimes } from '@sharpit/server/lib/planned-session/brick/brick-schedule';

export async function getPlannedSessions(athleteId: string, params?: { from?: Date; to?: Date }) {
  return prisma.plannedSession.findMany({
    where: {
      athleteId,
      ...(params?.from || params?.to ? { date: { gte: params?.from, lte: params?.to } } : {}),
    },
    include: plannedSessionInclude,
    orderBy: { date: 'asc' },
  });
}

/** Slim planned sessions for Coach context — no activity join. */
export async function getPlannedSessionsForCoach(
  athleteId: string,
  params?: { from?: Date; to?: Date },
) {
  return prisma.plannedSession.findMany({
    where: {
      athleteId,
      ...(params?.from || params?.to ? { date: { gte: params?.from, lte: params?.to } } : {}),
    },
    select: plannedSessionCoachSelect,
    orderBy: { date: 'asc' },
  });
}

export async function getPlannedSessionById(athleteId: string, id: string) {
  return prisma.plannedSession.findFirst({
    where: { id, athleteId },
    include: plannedSessionInclude,
  });
}

export async function linkPlannedSessionActivity(
  athleteId: string,
  id: string,
  activityId: string | null,
) {
  if (activityId) {
    // An absorbed multisport leg cannot take a plan link: it is hidden behind its parent.
    const owned = await prisma.activity.findFirst({
      where: { id: activityId, athleteId, ...visibleActivityWhere },
      select: { id: true },
    });
    if (!owned) {
      return null;
    }
  }

  const { count } = await prisma.plannedSession.updateMany({
    where: { id, athleteId },
    data: {
      activityId,
      completed: isSet(activityId),
      ...(activityId === undefined || activityId === null
        ? { analysis: Prisma.DbNull, analyzedAt: null }
        : {}),
    },
  });
  if (count === 0) {
    return null;
  }
  return prisma.plannedSession.findUnique({ where: { id }, include: plannedSessionInclude });
}

export async function setPlannedSessionAnalysis(
  athleteId: string,
  id: string,
  analysis: Prisma.InputJsonValue,
) {
  const { count } = await prisma.plannedSession.updateMany({
    where: { id, athleteId },
    data: { analysis, analyzedAt: new Date() },
  });
  if (count === 0) {
    return null;
  }
  return prisma.plannedSession.findUnique({ where: { id }, include: plannedSessionInclude });
}

export async function createPlannedSession(
  athleteId: string,
  data: Omit<Prisma.PlannedSessionUncheckedCreateInput, 'athleteId'>,
) {
  return prisma.plannedSession.create({ data: { ...data, athleteId } });
}

/**
 * Creates several linked sessions as one brick (multisport chain, e.g. bike → run).
 * Each leg stays an autonomous session but shares a `brickGroupId`;
 * `brickOrder` follows the array order.
 */
export async function createBrickSessions(
  athleteId: string,
  legs: Omit<
    Prisma.PlannedSessionUncheckedCreateInput,
    'athleteId' | 'brickGroupId' | 'brickOrder'
  >[],
) {
  const brickGroupId = crypto.randomUUID();
  return prisma.$transaction(
    legs.map((leg, i) =>
      prisma.plannedSession.create({
        data: { ...leg, athleteId, brickGroupId, brickOrder: i },
      }),
    ),
  );
}

export async function getBrickSessions(athleteId: string, brickGroupId: string) {
  return prisma.plannedSession.findMany({
    where: { brickGroupId, athleteId },
    include: plannedSessionInclude,
    orderBy: { brickOrder: 'asc' },
  });
}

/**
 * Moves every leg of a brick at once: they share one day, and a new start time is the brick's own,
 * the legs chained end to end from it. Other fields stay leg by leg. In one transaction, so no
 * leg is left behind on the old day.
 */
export async function rescheduleBrickSessions(
  athleteId: string,
  brickGroupId: string,
  schedule: { date?: Date; startTime?: string },
) {
  return prisma.$transaction(async (tx) => {
    const legs = await tx.plannedSession.findMany({
      where: { athleteId, brickGroupId },
      orderBy: { brickOrder: 'asc' },
    });
    const startTimes = schedule.startTime
      ? chainBrickLegStartTimes(schedule.startTime, legs)
      : null;
    const moved = [];
    for (const [index, leg] of legs.entries()) {
      moved.push(
        await tx.plannedSession.update({
          where: { id: leg.id },
          data: {
            ...(schedule.date ? { date: schedule.date } : {}),
            ...(startTimes ? { startTime: startTimes[index] } : {}),
          },
        }),
      );
    }
    return moved;
  });
}

export async function getBrickAnalysis(athleteId: string, brickGroupId: string) {
  return prisma.brickAnalysis.findFirst({ where: { brickGroupId, athleteId } });
}

export async function setBrickAnalysis(
  athleteId: string,
  brickGroupId: string,
  content: Prisma.InputJsonValue,
) {
  return prisma.brickAnalysis.upsert({
    where: { brickGroupId },
    create: { brickGroupId, athleteId, content },
    update: { content, generatedAt: new Date() },
  });
}

export async function getBrickEvaluation(athleteId: string, brickGroupId: string) {
  return prisma.brickEvaluation.findFirst({ where: { brickGroupId, athleteId } });
}

export async function setBrickEvaluation(
  athleteId: string,
  brickGroupId: string,
  fields: BrickEvaluationFields,
) {
  return prisma.brickEvaluation.upsert({
    where: { brickGroupId },
    create: { brickGroupId, athleteId, ...fields },
    update: fields,
  });
}

export async function updatePlannedSession(
  athleteId: string,
  id: string,
  data: Prisma.PlannedSessionUncheckedUpdateInput,
) {
  const { count } = await prisma.plannedSession.updateMany({ where: { id, athleteId }, data });
  if (count === 0) {
    return null;
  }
  return prisma.plannedSession.findUnique({ where: { id } });
}

export async function deletePlannedSession(athleteId: string, id: string) {
  const owned = await prisma.plannedSession.findFirst({
    where: { id, athleteId },
    select: { id: true, brickGroupId: true },
  });
  if (!owned) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const deleted = await tx.plannedSession.delete({ where: { id } });

    if (!owned.brickGroupId) {
      return deleted;
    }

    const remaining = await tx.plannedSession.findMany({
      where: { athleteId, brickGroupId: owned.brickGroupId },
      select: { id: true },
    });

    if (!shouldDemoteBrick(remaining.length)) {
      return deleted;
    }

    if (remaining.length === 1) {
      await tx.plannedSession.update({
        where: { id: remaining[0]!.id },
        data: clearedBrickMetadata(),
      });
    }

    await tx.brickAnalysis.deleteMany({
      where: { brickGroupId: owned.brickGroupId, athleteId },
    });
    await tx.brickEvaluation.deleteMany({
      where: { brickGroupId: owned.brickGroupId, athleteId },
    });

    return deleted;
  });
}
