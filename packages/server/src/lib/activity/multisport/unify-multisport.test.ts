import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityType, GoalKind } from '@prisma/client';

const prismaMock = vi.hoisted(() => {
  const mock = {
    activity: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    goal: { findMany: vi.fn() },
    goalAchievement: { upsert: vi.fn(), findUnique: vi.fn() },
    plannedSession: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    observation: { deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    featureSet: { deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  mock.$transaction.mockImplementation((run: (tx: typeof mock) => unknown) => run(mock));
  return mock;
});

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));

import {
  isProviderDefaultTitle,
  linkLegSources,
  planMultisportDay,
  unifyMultisportDay,
  type UnifyDayRow,
  type UnifyRaceGoal,
} from '@sharpit/server/lib/activity/multisport/unify-multisport';

const T0 = Date.parse('2026-10-11T08:00:00Z');

function row(
  id: string,
  type: ActivityType,
  startMin: number,
  durationMin: number,
  overrides: Partial<UnifyDayRow> = {},
): UnifyDayRow {
  return {
    id,
    type,
    date: new Date(T0 + startMin * 60_000),
    duration: durationMin * 60,
    title: null,
    source: 'strava',
    load: null,
    rpe: null,
    feeling: null,
    notes: null,
    garminId: null,
    stravaId: `s-${id}`,
    appleHealthId: null,
    mergedIntoId: null,
    goalId: null,
    multisportLegs: null,
    runMetrics: null,
    bikeMetrics: null,
    swimMetrics: null,
    ...overrides,
  };
}

function stravaLegs(): UnifyDayRow[] {
  return [
    row('swim', ActivityType.SWIM, 0, 15, { swimMetrics: { distanceM: 750 }, load: 20 }),
    row('t1', ActivityType.OTHER, 15, 2),
    row('bike', ActivityType.BIKE, 17, 35, { bikeMetrics: { distanceM: 20_000 }, load: 45 }),
    row('t2', ActivityType.STRENGTH, 52, 1),
    row('run', ActivityType.RUN, 53, 22, {
      runMetrics: { distanceM: 5000, avgHr: 170 },
      load: 30,
      rpe: 8,
    }),
  ];
}

const goal: UnifyRaceGoal = {
  id: 'goal-1',
  kind: GoalKind.RACE,
  title: 'Triathlon de Paris',
  raceFormat: 'S',
};

describe('planMultisportDay', () => {
  it('lets the Garmin triathlon absorb the Strava legs and the Apple copy', () => {
    const garmin = row('garmin', ActivityType.TRIATHLON, 0, 75, {
      title: 'Paris Triathlon',
      source: 'garmin',
      garminId: 'g1',
      stravaId: null,
    });
    const apple = row('apple', ActivityType.TRIATHLON, 1, 74, {
      source: 'apple-health',
      stravaId: null,
      appleHealthId: 'a1',
    });
    const plan = planMultisportDay([garmin, ...stravaLegs(), apple], goal);

    expect(plan?.target).toEqual({ kind: 'existing', id: 'garmin', duration: 75 * 60 });
    expect(plan?.absorbIds).toEqual(['swim', 't1', 'bike', 't2', 'run', 'apple']);
    expect(plan?.update).toEqual({
      title: 'Triathlon de Paris',
      goalId: 'goal-1',
      source: 'garmin+strava+apple-health',
      rpe: 8,
    });
    // Garmin's own recording counts the race: the copies' observations go.
    expect(plan?.dropObservationExternalIds).toEqual(
      expect.arrayContaining(['s-swim', 's-run', 'manual:activity:apple']),
    );
  });

  it('absorbs a whole-race copy but never a long session inside the window', () => {
    const garmin = row('garmin', ActivityType.TRIATHLON, 0, 75, {
      garminId: 'g1',
      source: 'garmin',
      stravaId: null,
    });
    const appleOther = row('apple', ActivityType.OTHER, 1, 74, { stravaId: null });
    const gym = row('gym', ActivityType.STRENGTH, 20, 30);
    const plan = planMultisportDay([garmin, appleOther, gym], null);
    expect(plan?.absorbIds).toEqual(['apple']);
  });

  it('creates the triathlon from Strava legs alone', () => {
    const plan = planMultisportDay(stravaLegs(), null);

    expect(plan?.target.kind).toBe('create');
    const data = plan?.target.kind === 'create' ? plan.target.data : null;
    expect(data).toMatchObject({
      type: ActivityType.TRIATHLON,
      title: 'Triathlon S',
      duration: 75 * 60,
      load: 95,
      source: 'strava',
      goalId: null,
      rpe: 8,
    });
    expect(plan?.absorbIds).toEqual(['swim', 't1', 'bike', 't2', 'run']);
    // The legs carry the race's load: their observations stay.
    expect(plan?.dropObservationExternalIds).toEqual([]);
  });

  it('leaves a training swim → bike → run alone without recorded transitions or a race', () => {
    const training = stravaLegs().filter((leg) => leg.id !== 't1' && leg.id !== 't2');
    expect(planMultisportDay(training, null)).toBeNull();
    expect(planMultisportDay(training, goal)?.target.kind).toBe('create');
  });

  it('plans nothing once the day is unified', () => {
    const parent = row('parent', ActivityType.TRIATHLON, 0, 75, {
      title: 'Triathlon de Paris',
      goalId: 'goal-1',
      rpe: 8,
      stravaId: null,
      multisportLegs: [],
    });
    const merged = stravaLegs().map((leg) => ({ ...leg, mergedIntoId: 'parent' }));
    expect(planMultisportDay([parent, ...merged], goal)).toBeNull();
  });

  it('absorbs a late copy of a leg without touching already hidden rows', () => {
    const parent = row('parent', ActivityType.TRIATHLON, 0, 75, {
      title: 'Triathlon S',
      rpe: 8,
      multisportLegs: [],
    });
    const merged = stravaLegs().map((leg) => ({ ...leg, mergedIntoId: 'parent' }));
    const appleRun = row('apple-run', ActivityType.RUN, 53, 22, {
      stravaId: null,
      appleHealthId: 'a-run',
    });
    const plan = planMultisportDay([parent, ...merged, appleRun], null);
    expect(plan?.absorbIds).toEqual(['apple-run']);
    expect(plan?.update).toEqual({ source: 'strava+apple-health' });
  });

  it('keeps a title the athlete wrote', () => {
    const garmin = row('garmin', ActivityType.TRIATHLON, 0, 75, {
      title: 'Mon premier tri !',
      garminId: 'g1',
      source: 'garmin',
      stravaId: null,
    });
    const plan = planMultisportDay([garmin], goal);
    expect(plan?.update).toEqual({ goalId: 'goal-1' });
  });

  const marathon: UnifyRaceGoal = { ...goal, title: 'Marathon de Paris', raceFormat: 'Marathon' };
  const run = (id: string, startMin: number, durationMin: number, distanceM: number) =>
    row(id, ActivityType.RUN, startMin, durationMin, {
      runMetrics: { distanceM, avgHr: null },
    });

  it('links the run that covers a single-sport race distance', () => {
    const plan = planMultisportDay(
      [run('warmup', 0, 10, 2000), run('race', 20, 200, 42_400)],
      marathon,
    );
    expect(plan).toEqual({
      target: { kind: 'existing', id: 'race', duration: 200 * 60 },
      absorbIds: [],
      update: { goalId: 'goal-1' },
      goal: marathon,
      dropObservationExternalIds: [],
    });
  });

  it('links nothing when no run is within 15 % of the race distance', () => {
    expect(planMultisportDay([run('shakeout', 0, 30, 5000)], marathon)).toBeNull();
  });
});

describe('isProviderDefaultTitle', () => {
  it.each([null, '  ', 'Séance', 'Triathlon', 'Triathlon M', 'Paris Triathlon', 'Multisport'])(
    'treats %s as a provider title',
    (title) => {
      expect(isProviderDefaultTitle(title)).toBe(true);
    },
  );

  it.each(['Mon premier tri !', 'Triathlon de Paris', 'Natation matinale'])('keeps %s', (title) => {
    expect(isProviderDefaultTitle(title)).toBe(false);
  });
});

describe('unifyMultisportDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.goal.findMany.mockResolvedValue([
      { ...goal, targetDate: new Date('2026-10-11T00:00:00Z') },
    ]);
    prismaMock.activity.create.mockResolvedValue({ id: 'parent', duration: 75 * 60 });
    prismaMock.plannedSession.findFirst.mockResolvedValue(null);
    prismaMock.plannedSession.findMany.mockResolvedValue([
      { id: 'ps-run', activityId: 'run' },
      { id: 'ps-bike', activityId: 'bike' },
    ]);
    prismaMock.goalAchievement.findUnique.mockResolvedValue(null);
  });

  it('creates the parent, hides the legs and records the race result', async () => {
    prismaMock.activity.findMany.mockResolvedValue(stravaLegs());

    await unifyMultisportDay('athlete-1', '2026-10-11');

    expect(prismaMock.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          athleteId: 'athlete-1',
          title: 'Triathlon de Paris',
          goalId: 'goal-1',
        }),
      }),
    );
    expect(prismaMock.$executeRaw).toHaveBeenCalled();
    expect(prismaMock.activity.updateMany).toHaveBeenCalledWith({
      where: { athleteId: 'athlete-1', id: { in: ['swim', 't1', 'bike', 't2', 'run'] } },
      data: { mergedIntoId: 'parent' },
    });
    expect(prismaMock.plannedSession.update).toHaveBeenCalledWith({
      where: { id: 'ps-bike' },
      data: { activityId: 'parent' },
    });
    expect(prismaMock.goalAchievement.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          goalId: 'goal-1',
          periodKey: '_performance',
          activityId: 'parent',
          value: 75 * 60,
        }),
      }),
    );
  });

  it('writes nothing on a day already unified', async () => {
    const parent = row('parent', ActivityType.TRIATHLON, 0, 75, {
      title: 'Triathlon de Paris',
      goalId: 'goal-1',
      rpe: 8,
      multisportLegs: [],
    });
    const merged = stravaLegs().map((leg) => ({ ...leg, mergedIntoId: 'parent' }));
    prismaMock.activity.findMany.mockResolvedValue([parent, ...merged]);

    expect(await unifyMultisportDay('athlete-1', '2026-10-11')).toBeNull();
    expect(prismaMock.observation.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.activity.create).not.toHaveBeenCalled();
    expect(prismaMock.activity.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.activity.update).not.toHaveBeenCalled();
  });

  it('drops the observations and session features of copies the parent already counts', async () => {
    const garmin = row('garmin', ActivityType.TRIATHLON, 0, 75, {
      title: 'Triathlon de Paris',
      goalId: 'goal-1',
      garminId: 'g1',
      source: 'garmin',
      stravaId: null,
    });
    prismaMock.activity.findMany.mockResolvedValue([garmin, row('run', ActivityType.RUN, 53, 22)]);
    prismaMock.observation.findMany.mockResolvedValue([{ id: 'obs-run' }]);

    await unifyMultisportDay('athlete-1', '2026-10-11');

    expect(prismaMock.featureSet.deleteMany).toHaveBeenCalledWith({
      where: { athleteId: 'athlete-1', category: 'SESSION', sessionObsId: { in: ['obs-run'] } },
    });
    expect(prismaMock.observation.deleteMany).toHaveBeenCalledWith({
      where: {
        athleteId: 'athlete-1',
        type: 'SESSION',
        externalId: { in: ['s-run', 'manual:activity:run'] },
      },
    });
  });
});

