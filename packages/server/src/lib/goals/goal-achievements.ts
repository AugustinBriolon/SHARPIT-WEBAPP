import type { Goal } from '@prisma/client';
import type { EnrichedGoal } from '@sharpit/app/lib/goals/enriched-goal';
import { isSet } from '@sharpit/shared/value';
import {
  inferPerformanceEndMode,
  isGoalExpired,
  parseGoalMetricConfig,
  type GoalMetricConfig,
  type PerformanceMetricConfig,
} from '@sharpit/app/lib/goals/goal-metric-config';
import { prisma } from '@sharpit/db/client';
import {
  computeMetricCurrentValue,
  computePerformanceBest,
  buildPeriodKey,
  loadActivitiesForGoals,
  loadAllActivitiesForPerformance,
  type ActivityRow,
} from '@sharpit/server/lib/goals/goal-activity-progress';

export const PERFORMANCE_PERIOD_KEY = '_performance';

function isReached(
  currentValue: number | null,
  targetValue: number | null,
  lowerIsBetter: boolean,
): boolean {
  if (
    currentValue === undefined ||
    currentValue === null ||
    targetValue === undefined ||
    targetValue === null
  ) {
    return false;
  }
  return lowerIsBetter ? currentValue <= targetValue : currentValue >= targetValue;
}

export async function recordGoalAchievement(params: {
  goalId: string;
  periodKey: string;
  source: 'auto' | 'manual';
  value?: number | null;
  targetValue?: number | null;
  activityId?: string | null;
  achievedAt?: Date;
}): Promise<void> {
  await prisma.goalAchievement.upsert({
    where: {
      goalId_periodKey: {
        goalId: params.goalId,
        periodKey: params.periodKey,
      },
    },
    create: {
      goalId: params.goalId,
      periodKey: params.periodKey,
      source: params.source,
      value: params.value ?? undefined,
      targetValue: params.targetValue ?? undefined,
      activityId: params.activityId ?? undefined,
      achievedAt: params.achievedAt ?? new Date(),
    },
    update: {},
  });
}

/**
 * A race goal's result is the activity done for it, refreshed when that activity changes
 * (its duration once every leg is in). A manual link replaces the previous result; an
 * automatic one never takes over a result standing on another activity.
 */
export async function recordRaceResult(
  goal: { id: string; kind: string },
  activity: { id: string; duration: number | null },
  source: 'auto' | 'manual',
): Promise<void> {
  if (goal.kind !== 'RACE') {
    return;
  }
  const where = { goalId_periodKey: { goalId: goal.id, periodKey: PERFORMANCE_PERIOD_KEY } };
  if (source === 'auto') {
    const existing = await prisma.goalAchievement.findUnique({
      where,
      select: { activityId: true },
    });
    if (existing && existing.activityId !== activity.id) {
      return;
    }
  }
  const result = { source, value: activity.duration, activityId: activity.id };
  await prisma.goalAchievement.upsert({
    where,
    create: { goalId: goal.id, periodKey: PERFORMANCE_PERIOD_KEY, ...result },
    update: result,
  });
}

/** Unlinking the activity withdraws the result it stood for. */
export async function clearRaceResult(goalId: string, activityId: string): Promise<void> {
  await prisma.goalAchievement.deleteMany({
    where: { goalId, periodKey: PERFORMANCE_PERIOD_KEY, activityId },
  });
}

type SyncAchievementParams = {
  goal: Goal;
  config: GoalMetricConfig;
  currentValue: number | null;
  activities: ActivityRow[];
  ref?: Date;
};

async function hasExistingPerformanceAchievement(goalId: string): Promise<boolean> {
  const existing = await prisma.goalAchievement.findUnique({
    where: {
      goalId_periodKey: { goalId, periodKey: PERFORMANCE_PERIOD_KEY },
    },
  });
  return isSet(existing);
}

async function shouldSkipPerformanceSync(
  goal: Goal,
  config: PerformanceMetricConfig,
  ref: Date,
): Promise<boolean> {
  const endMode = inferPerformanceEndMode(config, goal.targetDate);
  const expiredOnDate = endMode === 'on_date' && isGoalExpired(goal.targetDate, ref);
  return expiredOnDate || (await hasExistingPerformanceAchievement(goal.id));
}

async function syncPerformanceAchievement(params: SyncAchievementParams): Promise<void> {
  const { goal, config, currentValue, activities, ref = new Date() } = params;
  if (config.template !== 'performance') {
    return;
  }
  if (await shouldSkipPerformanceSync(goal, config, ref)) {
    return;
  }

  const best = computePerformanceBest(activities, config.sport, config.distanceM);
  await recordGoalAchievement({
    goalId: goal.id,
    periodKey: PERFORMANCE_PERIOD_KEY,
    source: 'auto',
    value: best?.seconds ?? currentValue,
    targetValue: goal.targetValue,
    activityId: best?.activityId ?? null,
  });
  await prisma.goal.update({
    where: { id: goal.id },
    data: { achieved: true, currentValue },
  });
}

