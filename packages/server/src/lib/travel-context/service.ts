import { addDays } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import {
  Prisma,
  type AthleteMemoryEntryType,
  type CoachMemorySource,
  type PrismaClient,
  type TravelDiscipline,
  type TravelTrainingConstraint,
} from '@prisma/client';
import { geocodePlaceLabel } from '@sharpit/server/lib/geocoding/nominatim';
import { toUtcDateOnly } from '@sharpit/app/lib/travel-context/calendar-date';
import {
  deriveTravelTrainingConstraint,
  normalizeTravelDisciplines,
} from '@sharpit/app/lib/travel-context/disciplines';
import { isTravelTrainingConstraint } from '@sharpit/app/lib/travel-context/training-constraint';

export type TravelContextInput = {
  /** Defaults to TRAVEL. CONSTRAINT entries have no location. */
  type?: AthleteMemoryEntryType;
  label?: string | null;
  /** Required when type is TRAVEL (or omitted); ignored for CONSTRAINT. */
  locationLabel?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  startDate: Date;
  endDate: Date;
  note?: string | null;
  trainingConstraint?: TravelTrainingConstraint | null;
  allowedDisciplines?: TravelDiscipline[] | null;
  noStructuredTraining?: boolean;
  source?: CoachMemorySource;
};

function resolveTrainingFields(input: TravelContextInput): {
  allowedDisciplines: TravelDiscipline[];
  trainingConstraint: TravelTrainingConstraint;
} {
  const allowedDisciplines = normalizeTravelDisciplines(input.allowedDisciplines ?? []);

  if (input.noStructuredTraining) {
    return { allowedDisciplines: [], trainingConstraint: 'NONE' };
  }

  if (allowedDisciplines.length > 0) {
    return {
      allowedDisciplines,
      trainingConstraint: deriveTravelTrainingConstraint(allowedDisciplines),
    };
  }

  if (isTravelTrainingConstraint(input.trainingConstraint)) {
    return { allowedDisciplines: [], trainingConstraint: input.trainingConstraint };
  }

  return { allowedDisciplines: [], trainingConstraint: 'FULL' };
}

export async function resolveTravelContextCoordinates(
  input: Pick<TravelContextInput, 'locationLabel' | 'locationLat' | 'locationLng'> & {
    locationLabel: string;
  },
): Promise<{ locationLabel: string; locationLat: number; locationLng: number }> {
  if (
    isSet(input.locationLat) &&
    isSet(input.locationLng) &&
    Number.isFinite(input.locationLat) &&
    Number.isFinite(input.locationLng)
  ) {
    return {
      locationLabel: input.locationLabel,
      locationLat: input.locationLat,
      locationLng: input.locationLng,
    };
  }

  const geocoded = await geocodePlaceLabel(input.locationLabel);
  if (!geocoded) {
    throw new Error(`Lieu introuvable : « ${input.locationLabel} »`);
  }

  return {
    locationLabel: geocoded.label,
    locationLat: geocoded.latitude,
    locationLng: geocoded.longitude,
  };
}

/** CONSTRAINT entries have no place; TRAVEL entries require one (geocoded if needed). */
async function resolveLocationFields(input: TravelContextInput): Promise<{
  locationLabel: string | null;
  locationLat: number | null;
  locationLng: number | null;
}> {
  // Only TRAVEL needs a place; CONSTRAINT / INJURY / PREFERENCE / NOTE do not.
  if ((input.type ?? 'TRAVEL') !== 'TRAVEL') {
    return { locationLabel: null, locationLat: null, locationLng: null };
  }
  if (!input.locationLabel) {
    throw new Error('Un lieu est requis pour un déplacement.');
  }
  return resolveTravelContextCoordinates({
    locationLabel: input.locationLabel,
    locationLat: input.locationLat,
    locationLng: input.locationLng,
  });
}

export async function getActiveTravelContext(
  prisma: PrismaClient,
  athleteId: string,
  onDate = new Date(),
) {
  const day = toUtcDateOnly(onDate);
  const travel = await prisma.athleteTravelContext.findFirst({
    where: {
      athleteId,
      type: 'TRAVEL',
      startDate: { lte: day },
      endDate: { gte: day },
    },
    orderBy: { startDate: 'desc' },
  });
  if (!travel) {
    return null;
  }
  // type: 'TRAVEL' is filtered above — location is always resolved for these rows.
  return {
    ...travel,
    locationLabel: travel.locationLabel as string,
    locationLat: travel.locationLat as number,
    locationLng: travel.locationLng as number,
  };
}

