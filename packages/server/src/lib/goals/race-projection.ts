import { ActivityType, type Goal } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { computeTrainingDayId } from '@sharpit/core/training/training-day';
import {
  buildRaceProjection,
  isProjectableRace,
  projectionAsOf,
  shouldFreezeProjection,
  type RaceProjection,
  type RaceProjectionHistoryPoint,
  type RaceProjectionInputs,
} from '@sharpit/app/lib/goals/goal-race-projection';
import { CAPACITY_WINDOW_DAYS } from '@sharpit/app/lib/goals/goal-race-capacity';
import { visibleActivityWhere } from '@sharpit/app/lib/query/activity-include';
import { isoWeekKeyOf } from '@sharpit/app/lib/training/thread/build-thread';
import {
  sessionFields,
  toAdherenceSession,
} from '@sharpit/server/lib/planned-session/adherence/plan-adherence-service';

const DAY_MS = 86_400_000;
/** Shortest long ride of any format (0.35 × a sprint's 20 km); longer formats filter further. */
const MIN_RIDE_M = 7000;
// shortcut: caps an all-time ride history read on every live projection; raise if long rides stop fitting.
const MAX_RIDES = 1000;
const HISTORY_WEEKS = 16;

type Evidence = Omit<RaceProjectionInputs, 'asOf'>;
type FrozenColumns = 'frozenProjection' | 'frozenProjectionAt';
export type GoalWithProjection<T extends Goal> = Omit<T, FrozenColumns> & {
  projection: RaceProjection | null;
};

async function loadProfile(athleteId: string): Promise<Evidence['profile']> {
  const [thresholds, weighIn] = await Promise.all([
    prisma.athleteProfile.findUnique({
      where: { id: athleteId },
      select: {
        swimCssSecPer100m: true,
        runThresholdPaceSecPerKm: true,
        ftpW: true,
        lthr: true,
        maxHr: true,
      },
    }),
    prisma.bodyCompositionMeasurement.findFirst({
      where: { athleteId, weightKg: { not: null } },
      orderBy: { measuredAt: 'desc' },
      select: { weightKg: true },
    }),
  ]);
  return {
    swimCssSecPer100m: thresholds?.swimCssSecPer100m ?? null,
    runThresholdPaceSecPerKm: thresholds?.runThresholdPaceSecPerKm ?? null,
    ftpW: thresholds?.ftpW ?? null,
    weightKg: weighIn?.weightKg ?? null,
    lthr: thresholds?.lthr ?? null,
    maxHr: thresholds?.maxHr ?? null,
  };
}

/** Whole runs and stream bests per distance since `since`, as dated Riegel references. */
async function loadRunEfforts(athleteId: string, since: Date): Promise<Evidence['runEfforts']> {
  const [runs, bests] = await Promise.all([
    prisma.activity.findMany({
      where: { athleteId, type: ActivityType.RUN, date: { gte: since }, ...visibleActivityWhere },
      select: {
        date: true,
        duration: true,
        runMetrics: { select: { distanceM: true, avgHr: true } },
      },
    }),
    prisma.performanceRecord.findMany({
      where: { athleteId, group: 'run-best', activityDate: { gte: since } },
      select: { category: true, value: true, activityDate: true },
    }),
  ]);
  return [
    ...runs.flatMap((run) =>
      run.duration && run.runMetrics?.distanceM
        ? [
            {
              meters: run.runMetrics.distanceM,
              seconds: run.duration,
              date: run.date,
              avgHr: run.runMetrics.avgHr,
            },
          ]
        : [],
    ),
    ...bests.map((best) => ({
      meters: Number(best.category.replace('run-best-', '')),
      seconds: best.value,
      date: best.activityDate,
    })),
  ];
}

async function loadRides(athleteId: string): Promise<Evidence['rides']> {
  const rides = await prisma.activity.findMany({
    where: {
      athleteId,
      type: ActivityType.BIKE,
      bikeMetrics: { distanceM: { gte: MIN_RIDE_M } },
      ...visibleActivityWhere,
    },
    select: { date: true, duration: true, bikeMetrics: { select: { distanceM: true } } },
    orderBy: { date: 'desc' },
    take: MAX_RIDES,
  });
  return rides.map((ride) => ({
    date: ride.date,
    distanceM: ride.bikeMetrics?.distanceM ?? 0,
    durationSec: ride.duration ?? 0,
  }));
}

