import type { ActivityType, Prisma } from '@prisma/client';
import { addHours, subHours } from 'date-fns';
import { prisma } from '@sharpit/db/client';

/** Écart max sur l'heure de début (Garmin vs Strava / Apple Santé peuvent diverger légèrement). */
const TIME_TOLERANCE_MS = 12 * 60 * 1000;

/** Quand la durée manque des deux côtés, fenêtre plus serrée sur l'heure seule. */
const TIME_ONLY_TOLERANCE_MS = 6 * 60 * 1000;

/** Tolérance absolue sur la durée (secondes). */
const DURATION_TOLERANCE_SEC = 150;

/** Tolérance relative sur la durée. */
const DURATION_TOLERANCE_RATIO = 0.1;

/**
 * Tolérance absolue sur la distance (mètres). Couvre Garmin (temps en mouvement) vs
 * Apple Santé (durée totale) quand distance et allure restent quasi identiques.
 */
const DISTANCE_TOLERANCE_M = 150;

/** Tolérance relative sur la distance. */
const DISTANCE_TOLERANCE_RATIO = 0.03;

export interface ActivityFingerprint {
  type: ActivityType;
  date: Date;
  duration: number | null;
  /**
   * Autres durées à tenter (ex. elapsed Garmin à côté du moving). Une seule
   * paire close suffit pour matcher.
   */
  altDurations?: number[];
  /** Distance en mètres quand le sport en a une — filet quand les durées divergent. */
  distanceM?: number | null;
}

export interface MatchedActivity {
  id: string;
  type: ActivityType;
  date: Date;
  duration: number | null;
  garminId: string | null;
  stravaId: string | null;
  source: string;
  rpe: number | null;
  feeling: string | null;
}

/** Source unifiée quand les deux plateformes pointent vers la même séance. */
export function mergedSource(hasGarmin: boolean, hasStrava: boolean): string {
  if (hasGarmin && hasStrava) {
    return 'both';
  }
  if (hasGarmin) {
    return 'garmin';
  }
  if (hasStrava) {
    return 'strava';
  }
  return 'manual';
}

function positiveNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function uniquePositive(values: Array<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const value of values) {
    const set = positiveNumber(value);
    if (set !== null && !out.includes(set)) {
      out.push(set);
    }
  }
  return out;
}

function durationsClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= DURATION_TOLERANCE_SEC) {
    return true;
  }
  return diff / Math.max(a, b, 1) <= DURATION_TOLERANCE_RATIO;
}

function distancesClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= DISTANCE_TOLERANCE_M) {
    return true;
  }
  return diff / Math.max(a, b, 1) <= DISTANCE_TOLERANCE_RATIO;
}

function fingerprintDurations(fp: ActivityFingerprint): number[] {
  return uniquePositive([fp.duration, ...(fp.altDurations ?? [])]);
}

function fingerprintDistance(fp: ActivityFingerprint): number | null {
  return positiveNumber(fp.distanceM);
}

/** True when any duration pair is within tolerance. */
function anyDurationMatch(a: ActivityFingerprint, b: ActivityFingerprint): boolean {
  const aDurs = fingerprintDurations(a);
  const bDurs = fingerprintDurations(b);
  for (const da of aDurs) {
    for (const db of bDurs) {
      if (durationsClose(da, db)) {
        return true;
      }
    }
  }
  return false;
}

export function activitiesMatch(a: ActivityFingerprint, b: ActivityFingerprint): boolean {
  if (a.type !== b.type) {
    return false;
  }

  const timeDiff = Math.abs(a.date.getTime() - b.date.getTime());
  if (timeDiff > TIME_TOLERANCE_MS) {
    return false;
  }

  const aDurs = fingerprintDurations(a);
  const bDurs = fingerprintDurations(b);
  const aDist = fingerprintDistance(a);
  const bDist = fingerprintDistance(b);

  if (aDurs.length === 0 || bDurs.length === 0) {
    if (aDist !== null && bDist !== null && distancesClose(aDist, bDist)) {
      return true;
    }
    return timeDiff <= TIME_ONLY_TOLERANCE_MS;
  }

  if (anyDurationMatch(a, b)) {
    return true;
  }

  // Même séance, horloges différentes : Garmin moving vs Apple elapsed, distance quasi égale.
  if (aDist !== null && bDist !== null && distancesClose(aDist, bDist)) {
    return true;
  }

  return false;
}