async function syncPeriodAchievement(params: SyncAchievementParams): Promise<void> {
  const { goal, config, currentValue, ref = new Date() } = params;
  if (config.template !== 'period') {
    return;
  }
  const periodKey = buildPeriodKey(config.period, ref);
  const existing = await prisma.goalAchievement.findUnique({
    where: { goalId_periodKey: { goalId: goal.id, periodKey } },
  });
  if (existing) {
    return;
  }

  await recordGoalAchievement({
    goalId: goal.id,
    periodKey,
    source: 'auto',
    value: currentValue,
    targetValue: goal.targetValue,
  });
}

async function syncAchievementForGoal(params: SyncAchievementParams): Promise<void> {
  const { goal, config, currentValue, ref = new Date() } = params;
  if (!isReached(currentValue, goal.targetValue, goal.lowerIsBetter)) {
    return;
  }
  if (isGoalExpired(goal.targetDate, ref)) {
    return;
  }

  if (config.template === 'performance') {
    await syncPerformanceAchievement(params);
    return;
  }

  await syncPeriodAchievement(params);
}

export async function recordManualGoalAchievement(goal: Goal): Promise<void> {
  const config = parseGoalMetricConfig(goal.metricKey);
  const periodKey =
    config?.template === 'period'
      ? buildPeriodKey(config.period, new Date())
      : PERFORMANCE_PERIOD_KEY;

  await recordGoalAchievement({
    goalId: goal.id,
    periodKey,
    source: 'manual',
    value: goal.currentValue,
    targetValue: goal.targetValue,
  });
}

export async function getRecentGoalAchievements(athleteId: string, limit = 20) {
  return prisma.goalAchievement.findMany({
    where: { goal: { athleteId } },
    take: limit,
    orderBy: { achievedAt: 'desc' },
    include: {
      goal: { select: { id: true, title: true, unit: true, metricKey: true, kind: true } },
      activity: {
        select: { id: true, title: true, type: true, date: true },
      },
    },
  });
}

export async function getGoalAchievementsForActivity(activityId: string) {
  return prisma.goalAchievement.findMany({
    where: { activityId },
    orderBy: { achievedAt: 'desc' },
    include: {
      goal: { select: { id: true, title: true, unit: true, metricKey: true, targetValue: true } },
    },
  });
}

export async function getLatestAchievementForGoal(goalId: string) {
  return prisma.goalAchievement.findFirst({
    where: { goalId },
    orderBy: { achievedAt: 'desc' },
    include: {
      activity: { select: { id: true, title: true, date: true } },
    },
  });
}

function selectGoalActivities(
  config: GoalMetricConfig,
  periodActivities: ActivityRow[],
  performanceActivities: ActivityRow[],
): ActivityRow[] {
  return config.template === 'performance' ? performanceActivities : periodActivities;
}

async function loadGoalAchievementState(goalId: string, goal: Goal) {
  const latest = await getLatestAchievementForGoal(goalId);
  const refreshed = await prisma.goal.findUnique({ where: { id: goalId } });
  return {
    achieved: refreshed?.achieved ?? goal.achieved,
    validatingActivityId: latest?.activityId ?? null,
    lastAchievedAt: latest?.achievedAt ?? null,
  };
}

async function enrichSingleGoal<T extends Goal>(
  goal: T,
  periodActivities: ActivityRow[],
  performanceActivities: ActivityRow[],
  ref: Date,
): Promise<EnrichedGoal<T>> {
  const config = parseGoalMetricConfig(goal.metricKey);
  if (!config || goal.kind !== 'METRIC') {
    return {
      ...goal,
      validatingActivityId: null,
      lastAchievedAt: null,
    };
  }

  const expired = isGoalExpired(goal.targetDate, ref);
  const activities = selectGoalActivities(config, periodActivities, performanceActivities);
  const currentValue = expired
    ? goal.currentValue
    : computeMetricCurrentValue(config, activities, ref);

  if (!expired) {
    await syncAchievementForGoal({ goal, config, currentValue, activities, ref });
  }

  const achievementState = await loadGoalAchievementState(goal.id, goal);
  return {
    ...goal,
    currentValue,
    ...achievementState,
  };
}

export async function enrichGoalsWithProgress<T extends Goal>(
  athleteId: string,
  goals: T[],
): Promise<EnrichedGoal<T>[]> {
  const hasPerformance = goals.some((goal) => {
    const cfg = parseGoalMetricConfig(goal.metricKey);
    return cfg?.template === 'performance';
  });

  const [periodActivities, performanceActivities] = await Promise.all([
    loadActivitiesForGoals(athleteId),
    hasPerformance
      ? loadAllActivitiesForPerformance(athleteId)
      : Promise.resolve([] as ActivityRow[]),
  ]);

  const ref = new Date();
  return Promise.all(
    goals.map((goal) => enrichSingleGoal(goal, periodActivities, performanceActivities, ref)),
  );
}