/** Planned sessions and every activity's duration since `since`, for regularity. */
async function loadRegularity(
  athleteId: string,
  since: Date,
): Promise<Pick<Evidence, 'plannedSessions' | 'trainingVolume'>> {
  const [planned, activities] = await Promise.all([
    prisma.plannedSession.findMany({
      where: { athleteId, date: { gte: since } },
      select: sessionFields,
    }),
    prisma.activity.findMany({
      where: { athleteId, date: { gte: since }, ...visibleActivityWhere },
      select: { date: true, duration: true },
    }),
  ]);
  return {
    plannedSessions: planned.map(toAdherenceSession),
    trainingVolume: activities.map((activity) => ({
      date: activity.date,
      durationSec: activity.duration ?? 0,
    })),
  };
}

/**
 * One query set for every live projection of a read: profile, runs since `since`, long rides,
 * past races, plan and volume since `since`. The model itself drops what falls after each projection's cut-off.
 */
export async function loadRaceProjectionEvidence(
  athleteId: string,
  since: Date,
): Promise<Evidence> {
  const [profile, runEfforts, rides, pastRaces, regularity] = await Promise.all([
    loadProfile(athleteId),
    loadRunEfforts(athleteId, since),
    loadRides(athleteId),
    prisma.activity.findMany({
      where: { athleteId, goalId: { not: null }, ...visibleActivityWhere },
      select: { date: true, multisportLegs: true },
    }),
    loadRegularity(athleteId, since),
  ]);
  return { profile, runEfforts, rides, pastRaces, ...regularity };
}

function frozenProjection(goal: Goal): RaceProjection | null {
  if (!goal.frozenProjection || !goal.frozenProjectionAt) {
    return null;
  }
  return {
    ...(goal.frozenProjection as Omit<RaceProjection, 'history'>),
    history: [],
    frozenAt: goal.frozenProjectionAt.toISOString(),
  };
}

async function freeze(goal: Goal, projection: RaceProjection): Promise<RaceProjection> {
  const frozenAt = new Date();
  await prisma.goal.update({
    where: { id: goal.id },
    // History is still empty here: it is attached per read, never stored.
    data: { frozenProjection: projection, frozenProjectionAt: frozenAt },
  });
  return { ...projection, frozenAt: frozenAt.toISOString() };
}

async function liveProjections(
  athleteId: string,
  goals: readonly Goal[],
  now: Date,
): Promise<Map<string, RaceProjection>> {
  const projections = new Map<string, RaceProjection>();
  if (goals.length === 0) {
    return projections;
  }
  const asOf = new Map(goals.map((goal) => [goal.id, projectionAsOf(goal.targetDate, now)]));
  const earliest = Math.min(...[...asOf.values()].map((date) => date.getTime()));
  const evidence = await loadRaceProjectionEvidence(
    athleteId,
    new Date(earliest - CAPACITY_WINDOW_DAYS * DAY_MS),
  );
  const today = computeTrainingDayId(now);
  await Promise.all(
    goals.map(async (goal) => {
      const projection = buildRaceProjection(goal, { ...evidence, asOf: asOf.get(goal.id)! });
      if (projection) {
        const shown = shouldFreezeProjection(goal, today)
          ? await freeze(goal, projection)
          : projection;
        projections.set(goal.id, shown);
      }
    }),
  );
  return projections;
}

type Snapshot = {
  goalId: string;
  weekKey: string;
  finishSec: number;
  createdAt: Date;
  payload: unknown;
  computedAt: Date;
};

function historyPoint(snapshot: Snapshot): RaceProjectionHistoryPoint {
  return {
    weekKey: snapshot.weekKey,
    date: snapshot.createdAt.toISOString().slice(0, 10),
    finishSec: snapshot.finishSec,
  };
}

/** Every weekly snapshot of these goals, newest week first. */
async function loadSnapshots(goalIds: readonly string[]): Promise<Snapshot[]> {
  if (goalIds.length === 0) {
    return [];
  }
  return prisma.goalProjectionSnapshot.findMany({
    where: { goalId: { in: [...goalIds] } },
    orderBy: { weekKey: 'desc' },
    select: {
      goalId: true,
      weekKey: true,
      finishSec: true,
      createdAt: true,
      payload: true,
      computedAt: true,
    },
  });
}

function isAhead(goal: Goal, now: Date): boolean {
  return projectionAsOf(goal.targetDate, now).getTime() === now.getTime();
}

/**
 * This week's stored projections still valid: computed after the goal's last edit and after the
 * athlete's last activity change. Costs one tiny query, and only when a candidate exists.
 */
