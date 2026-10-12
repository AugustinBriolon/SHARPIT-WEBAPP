import { ActivityType, GoalKind, type Prisma } from '@prisma/client';
import { prisma } from '@sharpit/db/client';
import { isMultisportLegArray, type MultisportLeg } from '@sharpit/app/lib/activity/multisport';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { resolveRunRaceMeters } from '@sharpit/app/lib/goals/goal-race-projection';
import { raceDayKey } from '@sharpit/app/lib/goals/race-moment';
import { activitiesMatch, mergedSource } from '@sharpit/server/lib/activity/list/activity-dedup';
import { isBlankActivityValue } from '@sharpit/server/lib/activity/list/activity-fill-missing';
import { recordRaceResult } from '@sharpit/server/lib/goals/goal-achievements';
import {
  detectTriathlonChain,
  MAX_TRANSITION_ROW_SEC,
  type DetectableActivity,
} from '@sharpit/server/lib/activity/multisport/triathlon-detect';
import {
  TRIATHLON_TITLE,
  triathlonTitle,
} from '@sharpit/server/lib/activity/multisport/triathlon-format';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Run distance off the race distance by more than this is not the race. */
const RACE_DISTANCE_TOLERANCE = 0.15;

type Db = Prisma.TransactionClient;
/** Rows starting / ending this close outside a triathlon's window still belong to it. */
const WINDOW_MARGIN_MS = 5 * 60 * 1000;

export const unifyDayRowSelect = {
  id: true,
  type: true,
  date: true,
  duration: true,
  title: true,
  source: true,
  load: true,
  rpe: true,
  feeling: true,
  notes: true,
  garminId: true,
  stravaId: true,
  appleHealthId: true,
  mergedIntoId: true,
  goalId: true,
  multisportLegs: true,
  runMetrics: { select: { distanceM: true, avgHr: true } },
  bikeMetrics: { select: { distanceM: true } },
  swimMetrics: { select: { distanceM: true } },
} satisfies Prisma.ActivitySelect;

export type UnifyDayRow = Prisma.ActivityGetPayload<{ select: typeof unifyDayRowSelect }>;

export type UnifyRaceGoal = {
  id: string;
  kind: GoalKind;
  title: string;
  raceFormat: string | null;
};

export type MultisportDayPlan = {
  /** An existing row to update, or the triathlon to create from the day's legs. */
  target:
    | { kind: 'existing'; id: string; duration: number | null }
    | { kind: 'create'; data: Omit<Prisma.ActivityUncheckedCreateInput, 'athleteId'> };
  absorbIds: string[];
  update: Prisma.ActivityUncheckedUpdateInput;
  /**
   * SESSION observation ids of absorbed rows the parent already counts (its own provider
   * recording, or another provider's copy of a leg) — dropped so the day's load counts once.
   */
  dropObservationExternalIds: string[];
  /** Set when this plan links the target to a race goal. */
  goal: UnifyRaceGoal | null;
};

/**
 * Titles a provider writes on its own — safe to replace with the race's name. Anything
 * else is treated as the athlete's and kept. Deliberately narrow: blank, our generated
 * "Triathlon [XS|S|M|L|XL]", Apple's generic "Séance", and a provider sport label that ends
 * in triathlon / multisport (Garmin names a session "<Place> Triathlon").
 */
