import { ActivityType } from '@prisma/client';
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import {
  type GoalMetricConfig,
  type GoalPeriod,
  type PeriodMeasure,
} from '@sharpit/app/lib/goals/goal-metric-config';
import { prisma } from '@sharpit/db/client';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';

const WEEK_OPTS = { weekStartsOn: 1 as const };
const PERFORMANCE_DISTANCE_TOLERANCE = 0.03;

export type ActivityRow = {
  id: string;
  type: ActivityType;
  date: Date;
  duration: number | null;
  runMetrics: {
    distanceM: number | null;
    elevationM: number | null;
    paceSecPerKm: number | null;
  } | null;
  bikeMetrics: { elevationM: number | null } | null;
  swimMetrics: { distanceM: number | null } | null;
  stream: { data: unknown } | null;
};

const activitySelect = {
  id: true,
  type: true,
  date: true,
  duration: true,
  runMetrics: { select: { distanceM: true, elevationM: true, paceSecPerKm: true } },
  bikeMetrics: { select: { elevationM: true } },
  swimMetrics: { select: { distanceM: true } },
  stream: { select: { data: true } },
} as const;

export function buildPeriodKey(period: GoalPeriod, ref = new Date()): string {
  switch (period) {
    case 'WEEK':
      return `${getISOWeekYear(ref)}-W${String(getISOWeek(ref)).padStart(2, '0')}`;
    case 'MONTH':
      return format(ref, 'yyyy-MM');
    case 'YEAR':
      return format(ref, 'yyyy');
  }
}

function periodBounds(period: GoalPeriod, ref = new Date()): { start: Date; end: Date } {
  switch (period) {
    case 'WEEK':
      return {
        start: startOfWeek(ref, WEEK_OPTS),
        end: endOfWeek(ref, WEEK_OPTS),
      };
    case 'MONTH':
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    case 'YEAR':
      return { start: startOfYear(ref), end: endOfYear(ref) };
  }
}

function streamMaxDistanceM(stream: { data: unknown } | null): number | null {
  if (!stream?.data || typeof stream.data !== 'object') {
    return null;
  }
  const { distance } = stream.data as { distance?: number[] };
  if (!Array.isArray(distance) || distance.length === 0) {
    return null;
  }
  const max = Math.max(...distance.filter((v) => typeof v === 'number' && v > 0));
  return Number.isFinite(max) && max > 0 ? max : null;
}

function activityDistanceM(activity: ActivityRow): number | null {
  switch (activity.type) {
    case ActivityType.RUN:
      return activity.runMetrics?.distanceM ?? null;
    case ActivityType.SWIM:
      return activity.swimMetrics?.distanceM ?? null;
    case ActivityType.BIKE:
      return streamMaxDistanceM(activity.stream);
    default:
      return null;
  }
}

function activityElevationM(activity: ActivityRow): number | null {
  return activity.runMetrics?.elevationM ?? activity.bikeMetrics?.elevationM ?? null;
}

function activityDurationSec(activity: ActivityRow): number | null {
  if (activity.duration && activity.duration > 0) {
    return activity.duration;
  }
  if (activity.type === ActivityType.RUN) {
    const meters = activity.runMetrics?.distanceM;
    const pace = activity.runMetrics?.paceSecPerKm;
    if (meters && pace) {
      return (pace * meters) / 1000;
    }
  }
  return null;
}

function matchesSport(activity: ActivityRow, sport: ActivityType | null): boolean {
  if (sport === undefined || sport === null) {
    return true;
  }
  if (sport === ActivityType.RUN && activity.type === ActivityType.TRIATHLON) {
    return true;
  }
  return activity.type === sport;
}

function distanceWithinTolerance(actualM: number, targetM: number): boolean {
  const delta = targetM * PERFORMANCE_DISTANCE_TOLERANCE;
  return actualM >= targetM - delta && actualM <= targetM + delta;
}

function isPerformanceCandidate(
  activity: ActivityRow,
  sport: ActivityType,
  distanceM: number,
): { seconds: number; activityId: string } | null {
  if (!matchesSport(activity, sport)) {
    return null;
  }
  const meters = activityDistanceM(activity);
  if (!meters || !distanceWithinTolerance(meters, distanceM)) {
    return null;
  }
  const seconds = activityDurationSec(activity);
  if (!seconds || seconds <= 0) {
    return null;
  }
  return { seconds, activityId: activity.id };
}

export function computePerformanceBest(
  activities: ActivityRow[],
  sport: ActivityType,
  distanceM: number,
): { seconds: number; activityId: string } | null {
  let best: { seconds: number; activityId: string } | null = null;

  for (const activity of activities) {
    const candidate = isPerformanceCandidate(activity, sport, distanceM);
    if (!candidate) {
      continue;
    }
    if (best === undefined || best === null || candidate.seconds < best.seconds) {
      best = candidate;
    }
  }

  return best;
}

type PeriodAggregationParams = {
  activities: ActivityRow[];
  measure: PeriodMeasure;
  sport: ActivityType | null;
  period: GoalPeriod;
  ref?: Date;
};

function accumulateMeasureValue(activity: ActivityRow, measure: PeriodMeasure): number {
  switch (measure) {
    case 'activity_count':
      return 1;
    case 'duration':
      return activityDurationSec(activity) ?? 0;
    case 'distance':
      return activityDistanceM(activity) ?? 0;
    case 'elevation':
      return activityElevationM(activity) ?? 0;
  }
}

function aggregatePeriodMeasure(params: PeriodAggregationParams): number {
  const { activities, measure, sport, period, ref = new Date() } = params;
  const { start, end } = periodBounds(period, ref);
  let total = 0;

  for (const activity of activities) {
    if (activity.date < start || activity.date > end) {
      continue;
    }
    if (!matchesSport(activity, sport)) {
      continue;
    }
    total += accumulateMeasureValue(activity, measure);
  }

  return total;
}

export function computeMetricCurrentValue(
  config: GoalMetricConfig,
  activities: ActivityRow[],
  ref = new Date(),
): number | null {
  if (config.template === 'performance') {
    return computePerformanceBest(activities, config.sport, config.distanceM)?.seconds ?? null;
  }
  return aggregatePeriodMeasure({
    activities,
    measure: config.measure,
    sport: config.sport,
    period: config.period,
    ref,
  });
}

export async function loadActivitiesForGoals(athleteId: string): Promise<ActivityRow[]> {
  const yearStart = startOfYear(new Date());
  return prisma.activity.findMany({
    where: { athleteId, ...visibleActivityWhere, date: { gte: yearStart } },
    select: activitySelect,
    orderBy: { date: 'desc' },
  });
}

export async function loadAllActivitiesForPerformance(athleteId: string): Promise<ActivityRow[]> {
  return prisma.activity.findMany({
    where: { athleteId, ...visibleActivityWhere },
    select: activitySelect,
    orderBy: { date: 'desc' },
  });
}