async function cachedProjections(
  athleteId: string,
  goals: readonly Goal[],
  thisWeek: ReadonlyMap<string, Snapshot>,
  now: Date,
): Promise<Map<string, RaceProjection>> {
  const today = computeTrainingDayId(now);
  const candidates = goals.filter(
    (goal) =>
      isAhead(goal, now) &&
      !shouldFreezeProjection(goal, today) &&
      thisWeek.get(goal.id)?.payload &&
      thisWeek.get(goal.id)!.computedAt >= goal.updatedAt,
  );
  if (candidates.length === 0) {
    return new Map();
  }
  const lastActivity = await prisma.activity.findFirst({
    where: { athleteId },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  return new Map(
    candidates.flatMap((goal) => {
      const snapshot = thisWeek.get(goal.id)!;
      const fresh = !lastActivity || snapshot.computedAt >= lastActivity.updatedAt;
      return fresh ? [[goal.id, snapshot.payload as RaceProjection] as const] : [];
    }),
  );
}

/** Stores this week's projection of each race still ahead (one row per goal and week). */
async function saveSnapshots(
  goals: readonly Goal[],
  computed: ReadonlyMap<string, RaceProjection>,
  weekKey: string,
  now: Date,
): Promise<Snapshot[]> {
  const saved = goals.flatMap((goal) => {
    const projection = computed.get(goal.id);
    return projection && isAhead(goal, now)
      ? [
          {
            goalId: goal.id,
            weekKey,
            finishSec: projection.finishSec,
            todaySec: projection.todaySec,
            payload: projection,
            computedAt: now,
          },
        ]
      : [];
  });
  await Promise.all(
    saved.map((row) =>
      prisma.goalProjectionSnapshot.upsert({
        where: { goalId_weekKey: { goalId: row.goalId, weekKey } },
        create: row,
        update: row,
      }),
    ),
  );
  return saved.map((row) => ({ ...row, createdAt: now }));
}

/** The last 16 weekly points per goal, oldest first. */
function historyByGoal(snapshots: readonly Snapshot[]): Map<string, RaceProjectionHistoryPoint[]> {
  const history = new Map<string, RaceProjectionHistoryPoint[]>();
  for (const snapshot of snapshots) {
    const points = history.get(snapshot.goalId) ?? [];
    if (points.length < HISTORY_WEEKS) {
      points.push(historyPoint(snapshot));
    }
    history.set(snapshot.goalId, points);
  }
  for (const points of history.values()) {
    points.reverse();
  }
  return history;
}

/** The stored projection only reaches clients as `projection`. */
function withoutFrozenColumns<T extends Goal>(goal: T): Omit<T, FrozenColumns> {
  const copy: Partial<T> = { ...goal };
  delete copy.frozenProjection;
  delete copy.frozenProjectionAt;
  return copy as Omit<T, FrozenColumns>;
}

/**
 * Each goal with its race finish `projection` (null for a figure goal or an unknown format):
 * the frozen pre-race one once it exists, else this week's stored one while nothing changed,
 * else computed now — stored for the week, and frozen from the race's eve.
 */
export async function withRaceProjection<T extends Goal>(
  athleteId: string,
  goals: T[],
  now = new Date(),
): Promise<GoalWithProjection<T>[]> {
  const live = goals.filter(
    (goal) => goal.kind === 'RACE' && !frozenProjection(goal) && isProjectableRace(goal),
  );
  const shown = goals.filter(
    (goal) => goal.kind === 'RACE' && (frozenProjection(goal) || isProjectableRace(goal)),
  );
  const weekKey = isoWeekKeyOf(now);
  const snapshots = await loadSnapshots(shown.map((goal) => goal.id));
  const thisWeek = new Map(
    snapshots.filter((snapshot) => snapshot.weekKey === weekKey).map((s) => [s.goalId, s]),
  );
  const cached = await cachedProjections(athleteId, live, thisWeek, now);
  const stale = live.filter((goal) => !cached.has(goal.id));
  const computed = await liveProjections(athleteId, stale, now);
  const saved = await saveSnapshots(stale, computed, weekKey, now);
  const savedIds = new Set(saved.map((row) => row.goalId));
  const history = historyByGoal([
    ...saved,
    ...snapshots.filter((s) => !(s.weekKey === weekKey && savedIds.has(s.goalId))),
  ]);
  return goals.map((goal) => {
    const projection =
      goal.kind === 'RACE'
        ? (frozenProjection(goal) ?? cached.get(goal.id) ?? computed.get(goal.id) ?? null)
        : null;
    return {
      ...withoutFrozenColumns(goal),
      projection: projection ? { ...projection, history: history.get(goal.id) ?? [] } : null,
    };
  });
}