export function isProviderDefaultTitle(title: string | null): boolean {
  if (isBlankActivityValue(title)) {
    return true;
  }
  const normalized = title!.trim().toLowerCase();
  return (
    normalized === 'séance' ||
    isGenericTriathlonTitle(normalized) ||
    /^[\p{L}\p{N} '’.-]{0,40}\s(triathlon|multisport|multi-sport)$/u.test(normalized)
  );
}

function isGenericTriathlonTitle(normalized: string): boolean {
  return /^(triathlon( (xs|s|m|l|xl))?|multisport|multi-sport)$/.test(normalized);
}

/**
 * The title to write, if any. A race names the session after itself over any provider title;
 * without one, only a blank / generic title is replaced — a place name ("Paris Triathlon")
 * says more than "Triathlon", so it stays unless the format adds something.
 */
function titleUpdate(
  current: string | null,
  goal: UnifyRaceGoal | null,
  legs: MultisportLeg[] | null,
): string | undefined {
  const title = unifiedTitle(goal, legs);
  if (current === title) {
    return undefined;
  }
  if (goal) {
    return isProviderDefaultTitle(current) ? title : undefined;
  }
  const normalized = current?.trim().toLowerCase() ?? '';
  if (normalized === '' || normalized === 'séance') {
    return title;
  }
  return isGenericTriathlonTitle(normalized) && title !== TRIATHLON_TITLE ? title : undefined;
}

function rowDistance(row: UnifyDayRow): number | null {
  return (
    row.runMetrics?.distanceM ?? row.bikeMetrics?.distanceM ?? row.swimMetrics?.distanceM ?? null
  );
}

function toDetectable(row: UnifyDayRow): DetectableActivity {
  return {
    id: row.id,
    type: row.type,
    date: row.date,
    duration: row.duration,
    distanceM: rowDistance(row),
    avgHr: row.runMetrics?.avgHr ?? null,
    garminId: row.garminId,
  };
}

function legDistance(legs: MultisportLeg[], kind: MultisportLeg['kind']): number | null {
  const total = legs
    .filter((leg) => leg.kind === kind)
    .reduce((sum, leg) => sum + (leg.distanceM ?? 0), 0);
  return total > 0 ? total : null;
}

function unifiedTitle(goal: UnifyRaceGoal | null, legs: MultisportLeg[] | null): string {
  if (goal) {
    return goal.title;
  }
  if (!legs) {
    return TRIATHLON_TITLE;
  }
  return triathlonTitle({
    swim: legDistance(legs, 'swim'),
    bike: legDistance(legs, 'bike'),
    run: legDistance(legs, 'run'),
  });
}

function endMs(row: { date: Date; duration: number | null }): number {
  return row.date.getTime() + (row.duration ?? 0) * 1000;
}

type RaceWindow = { date: Date; duration: number | null };

/** Share of a row's own duration a race window must cover (strictly more) for the row to belong to it. */
const MIN_WINDOW_OVERLAP = 0.5;

function overlapMs(a: RaceWindow, b: RaceWindow): number {
  return Math.max(0, Math.min(endMs(a), endMs(b)) - Math.max(a.date.getTime(), b.date.getTime()));
}

/**
 * Starts within the window's margins and spends more than half its time inside it. An end bound
 * alone missed legs that stop a few seconds after the parent (a run ending 1 s past the margin).
 * A row without a duration has no overlap to measure: never inside.
 */
function insideWindow(window: RaceWindow, row: UnifyDayRow): boolean {
  const start = row.date.getTime();
  const startsInside =
    start >= window.date.getTime() - WINDOW_MARGIN_MS && start <= endMs(window) + WINDOW_MARGIN_MS;
  const durationMs = (row.duration ?? 0) * 1000;
  return startsInside && durationMs > 0 && overlapMs(window, row) > durationMs * MIN_WINDOW_OVERLAP;
}

const LEG_ROW_TYPES: Record<Exclude<MultisportLeg['kind'], 'transition'>, ActivityType> = {
  swim: ActivityType.SWIM,
  bike: ActivityType.BIKE,
  run: ActivityType.RUN,
};

function isTransitionRow(row: UnifyDayRow): boolean {
  return (
    (row.type === ActivityType.STRENGTH || row.type === ActivityType.OTHER) &&
    row.duration !== null &&
    row.duration <= MAX_TRANSITION_ROW_SEC
  );
}

function rowFitsLeg(leg: MultisportLeg, row: UnifyDayRow): boolean {
  return leg.kind === 'transition' ? isTransitionRow(row) : row.type === LEG_ROW_TYPES[leg.kind];
}

/**
 * Points each provider leg (Garmin's) at the absorbed row recording it: same kind, largest time
 * overlap, each row used once. A leg starts where the previous ones end. A link to a row no longer
 * among the members (deleted, unmerged) is dropped and the leg relinked.
 */
export function linkLegSources(
  legs: MultisportLeg[],
  parentStart: Date,
  rows: UnifyDayRow[],
): MultisportLeg[] {
  const memberIds = new Set(rows.map((row) => row.id));
  const current = legs.map((leg) =>
    leg.sourceActivityId && !memberIds.has(leg.sourceActivityId)
      ? { ...leg, sourceActivityId: null }
      : leg,
  );
  const used = new Set(current.map((leg) => leg.sourceActivityId).filter(Boolean));
  let offsetSec = 0;
  return current.map((leg) => {
    const window = {
      date: new Date(parentStart.getTime() + offsetSec * 1000),
      duration: leg.durationSec,
    };
    offsetSec += leg.durationSec;
    if (leg.sourceActivityId) {
      return leg;
    }
    const [best] = rows
      .filter((row) => !used.has(row.id) && rowFitsLeg(leg, row) && overlapMs(window, row) > 0)
      .sort((a, b) => overlapMs(window, b) - overlapMs(window, a));
    if (!best) {
      return leg;
    }
    used.add(best.id);
    return { ...leg, sourceActivityId: best.id };
  });
}

const LEG_TYPES = new Set<ActivityType>([ActivityType.SWIM, ActivityType.BIKE, ActivityType.RUN]);
const WHOLE_RACE_TYPES = new Set<ActivityType>([ActivityType.OTHER, ActivityType.TRIATHLON]);

/** Another recording of the whole race (Apple's generic workout, a second triathlon row). */
function recordsWholeRace(window: RaceWindow, row: UnifyDayRow): boolean {
  return (
    WHOLE_RACE_TYPES.has(row.type) &&
    activitiesMatch(
      { type: ActivityType.TRIATHLON, date: row.date, duration: row.duration },
      { type: ActivityType.TRIATHLON, date: window.date, duration: window.duration },
    )
  );
}

/** A leg, a short transition row, or a copy of the whole race — never another long session. */
function isAbsorbable(window: RaceWindow, row: UnifyDayRow): boolean {
  if (row.mergedIntoId !== null) {
    return false;
  }
  if (!row.duration) {
    return recordsWholeRace(window, row);
  }
  if (!insideWindow(window, row)) {
    return false;
  }
  if (LEG_TYPES.has(row.type)) {
    return true;
  }
  return isTransitionRow(row) || recordsWholeRace(window, row);
}

function sessionExternalIds(row: UnifyDayRow): string[] {
  return [row.garminId, row.stravaId, `manual:activity:${row.id}`].filter(
    (id): id is string => id !== null,
  );
}

/** Rows the legs do not stand on: their own SESSION observations would count the race twice. */
function duplicateObservationIds(rows: UnifyDayRow[], legs: MultisportLeg[] | null): string[] {
  const legRows = new Set((legs ?? []).map((leg) => leg.sourceActivityId).filter(Boolean));
  return rows.filter((row) => !legRows.has(row.id)).flatMap(sessionExternalIds);
}

function unifiedSource(rows: UnifyDayRow[]): string {
  return mergedSource(
    rows.some((row) => row.garminId),
    rows.some((row) => row.stravaId),
    rows.some((row) => row.appleHealthId),
  );
}

/** The athlete's subjective fields, taken from the first leg that carries them. */
function subjectiveFill(parent: Partial<UnifyDayRow>, absorbed: UnifyDayRow[]) {
  const fill: Prisma.ActivityUncheckedUpdateInput = {};
  for (const key of ['rpe', 'feeling', 'notes'] as const) {
    const value = absorbed.find((row) => !isBlankActivityValue(row[key]))?.[key];
    if (isBlankActivityValue(parent[key]) && value !== undefined) {
      (fill as Record<string, unknown>)[key] = value;
    }
  }
  return fill;
}

function sumLoad(rows: UnifyDayRow[]): number | null {
  const loads = rows.map((row) => row.load).filter((load): load is number => load !== null);
  return loads.length > 0 ? loads.reduce((sum, load) => sum + load, 0) : null;
}

function asJson(legs: MultisportLeg[]): Prisma.InputJsonValue {
  return legs as unknown as Prisma.InputJsonValue;
}

/**
 * The parent's legs and what to write: ours built from the absorbed rows when it has none (and
 * no Garmin id to fetch them from), else its stored legs pointed at the rows recording them.
 */
function parentLegs(parent: UnifyDayRow, members: UnifyDayRow[], absorbed: UnifyDayRow[]) {
  const stored = isMultisportLegArray(parent.multisportLegs) ? parent.multisportLegs : null;
  if (stored) {
    const linked = linkLegSources(stored, parent.date, members);
    const changed = JSON.stringify(linked) !== JSON.stringify(stored);
    return { legs: stored, write: changed ? linked : null };
  }
  const built = parent.garminId
    ? null
    : (detectTriathlonChain(absorbed.map(toDetectable))?.legs ?? null);
  return { legs: built, write: built };
}

function existingParentUpdate(
  parent: UnifyDayRow,
  members: UnifyDayRow[],
  absorbed: UnifyDayRow[],
  goal: UnifyRaceGoal | null,
  legs: ReturnType<typeof parentLegs>,
): Prisma.ActivityUncheckedUpdateInput {
  const update: Prisma.ActivityUncheckedUpdateInput = { ...subjectiveFill(parent, absorbed) };
  const title = titleUpdate(parent.title, goal, legs.legs);
  const source = unifiedSource([parent, ...members]);
  if (title !== undefined) {
    update.title = title;
  }
  if (source !== parent.source) {
    update.source = source;
  }
  if (legs.write) {
    update.multisportLegs = asJson(legs.write);
  }
  if (goal && !parent.goalId) {
    update.goalId = goal.id;
  }
  return update;
}

function planExistingTriathlon(
  parent: UnifyDayRow,
  rows: UnifyDayRow[],
  goal: UnifyRaceGoal | null,
): MultisportDayPlan | null {
  const absorbed = rows.filter((row) => row.id !== parent.id && isAbsorbable(parent, row));
  const members = [...rows.filter((row) => row.mergedIntoId === parent.id), ...absorbed];
  const legs = parentLegs(parent, members, absorbed);
  const update = existingParentUpdate(parent, members, absorbed, goal, legs);
  if (absorbed.length === 0 && Object.keys(update).length === 0) {
    return null;
  }
  return {
    target: { kind: 'existing', id: parent.id, duration: parent.duration },
    absorbIds: absorbed.map((row) => row.id),
    update,
    goal: goal && !parent.goalId ? goal : null,
    // A provider parent counts the race in its own observation: every absorbed copy goes.
    dropObservationExternalIds: parent.garminId
      ? absorbed.flatMap(sessionExternalIds)
      : duplicateObservationIds(absorbed, legs.legs),
  };
}

function planNewTriathlon(
  visible: UnifyDayRow[],
  goal: UnifyRaceGoal | null,
): MultisportDayPlan | null {
  const chain = detectTriathlonChain(visible.map(toDetectable));
  if (!chain || (!goal && recordedTransitions(chain.legs) < 2)) {
    return null;
  }
  const window = { date: chain.start, duration: chain.durationSec };
  const absorbed = visible.filter((row) => isAbsorbable(window, row));
  const chainIds = new Set(chain.rows.map((row) => row.id));
  return {
    target: {
      kind: 'create',
      data: {
        type: ActivityType.TRIATHLON,
        date: chain.start,
        duration: chain.durationSec,
        title: unifiedTitle(goal, chain.legs),
        source: unifiedSource(absorbed),
        // Chain rows only: a second provider's copy of a leg would count its load twice.
        load: sumLoad(absorbed.filter((row) => chainIds.has(row.id))),
        multisportLegs: asJson(chain.legs),
        goalId: goal?.id ?? null,
        ...(subjectiveFill({}, absorbed) as Record<string, unknown>),
      },
    },
    absorbIds: absorbed.map((row) => row.id),
    update: {},
    goal,
    dropObservationExternalIds: duplicateObservationIds(absorbed, chain.legs),
  };
}

/**
 * T1 and T2 both recorded as their own rows: the signature of one watch multisport recording
 * split by Strava. Without that (or a race goal), swim → bike → run is a training day, left alone.
 */
function recordedTransitions(legs: MultisportLeg[]): number {
  return legs.filter((leg) => leg.kind === 'transition' && leg.sourceActivityId).length;
}

/** A single-sport race (a 10 km, a marathon…): link the day's longest run to its goal. */
function planSingleSportRace(
  visible: UnifyDayRow[],
  goal: UnifyRaceGoal | null,
): MultisportDayPlan | null {
  const raceMeters = goal ? resolveRunRaceMeters(goal.raceFormat, goal.title) : null;
  if (!goal || raceMeters === null || visible.some((row) => row.goalId === goal.id)) {
    return null;
  }
  const coversRace = (row: UnifyDayRow) =>
    Math.abs((row.runMetrics?.distanceM ?? 0) - raceMeters) <= raceMeters * RACE_DISTANCE_TOLERANCE;
  const [run] = visible
    .filter((row) => row.type === ActivityType.RUN && !row.goalId && coversRace(row))
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0));
  if (!run) {
    return null;
  }
  return {
    target: { kind: 'existing', id: run.id, duration: run.duration },
    absorbIds: [],
    update: { goalId: goal.id },
    goal,
    dropObservationExternalIds: [],
  };
}

