import type { AccessTier } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import {
  adherenceWindowEnd,
  computePlanAdherence,
  type PlanAdherence,
} from '@sharpit/app/lib/admin/plan-adherence';

export type AdminAthleteRow = {
  id: string;
  clerkUserId: string;
  tier: AccessTier;
  createdAt: Date;
};

export async function listAthletesForAdmin(): Promise<AdminAthleteRow[]> {
  return prisma.athleteProfile.findMany({
    select: { id: true, clerkUserId: true, tier: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Each athlete's week 1–4 plan adherence (ADR-102): the first planned day per athlete, then
 * the sessions of the 28 days from it — two queries whatever the number of athletes.
 */
export async function loadPlanAdherence(): Promise<Map<string, PlanAdherence>> {
  const firsts = await prisma.plannedSession.groupBy({
    by: ['athleteId'],
    _min: { date: true },
  });
  const windows = firsts.flatMap(({ athleteId, _min }) =>
    _min.date
      ? [
          {
            athleteId,
            from: _min.date,
            to: new Date(`${adherenceWindowEnd(dayKey(_min.date))}T00:00:00Z`),
          },
        ]
      : [],
  );
  if (windows.length === 0) {
    return new Map();
  }

  const sessions = await prisma.plannedSession.findMany({
    where: {
      OR: windows.map(({ athleteId, from, to }) => ({ athleteId, date: { gte: from, lt: to } })),
    },
    select: {
      athleteId: true,
      date: true,
      completed: true,
      activityId: true,
      isKey: true,
      brickGroupId: true,
    },
  });
  const today = trainingDayIdForNow();
  const byAthlete = new Map<string, typeof sessions>();
  for (const session of sessions) {
    byAthlete.set(session.athleteId, [...(byAthlete.get(session.athleteId) ?? []), session]);
  }
  return new Map(
    [...byAthlete].map(([athleteId, list]) => [
      athleteId,
      computePlanAdherence(
        list.map((session) => ({
          date: dayKey(session.date),
          done: session.completed || session.activityId !== null,
          isKey: session.isKey,
          brickGroupId: session.brickGroupId,
        })),
        today,
      ),
    ]),
  );
}

/**
 * The /admin toggle. Goes through a `manual` entitlement so the tier stays derived from
 * subscriptions (ADR-044): an Apple renewal can no longer undo it, nor it an Apple one.
 */
export async function setAthleteTier(athleteId: string, tier: AccessTier) {
  const { setManualTier } = await import('@sharpit/server/lib/billing/subscription-store');
  return setManualTier(athleteId, tier);
}