describe('unifyMultisportDay — dry run', () => {
  it('plans without writing', async () => {
    vi.clearAllMocks();
    prismaMock.goal.findMany.mockResolvedValue([]);
    prismaMock.activity.findMany.mockResolvedValue(stravaLegs());

    const plan = await unifyMultisportDay('athlete-1', '2026-10-11', { apply: false });

    expect(plan?.target.kind).toBe('create');
    expect(prismaMock.activity.create).not.toHaveBeenCalled();
    expect(prismaMock.activity.updateMany).not.toHaveBeenCalled();
  });
});

describe('prod case 2026-10-11 — Garmin half Ironman with Apple Health rows', () => {
  const at = (hms: string) => new Date(`2026-10-11T${hms}Z`);
  const apple = (id: string, type: ActivityType, hms: string, duration: number) => ({
    ...row(id, type, 0, 0, { stravaId: null, appleHealthId: `a-${id}`, source: 'apple-health' }),
    date: at(hms),
    duration,
  });
  const garminLeg = (
    kind: 'swim' | 'bike' | 'run' | 'transition',
    durationSec: number,
    transitionIndex: number | null = null,
  ) => ({
    kind,
    label: kind,
    durationSec,
    movingDurationSec: null,
    distanceM: null,
    avgHr: null,
    avgSpeedMs: null,
    elevationM: null,
    calories: null,
    garminActivityId: `g-${kind}-${transitionIndex ?? 0}`,
    transitionIndex,
  });
  const parent = {
    ...row('garmin', ActivityType.TRIATHLON, 0, 0, {
      title: 'Half IronMan Versailles',
      goalId: 'goal-1',
      garminId: 'g1',
      stravaId: null,
      source: 'garmin+apple-health',
      multisportLegs: [
        garminLeg('swim', 1805),
        garminLeg('transition', 582, 1),
        garminLeg('bike', 11514),
        garminLeg('transition', 356, 2),
        garminLeg('run', 6146),
      ],
    }),
    date: at('08:19:42'),
    duration: 20403,
  };
  const merged = [
    apple('swim', ActivityType.SWIM, '08:19:42', 1522),
    apple('whole', ActivityType.OTHER, '08:19:42', 20403),
    apple('t1', ActivityType.OTHER, '08:49:47', 581),
    apple('bike', ActivityType.BIKE, '08:59:29', 11516),
    apple('t2', ActivityType.OTHER, '12:12:03', 358),
  ].map((r) => ({ ...r, mergedIntoId: 'garmin' }));
  // Ends 14:05:06 — one second past the parent's end + 5 min.
  const run = apple('run', ActivityType.RUN, '12:18:01', 6425);

  it('absorbs the run leg ending 1 s past the window', () => {
    const plan = planMultisportDay([parent, ...merged, run], null);
    expect(plan?.absorbIds).toEqual(['run']);
  });

  it('points every Garmin leg at the Apple row recording it', () => {
    const plan = planMultisportDay([parent, ...merged, run], null);
    const legs = plan?.update.multisportLegs as Array<{ sourceActivityId?: string }>;
    expect(legs.map((leg) => leg.sourceActivityId)).toEqual(['swim', 't1', 'bike', 't2', 'run']);
  });

  it('is idempotent once linked', () => {
    const linked = linkLegSources(parent.multisportLegs as never, parent.date, [
      ...merged,
      { ...run, mergedIntoId: 'garmin' },
    ]);
    const settled = { ...parent, multisportLegs: linked as never };
    const absorbedRun = { ...run, mergedIntoId: 'garmin' };
    expect(planMultisportDay([settled, ...merged, absorbedRun], null)).toBeNull();
  });

  it('drops a link to a row no longer among the members and relinks the leg', () => {
    const linked = linkLegSources(parent.multisportLegs as never, parent.date, [
      ...merged,
      { ...run, mergedIntoId: 'garmin' },
    ]);
    const unlinked = linkLegSources(linked, parent.date, merged);
    expect(unlinked.map((leg) => leg.sourceActivityId ?? null)).toEqual([
      'swim',
      't1',
      'bike',
      't2',
      null,
    ]);
    const reimported = { ...run, id: 'run-2', mergedIntoId: 'garmin' };
    const relinked = linkLegSources(linked, parent.date, [...merged, reimported]);
    expect(relinked.at(-1)?.sourceActivityId).toBe('run-2');
  });

  it('never absorbs a leg-type row without a duration', () => {
    const blank = { ...apple('blank', ActivityType.RUN, '12:18:01', 0), duration: null };
    const zero = apple('zero', ActivityType.BIKE, '09:00:00', 0);
    expect(planMultisportDay([parent, ...merged, run, blank, zero], null)?.absorbIds).toEqual([
      'run',
    ]);
  });

  it('absorbs a whole-race copy without a duration', () => {
    const copy = { ...apple('copy', ActivityType.OTHER, '08:19:50', 0), duration: null };
    expect(planMultisportDay([parent, ...merged, run, copy], null)?.absorbIds).toEqual([
      'run',
      'copy',
    ]);
  });

  it('refuses a row only half inside the race', () => {
    // Parent ends 13:59:45: this run spends exactly 1800 of its 3600 s inside.
    const half = apple('half', ActivityType.RUN, '13:29:45', 3600);
    expect(planMultisportDay([parent, ...merged, run, half], null)?.absorbIds).toEqual(['run']);
  });

  it('still refuses a row that mostly runs outside the race', () => {
    const later = apple('cooldown', ActivityType.RUN, '13:55:00', 3600);
    expect(planMultisportDay([parent, ...merged, run, later], null)?.absorbIds).toEqual(['run']);
  });
});