/**
 * Pure: what unifying one day changes. Idempotent — a day already unified plans nothing.
 * Absorbed rows (`mergedIntoId` set) are never reconsidered.
 */
export function planMultisportDay(
  rows: UnifyDayRow[],
  goal: UnifyRaceGoal | null,
): MultisportDayPlan | null {
  const visible = rows.filter((row) => row.mergedIntoId === null);
  const parent = visible.find((row) => row.type === ActivityType.TRIATHLON);
  if (parent) {
    return planExistingTriathlon(parent, rows, goal);
  }
  return planNewTriathlon(visible, goal) ?? planSingleSportRace(visible, goal);
}

/** Activity dates are the athlete's wall clock written as UTC: the day is its UTC components. */
function wallClockDayRange(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00.000Z`);
  return { gte: start, lt: new Date(start.getTime() + DAY_MS) };
}

async function findRaceGoalForDay(
  db: Db,
  athleteId: string,
  dayKey: string,
): Promise<UnifyRaceGoal | null> {
  const day = wallClockDayRange(dayKey);
  const goals = await db.goal.findMany({
    where: {
      athleteId,
      kind: GoalKind.RACE,
      targetDate: {
        gte: new Date(day.gte.getTime() - DAY_MS),
        lt: new Date(day.lt.getTime() + DAY_MS),
      },
    },
    select: { id: true, kind: true, title: true, raceFormat: true, targetDate: true },
    orderBy: { createdAt: 'asc' },
  });
  return goals.find((goal) => goal.targetDate && raceDayKey(goal.targetDate) === dayKey) ?? null;
}

export async function loadMultisportDay(db: Db, athleteId: string, dayKey: string) {
  const [rows, goal] = await Promise.all([
    db.activity.findMany({
      where: { athleteId, date: wallClockDayRange(dayKey) },
      select: unifyDayRowSelect,
      orderBy: { date: 'asc' },
    }),
    findRaceGoalForDay(db, athleteId, dayKey),
  ]);
  return { rows, goal };
}

/** The parent takes over the plan link of its first linked leg, unless it already has one. */
async function movePlanLink(db: Db, athleteId: string, parentId: string, legIds: string[]) {
  const [parentLink, legLinks] = await Promise.all([
    db.plannedSession.findFirst({
      where: { athleteId, activityId: parentId },
      select: { id: true },
    }),
    db.plannedSession.findMany({
      where: { athleteId, activityId: { in: legIds } },
      select: { id: true, activityId: true },
    }),
  ]);
  // Other legs keep their own link (still completed): PlannedSession.activityId is unique.
  const first = legIds
    .map((legId) => legLinks.find((link) => link.activityId === legId))
    .find((link) => link !== undefined);
  if (!parentLink && first) {
    await db.plannedSession.update({ where: { id: first.id }, data: { activityId: parentId } });
  }
}

/** Session features hang on the observation id without a foreign key: they go with it. */
async function dropSessionObservations(db: Db, athleteId: string, externalIds: string[]) {
  const where = { athleteId, type: 'SESSION', externalId: { in: externalIds } };
  const sessions = await db.observation.findMany({ where, select: { id: true } });
  if (sessions.length === 0) {
    return;
  }
  await db.featureSet.deleteMany({
    where: { athleteId, category: 'SESSION', sessionObsId: { in: sessions.map((obs) => obs.id) } },
  });
  await db.observation.deleteMany({ where });
}

async function applyMultisportPlan(
  db: Db,
  athleteId: string,
  plan: MultisportDayPlan,
): Promise<{ id: string; duration: number | null }> {
  const target =
    plan.target.kind === 'existing'
      ? plan.target
      : await db.activity.create({
          data: { ...plan.target.data, athleteId },
          select: { id: true, duration: true },
        });
  if (plan.absorbIds.length > 0) {
    await db.activity.updateMany({
      where: { athleteId, id: { in: plan.absorbIds } },
      data: { mergedIntoId: target.id },
    });
    await movePlanLink(db, athleteId, target.id, plan.absorbIds);
  }
  if (plan.dropObservationExternalIds.length > 0) {
    await dropSessionObservations(db, athleteId, plan.dropObservationExternalIds);
  }
  if (Object.keys(plan.update).length > 0) {
    await db.activity.update({ where: { id: target.id }, data: plan.update });
  }
  return target;
}

/**
 * One (athlete, day) at a time: two syncs finishing together would otherwise both create a
 * parent. Interactive transactions run over the Neon WebSocket pool adapter as over TCP.
 */
function withDayLock<T>(athleteId: string, dayKey: string, run: (db: Db) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${athleteId}:${dayKey}`}))`;
    return run(tx);
  });
}

/** Plan one athlete-local day (`YYYY-MM-DD`) and, unless `apply` is false, write it. */
export async function unifyMultisportDay(
  athleteId: string,
  dayKey: string,
  options: { apply?: boolean } = {},
): Promise<MultisportDayPlan | null> {
  const apply = options.apply ?? true;
  const { plan, target } = await withDayLock(athleteId, dayKey, async (db) => {
    const { rows, goal } = await loadMultisportDay(db, athleteId, dayKey);
    const planned = planMultisportDay(rows, goal);
    return {
      plan: planned,
      target: planned && apply ? await applyMultisportPlan(db, athleteId, planned) : null,
    };
  });
  // After commit: the race result reads the committed parent.
  if (plan?.goal && target) {
    await recordRaceResult(plan.goal, target, 'auto');
  }
  return plan;
}

/**
 * After a provider sync: unify every day the sync touched. Best effort — a failure
 * leaves the legs as they were and is retried on the next sync.
 */
export async function unifyMultisportAfterSync(
  athleteId: string,
  activityIds: readonly string[],
): Promise<void> {
  if (activityIds.length === 0) {
    return;
  }
  try {
    const touched = await prisma.activity.findMany({
      where: { athleteId, id: { in: [...new Set(activityIds)] } },
      select: { date: true },
    });
    const dayKeys = [...new Set(touched.map((row) => dayKeyFromDate(row.date)))];
    for (const dayKey of dayKeys) {
      await unifyMultisportDay(athleteId, dayKey);
    }
  } catch (error) {
    console.error('[multisport/unify]', error);
  }
}