/** All TRAVEL entries overlapping a calendar day (inclusive), for the given athlete. */
export async function listActiveTravelContexts(
  prisma: PrismaClient,
  athleteId: string,
  onDate = new Date(),
) {
  const day = toUtcDateOnly(onDate);
  const travels = await prisma.athleteTravelContext.findMany({
    where: {
      athleteId,
      type: 'TRAVEL',
      startDate: { lte: day },
      endDate: { gte: day },
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  });
  return travels.map((travel) => ({
    ...travel,
    locationLabel: travel.locationLabel as string,
    locationLat: travel.locationLat as number,
    locationLng: travel.locationLng as number,
  }));
}

/**
 * Hard-delete travel/constraint rows whose last day is already past.
 * Lazy cleanup — called from list paths so planning + memory never surface history.
 */
export async function purgeExpiredTravelContexts(
  prisma: PrismaClient,
  athleteId: string,
  onDate = new Date(),
) {
  const day = toUtcDateOnly(onDate);
  // PREFERENCE / NOTE are durable (ADR-080) — never auto-purged; athlete archives them.
  const result = await prisma.athleteTravelContext.deleteMany({
    where: {
      athleteId,
      endDate: { lt: day },
      type: { in: ['TRAVEL', 'CONSTRAINT', 'INJURY'] },
    },
  });
  return result.count;
}

/**
 * TRAVEL / CONSTRAINT / INJURY covering a calendar day: the windows that limit which
 * sports may be scheduled. PREFERENCE / NOTE never restrict planning.
 * Read-only, unlike `listTravelContexts` it never purges.
 */
export async function listRestrictionsOnDay(prisma: PrismaClient, athleteId: string, onDate: Date) {
  const day = toUtcDateOnly(onDate);
  return prisma.athleteTravelContext.findMany({
    where: {
      athleteId,
      type: { in: ['TRAVEL', 'CONSTRAINT', 'INJURY'] },
      startDate: { lte: day },
      endDate: { gte: day },
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  });
}

/** TRAVEL entries sharing at least one calendar day with [startDate, endDate] (inclusive). */
export async function listTravelsOverlapping(
  prisma: PrismaClient,
  athleteId: string,
  startDate: Date,
  endDate: Date,
) {
  return prisma.athleteTravelContext.findMany({
    where: {
      athleteId,
      type: 'TRAVEL',
      startDate: { lte: toUtcDateOnly(endDate) },
      endDate: { gte: toUtcDateOnly(startDate) },
    },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
  });
}

/** Active + upcoming only (expired rows are purged first). */
export async function listTravelContexts(
  prisma: PrismaClient,
  athleteId: string,
  onDate = new Date(),
) {
  const day = toUtcDateOnly(onDate);
  await purgeExpiredTravelContexts(prisma, athleteId, day);
  return prisma.athleteTravelContext.findMany({
    where: { athleteId, endDate: { gte: day } },
    orderBy: [{ startDate: 'asc' }],
  });
}

export async function createTravelContext(
  prisma: PrismaClient,
  athleteId: string,
  input: TravelContextInput,
) {
  const coords = await resolveLocationFields(input);
  const training = resolveTrainingFields(input);
  return prisma.athleteTravelContext.create({
    data: {
      athleteId,
      type: input.type ?? 'TRAVEL',
      label: input.label ?? null,
      locationLabel: coords.locationLabel,
      locationLat: coords.locationLat,
      locationLng: coords.locationLng,
      startDate: toUtcDateOnly(input.startDate),
      endDate: toUtcDateOnly(input.endDate),
      note: input.note ?? null,
      trainingConstraint: training.trainingConstraint,
      allowedDisciplines: training.allowedDisciplines,
      source: input.source ?? 'USER',
    },
  });
}

export async function updateTravelContext(
  prisma: PrismaClient,
  athleteId: string,
  id: string,
  input: TravelContextInput,
) {
  const coords = await resolveLocationFields(input);
  const training = resolveTrainingFields(input);
  const { count } = await prisma.athleteTravelContext.updateMany({
    where: { id, athleteId },
    data: {
      label: input.label ?? null,
      locationLabel: coords.locationLabel,
      locationLat: coords.locationLat,
      locationLng: coords.locationLng,
      startDate: toUtcDateOnly(input.startDate),
      endDate: toUtcDateOnly(input.endDate),
      note: input.note ?? null,
      trainingConstraint: training.trainingConstraint,
      allowedDisciplines: training.allowedDisciplines,
    },
  });
  if (count === 0) {
    return null;
  }
  return prisma.athleteTravelContext.findUnique({ where: { id } });
}

export async function deleteTravelContext(prisma: PrismaClient, athleteId: string, id: string) {
  const owned = await prisma.athleteTravelContext.findFirst({
    where: { id, athleteId },
    select: { id: true },
  });
  if (!owned) {
    return null;
  }
  return prisma.athleteTravelContext.delete({ where: { id } });
}

export async function applyTravelContextToUpcomingSessions(
  prisma: PrismaClient,
  athleteId: string,
  travelId: string,
): Promise<number> {
  const travel = await prisma.athleteTravelContext.findFirst({
    where: { id: travelId, athleteId },
  });
  if (!travel || travel.type !== 'TRAVEL') {
    return 0;
  }

  const today = toUtcDateOnly(new Date());
  const horizon = addDays(today, 60);

  const sessions = await prisma.plannedSession.findMany({
    where: {
      athleteId,
      date: { gte: today, lte: horizon },
      completed: false,
      OR: [
        { exposureSetting: 'OUTDOOR' },
        { exposureSetting: 'UNKNOWN' },
        { exposureSetting: null },
      ],
    },
    select: { id: true, date: true },
  });

  const inWindow = sessions.filter((s) => s.date >= travel.startDate && s.date <= travel.endDate);

  if (inWindow.length === 0) {
    return 0;
  }

  await prisma.plannedSession.updateMany({
    where: { id: { in: inWindow.map((s) => s.id) }, athleteId },
    data: {
      exposureSetting: 'OUTDOOR',
      locationLabel: travel.locationLabel,
      locationLat: travel.locationLat,
      locationLng: travel.locationLng,
      environmentContext: Prisma.DbNull,
      environmentContextAt: null,
    },
  });

  return inWindow.length;
}
