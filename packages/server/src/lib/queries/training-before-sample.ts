import { prisma } from '@sharpit/db/client';
import type { TrainingBeforeSample } from '@sharpit/app/lib/blood-markers/athlete-reading';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The sessions in the week and in the four weeks before a blood sample (ADR-129). */
export async function trainingBeforeSample(
  athleteId: string,
  sampledAt: Date,
): Promise<TrainingBeforeSample> {
  const weekStart = new Date(sampledAt.getTime() - 7 * DAY_MS);
  const monthStart = new Date(sampledAt.getTime() - 28 * DAY_MS);
  const before = { lt: sampledAt };
  const [sessionsInWeek, strengthInWeek, sessionsInFourWeeks] = await Promise.all([
    prisma.activity.count({ where: { athleteId, date: { ...before, gte: weekStart } } }),
    prisma.activity.count({
      where: { athleteId, type: 'STRENGTH', date: { ...before, gte: weekStart } },
    }),
    prisma.activity.count({ where: { athleteId, date: { ...before, gte: monthStart } } }),
  ]);
  return { sessionsInWeek, strengthInWeek, sessionsInFourWeeks };
}
