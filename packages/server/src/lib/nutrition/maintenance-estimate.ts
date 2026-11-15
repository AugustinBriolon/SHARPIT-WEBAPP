import { parseISO, subDays } from 'date-fns';

import { prisma } from '@sharpit/db/client';

/** Days read back from the analysed day. */
export const MAINTENANCE_WINDOW_DAYS = 28;
/** Below this share of logged days the mean intake says little about the unlogged ones. */
const MIN_LOGGED_DAYS = 20;
const MIN_WEIGH_INS = 3;
/** The weigh-ins must span this long for a slope to mean more than water. */
const MIN_WEIGH_IN_SPAN_DAYS = 14;
/** Energy of a kilogram of body mass change, the usual planning figure. */
const KCAL_PER_KG = 7700;
const MS_PER_DAY = 86_400_000;

export type MaintenanceEvidence = {
  /** Energy logged on each day with a diary, kcal. */
  loggedKcal: readonly number[];
  weighIns: ReadonlyArray<{ at: Date; kg: number }>;
};

function weightSlopeKgPerDay(weighIns: MaintenanceEvidence['weighIns']): number | null {
  const sorted = [...weighIns].sort((a, b) => a.at.getTime() - b.at.getTime());
  const [first] = sorted;
  const last = sorted[sorted.length - 1];
  if (
    sorted.length < MIN_WEIGH_INS ||
    !first ||
    !last ||
    (last.at.getTime() - first.at.getTime()) / MS_PER_DAY < MIN_WEIGH_IN_SPAN_DAYS
  ) {
    return null;
  }
  const xs = sorted.map((w) => (w.at.getTime() - first.at.getTime()) / MS_PER_DAY);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = sorted.reduce((sum, w) => sum + w.kg, 0) / sorted.length;
  let covariance = 0;
  let variance = 0;
  sorted.forEach((w, i) => {
    covariance += (xs[i]! - meanX) * (w.kg - meanY);
    variance += (xs[i]! - meanX) ** 2;
  });
  return variance > 0 ? covariance / variance : null;
}

/**
 * The energy that holds the athlete's weight, measured: what they ate on average minus
 * what their weight trend says was stored or drawn. The profile's target is a guess; the
 * scale is the only check on it. Null when the diary or the weigh-ins are too thin.
 */
export function estimateMaintenanceKcal(evidence: MaintenanceEvidence): number | null {
  const slope = weightSlopeKgPerDay(evidence.weighIns);
  if (slope === null || evidence.loggedKcal.length < MIN_LOGGED_DAYS) {
    return null;
  }
  const meanIntake =
    evidence.loggedKcal.reduce((sum, kcal) => sum + kcal, 0) / evidence.loggedKcal.length;
  return Math.round((meanIntake - slope * KCAL_PER_KG) / 10) * 10;
}

export async function loadMeasuredMaintenanceKcal(
  athleteId: string,
  trainingDayId: string,
): Promise<number | null> {
  const until = new Date(`${trainingDayId}T23:59:59.999Z`);
  const since = subDays(parseISO(trainingDayId), MAINTENANCE_WINDOW_DAYS);
  const [days, weighIns] = await Promise.all([
    prisma.dailyNutrition.findMany({
      where: { athleteId, date: { gte: since, lte: until }, calories: { gt: 0 } },
      select: { date: true, calories: true },
    }),
    prisma.bodyCompositionMeasurement.findMany({
      where: { athleteId, measuredAt: { gte: since, lte: until }, weightKg: { gt: 0 } },
      select: { measuredAt: true, weightKg: true },
    }),
  ]);
  // One figure a day: the diary can hold a row per source.
  const byDay = new Map<string, number>();
  for (const day of days) {
    const key = day.date.toISOString().slice(0, 10);
    byDay.set(key, Math.max(byDay.get(key) ?? 0, day.calories ?? 0));
  }
  return estimateMaintenanceKcal({
    loggedKcal: [...byDay.values()],
    weighIns: weighIns.map((w) => ({ at: w.measuredAt, kg: w.weightKg as number })),
  });
}
