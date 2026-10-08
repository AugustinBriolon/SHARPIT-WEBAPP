import { prisma } from '@sharpit/db/client';
import type { ActivityFillSnapshot } from './activity-fill-missing';

/** Load the columns fill-missing needs before a secondary provider patches a row. */
export async function loadActivityFillSnapshot(
  activityId: string,
): Promise<(ActivityFillSnapshot & { id: string; hasStream: boolean }) | null> {
  const row = await prisma.activity.findUnique({
    where: { id: activityId },
    select: {
      id: true,
      title: true,
      duration: true,
      load: true,
      rpe: true,
      feeling: true,
      notes: true,
      runMetrics: true,
      bikeMetrics: true,
      swimMetrics: true,
      hikeMetrics: true,
      stream: { select: { activityId: true, available: true } },
    },
  });
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    duration: row.duration,
    load: row.load,
    rpe: row.rpe,
    feeling: row.feeling,
    notes: row.notes,
    runMetrics: row.runMetrics,
    bikeMetrics: row.bikeMetrics,
    swimMetrics: row.swimMetrics,
    hikeMetrics: row.hikeMetrics,
    // Stubs (`available: false`) must not block a later provider from writing real series.
    hasStream: row.stream?.available === true,
  };
}
