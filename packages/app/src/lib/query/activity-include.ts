import { Prisma } from '@prisma/client';

export const plannedSessionSummarySelect = {
  id: true,
  title: true,
  date: true,
  type: true,
  durationMin: true,
  description: true,
  intensity: true,
  analysis: true,
  analyzedAt: true,
  // A leg realized and linked to its activity still needs to say which brick it
  // belongs to — otherwise a completed leg drops out of the group it was planned in.
  brickGroupId: true,
  brickOrder: true,
} satisfies Prisma.PlannedSessionSelect;

export const activityInclude = {
  runMetrics: true,
  bikeMetrics: true,
  swimMetrics: true,
  hikeMetrics: true,
  strengthSets: { orderBy: { order: 'asc' as const } },
  plannedSession: { select: plannedSessionSummarySelect },
  // Relation only — scalar hikeTripId is returned automatically with include.
  hikeTrip: { select: { id: true, name: true } },
};

/** Detail-only relation: GPS streams are intentionally excluded from list reads. */
export const activityDetailInclude = {
  ...activityInclude,
  stream: true,
};

/**
 * Light select for client lists/analytics: fields shown or aggregated only.
 * Avoids transferring every sub-metric (payload ÷ ~3).
 */
export const activityListSelect = {
  id: true,
  type: true,
  date: true,
  title: true,
  duration: true,
  load: true,
  rpe: true,
  feeling: true,
  weather: true,
  notes: true,
  source: true,
  stravaId: true,
  garminId: true,
  createdAt: true,
  updatedAt: true,
  runMetrics: { select: { distanceM: true } },
  bikeMetrics: { select: { distanceM: true, tss: true, avgPower: true } },
  swimMetrics: { select: { distanceM: true, avgPaceSecPer100m: true } },
  hikeMetrics: { select: { distanceM: true, elevationM: true } },
  strengthSets: { select: { exercise: true }, orderBy: { order: 'asc' as const } },
  plannedSession: { select: plannedSessionSummarySelect },
  hikeTripId: true,
  multisportLegs: true,
} satisfies Prisma.ActivitySelect;

/**
 * Coach prompt activities — enough for recent summaries + PMC/load, no plannedSession join.
 */
export const activityCoachSelect = {
  id: true,
  type: true,
  date: true,
  title: true,
  duration: true,
  load: true,
  rpe: true,
  feeling: true,
  runMetrics: { select: { distanceM: true, paceSecPerKm: true, avgHr: true } },
  bikeMetrics: { select: { tss: true, avgPower: true, normalizedPower: true } },
  swimMetrics: { select: { distanceM: true } },
  strengthSets: {
    select: { exercise: true, sets: true, reps: true, weightKg: true },
    orderBy: { order: 'asc' as const },
  },
} satisfies Prisma.ActivitySelect;

/**
 * Minimum for the PMC recurrence: exactly the `ActivityForAnalytics` shape.
 *
 * Deliberately the narrowest select in this file, because the PMC is the one read
 * that spans the athlete's entire history rather than a recent window.
 */
export const activityPmcSelect = {
  date: true,
  type: true,
  duration: true,
  load: true,
  bikeMetrics: { select: { tss: true } },
} satisfies Prisma.ActivitySelect;

/** Coach planned sessions — no linked activity include (ids + analysis only). */
export const plannedSessionCoachSelect = {
  id: true,
  date: true,
  type: true,
  title: true,
  intensity: true,
  durationMin: true,
  load: true,
  startTime: true,
  description: true,
  completed: true,
  isKey: true,
  analysis: true,
  exposureSetting: true,
  locationLabel: true,
  brickGroupId: true,
  brickOrder: true,
  goalId: true,
} satisfies Prisma.PlannedSessionSelect;

/** A planned session with its realized activity. */
export const plannedSessionInclude = {
  activity: { include: activityInclude },
};

export const physicalNoteInclude = {
  checkins: { orderBy: { date: 'desc' as const } },
};

export const planWeekInclude = { weeks: { orderBy: { weekIndex: 'asc' as const } } };