function distanceFromMetrics(row: {
  runMetrics?: { distanceM: number | null } | null;
  bikeMetrics?: { distanceM: number | null } | null;
  swimMetrics?: { distanceM: number | null } | null;
  hikeMetrics?: { distanceM: number | null } | null;
}): number | null {
  return (
    positiveNumber(row.runMetrics?.distanceM) ??
    positiveNumber(row.bikeMetrics?.distanceM) ??
    positiveNumber(row.swimMetrics?.distanceM) ??
    positiveNumber(row.hikeMetrics?.distanceM)
  );
}

function toMatchedActivity(row: {
  id: string;
  type: ActivityType;
  date: Date;
  duration: number | null;
  garminId: string | null;
  stravaId: string | null;
  source: string;
  rpe: number | null;
  feeling: string | null;
}): MatchedActivity {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    duration: row.duration,
    garminId: row.garminId,
    stravaId: row.stravaId,
    source: row.source,
    rpe: row.rpe,
    feeling: row.feeling,
  };
}

async function findByExternalId(
  field: 'garminId' | 'stravaId',
  value: string,
  excludeId?: string,
): Promise<MatchedActivity | null> {
  const match = await prisma.activity.findUnique({
    where: { [field]: value } as unknown as Prisma.ActivityWhereUniqueInput,
    select: matchSelect,
  });
  if (!match || match.id === excludeId) {
    return null;
  }
  return toMatchedActivity(match);
}

/**
 * Cherche une activité existante par ID externe ou par empreinte
 * (type + heure de début + durée, ou distance proche si les durées divergent)
 * pour éviter les doublons Garmin / Strava / Apple Santé.
 */
export async function findMatchingActivity(
  athleteId: string,
  candidate: ActivityFingerprint & {
    garminId?: string | null;
    stravaId?: string | null;
    excludeId?: string;
  },
): Promise<MatchedActivity | null> {
  if (candidate.garminId) {
    const byGarmin = await findByExternalId('garminId', candidate.garminId, candidate.excludeId);
    if (byGarmin) {
      return byGarmin;
    }
  }

  if (candidate.stravaId) {
    const byStrava = await findByExternalId('stravaId', candidate.stravaId, candidate.excludeId);
    if (byStrava) {
      return byStrava;
    }
  }

  const nearby = await prisma.activity.findMany({
    where: {
      athleteId,
      type: candidate.type,
      date: {
        gte: subHours(candidate.date, 12),
        lte: addHours(candidate.date, 12),
      },
      ...(candidate.excludeId ? { id: { not: candidate.excludeId } } : {}),
    },
    select: matchSelect,
    orderBy: { date: 'desc' },
    take: 20,
  });

  const hit = nearby.find((n) =>
    activitiesMatch(candidate, {
      type: n.type,
      date: n.date,
      duration: n.duration,
      distanceM: distanceFromMetrics(n),
    }),
  );
  return hit ? toMatchedActivity(hit) : null;
}

const matchSelect = {
  id: true,
  type: true,
  date: true,
  duration: true,
  garminId: true,
  stravaId: true,
  source: true,
  rpe: true,
  feeling: true,
  runMetrics: { select: { distanceM: true } },
  bikeMetrics: { select: { distanceM: true } },
  swimMetrics: { select: { distanceM: true } },
  hikeMetrics: { select: { distanceM: true } },
} as const;
