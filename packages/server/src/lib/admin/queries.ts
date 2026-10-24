import type { AccessTier } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import {
  adherenceWindowEnd,
  computePlanAdherence,
  type PlanAdherence,
} from '@sharpit/app/lib/admin/plan-adherence';
import { athleteAiCost, type AthleteAiCost } from '@sharpit/app/lib/admin/ai-cost';

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

/** The window the AI cost is read over: a month, set against a monthly price. */
export const AI_COST_WINDOW_DAYS = 30;

/** Each athlete's AI cost over the last 30 days (ADR-103), summed per model and feature in SQL. */
export async function loadAiCost(now = new Date()): Promise<Map<string, AthleteAiCost>> {
  const since = new Date(now.getTime() - AI_COST_WINDOW_DAYS * 86_400_000);
  const groups = await prisma.aiUsageEvent.groupBy({
    by: ['athleteId', 'model', 'feature'],
    where: { createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true },
  });
  const byAthlete = new Map<string, typeof groups>();
  for (const group of groups) {
    byAthlete.set(group.athleteId, [...(byAthlete.get(group.athleteId) ?? []), group]);
  }
  return new Map(
    [...byAthlete].map(([athleteId, list]) => [
      athleteId,
      athleteAiCost(
        list.map((group) => ({
          model: group.model,
          feature: group.feature,
          inputTokens: group._sum.inputTokens ?? 0,
          outputTokens: group._sum.outputTokens ?? 0,
          cacheReadTokens: group._sum.cacheReadTokens ?? 0,
        })),
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
