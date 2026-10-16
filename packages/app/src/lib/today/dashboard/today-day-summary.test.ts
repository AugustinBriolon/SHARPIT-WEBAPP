import { describe, expect, it } from 'vitest';
import { buildTodayDaySummary, readComplianceScore } from './today-day-summary';
import type { ClientActivity, ClientPlannedSession } from '@sharpit/app/lib/query/types';

const TODAY = new Date('2026-07-03T10:00:00');

function activity(partial: Partial<ClientActivity> & { id: string }): ClientActivity {
  return {
    type: 'RUN',
    date: TODAY,
    title: null,
    duration: 2700,
    load: 45,
    ...partial,
  } as ClientActivity;
}

function planned(partial: Partial<ClientPlannedSession> & { id: string }): ClientPlannedSession {
  return {
    type: 'BIKE',
    date: TODAY,
    title: 'Endurance',
    durationMin: 90,
    intensity: 'ENDURANCE',
    load: 60,
    completed: false,
    activityId: null,
    ...partial,
  } as ClientPlannedSession;
}

describe('buildTodayDaySummary', () => {
  it('shows both completed activities and remaining planned sessions', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [activity({ id: 'a1', title: 'Footing' })],
      [planned({ id: 'p1', title: 'Endurance vélo' })],
    );

    expect(summary.isEmpty).toBe(false);
    expect(summary.sectionLabel).toBe("Aujourd'hui · réalisé et à venir");
    expect(summary.lines).toHaveLength(2);
    expect(summary.lines[0].kind).toBe('done');
    expect(summary.lines[0].primary).toContain('Footing');
    expect(summary.lines[1].kind).toBe('planned');
    expect(summary.lines[1].primary).toContain('Endurance vélo');
  });

  it('carries the session RPE, the one number the athlete supplies himself', () => {
    const summary = buildTodayDaySummary(TODAY, [activity({ id: 'a1', rpe: 7 })], []);

    expect(summary.lines[0].secondary).toContain('RPE 7');
    expect(summary.lines[0].secondary).toContain('45 TSS');
  });

  it('attaches structured preview metrics on done lines', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [
        activity({
          id: 'a1',
          duration: 1690,
          runMetrics: { distanceM: 5200 },
        }),
      ],
      [],
    );

    expect(summary.lines[0].metrics).toEqual([
      { label: 'Distance', value: '5.20', unit: 'km' },
      { label: 'Durée', value: '28:10', unit: 'min' },
      { label: 'Allure', value: '5:25', unit: '/km' },
    ]);
  });

  it('attaches structured preview metrics on planned lines (no TSS)', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [],
      [planned({ id: 'p1', intensity: 'ENDURANCE', durationMin: 50, load: 40 })],
    );
    expect(summary.lines[0].metrics).toEqual([
      { label: 'Intensité', value: 'Endurance', unit: '' },
      { label: 'Durée', value: '50', unit: 'min' },
    ]);
  });

  it('omits RPE rather than inventing one when the session was never rated', () => {
    const summary = buildTodayDaySummary(TODAY, [activity({ id: 'a1', rpe: null })], []);

    expect(summary.lines[0].secondary).not.toContain('RPE');
    expect(summary.lines[0].secondary).toContain('45 TSS');
  });

  it('shows planned sessions when nothing was done today', () => {
    const summary = buildTodayDaySummary(TODAY, [], [planned({ id: 'p1', title: 'Endurance' })]);

    expect(summary.sectionLabel).toBe("Prévu aujourd'hui");
    expect(summary.lines[0].kind).toBe('planned');
    expect(summary.lines[0].secondary).toContain('Endurance');
    expect(summary.lines[0].plannedSession?.id).toBe('p1');
  });

  it('attaches the first brick leg for planning deep-links', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [],
      [
        planned({
          id: 'leg-1',
          type: 'BIKE',
          title: 'Vélo',
          brickGroupId: 'brick-1',
          brickOrder: 0,
        }),
        planned({
          id: 'leg-2',
          type: 'RUN',
          title: 'Course',
          brickGroupId: 'brick-1',
          brickOrder: 1,
        }),
      ],
    );

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0].primary).toContain('Brick');
    expect(summary.lines[0].plannedSession?.id).toBe('leg-1');
    expect(summary.lines[0].brickLegs?.map((l) => l.id)).toEqual(['leg-1', 'leg-2']);
    expect(summary.lines[0].brickLegs?.map((l) => l.type)).toEqual(['BIKE', 'RUN']);
  });

  it('returns empty state when there is no activity or plan', () => {
    const summary = buildTodayDaySummary(TODAY, [], []);
    expect(summary.isEmpty).toBe(true);
    expect(summary.lines).toHaveLength(0);
  });

  it('surfaces the stamped goal in planned meta (option B)', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [],
      [planned({ id: 'p1', title: 'Tempo', goalId: 'g1' })],
      new Map([['g1', 'Nice 70.3']]),
    );

    expect(summary.lines[0]?.secondary).toContain('Sert Nice 70.3');
  });

  it('excludes past unrealized sessions from today lines', () => {
    const yesterday = new Date(TODAY.getTime() - 86_400_000);
    const summary = buildTodayDaySummary(
      TODAY,
      [],
      [planned({ id: 'p-old', title: 'Vieille séance', date: yesterday })],
    );
    expect(summary.lines).toHaveLength(0);
    expect(summary.isEmpty).toBe(true);
  });

  it('hides planned sessions once linked even if completed flag lags', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [
        activity({
          id: 'a1',
          title: 'Ride',
          plannedSession: {
            id: 'p1',
            title: 'Endurance vélo',
          } as ClientActivity['plannedSession'],
        }),
      ],
      [planned({ id: 'p1', title: 'Endurance vélo', completed: false, activityId: null })],
    );

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]?.kind).toBe('done');
    expect(summary.lines[0]?.primary).toContain('Endurance vélo');
    expect(summary.sectionLabel).not.toContain('à venir');
  });

  it('orders same-day planned sessions by startTime, soonest first', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [],
      [
        planned({ id: 'evening', title: 'Soir', startTime: '18:00' }),
        planned({ id: 'morning', title: 'Matin', startTime: '07:30' }),
        planned({ id: 'untimed', title: 'Sans heure', startTime: null }),
      ],
    );

    expect(summary.lines.map((line) => line.id)).toEqual(['morning', 'evening', 'untimed']);
  });
});

describe('buildTodayDaySummary · a brick under way', () => {
  const bikeLeg = planned({
    id: 'leg-bike',
    type: 'BIKE',
    title: 'Vélo',
    brickGroupId: 'brick-1',
    brickOrder: 0,
  });
  const runLeg = planned({
    id: 'leg-run',
    type: 'RUN',
    title: 'Course',
    brickGroupId: 'brick-1',
    brickOrder: 1,
    durationMin: 30,
  });
  const legInfo = (leg: ClientPlannedSession) => ({
    id: leg.id,
    title: leg.title,
    type: leg.type,
    brickGroupId: 'brick-1',
    brickOrder: leg.brickOrder,
  });
  const bike = activity({
    id: 'act-bike',
    type: 'BIKE',
    date: new Date('2026-07-03T12:23:34'),
    duration: 4_815,
    load: 95,
    rpe: 6,
    feeling: 'Bonnes jambes',
    plannedSession: legInfo(bikeLeg),
  } as never);
  const run = activity({
    id: 'act-run',
    type: 'RUN',
    date: new Date('2026-07-03T13:45:53'),
    duration: 1_815,
    load: 41,
    rpe: 8,
    feeling: 'Jambes lourdes au début',
    plannedSession: legInfo(runLeg),
  } as never);

  it('keeps the brick as one line, each leg beside its activity and notes', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [bike, run],
      [
        { ...bikeLeg, activityId: 'act-bike', completed: true },
        { ...runLeg, activityId: 'act-run', completed: true },
      ],
    );

    expect(summary.lines).toHaveLength(1);
    const [line] = summary.lines;
    expect(line).toMatchObject({ id: 'brick-1', kind: 'done', primary: 'Brick · Vélo → Course' });
    expect(line!.secondary).toBe('1h50 · 136 TSS · Transition 2 min 04');
    expect(line!.brickTransitionsSec).toEqual([124]);
    expect(line!.brickLegs).toEqual([
      expect.objectContaining({
        id: 'leg-bike',
        completed: true,
        activityId: 'act-bike',
        actual: { durationSec: 4_815, load: 95, rpe: 6, feeling: 'Bonnes jambes' },
      }),
      expect.objectContaining({
        id: 'leg-run',
        completed: true,
        activityId: 'act-run',
        actual: { durationSec: 1_815, load: 41, rpe: 8, feeling: 'Jambes lourdes au début' },
      }),
    ]);
  });

  it('keeps a half-done brick together, its remaining leg marked to do', () => {
    const summary = buildTodayDaySummary(
      TODAY,
      [bike],
      [{ ...bikeLeg, activityId: 'act-bike', completed: true }, runLeg],
    );

    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0]!.secondary).toContain('Course à faire');
    expect(summary.lines[0]!.brickTransitionsSec).toEqual([null]);
    expect(summary.lines[0]!.brickLegs?.[1]).toMatchObject({ completed: false, actual: null });
  });

  it('places the brick among the day’s other sessions by its start', () => {
    const morningRun = activity({ id: 'act-morning', date: new Date('2026-07-03T07:00:00') });
    const summary = buildTodayDaySummary(
      TODAY,
      [run, morningRun, bike],
      [
        { ...bikeLeg, activityId: 'act-bike', completed: true },
        { ...runLeg, activityId: 'act-run', completed: true },
      ],
    );

    expect(summary.lines.map((line) => line.id)).toEqual(['act-morning', 'brick-1']);
  });
});

describe('readComplianceScore', () => {
  it('reads a rounded score from a stored analysis and nothing from anything else', () => {
    expect(readComplianceScore({ complianceScore: 97.6, verdict: 'AS_PLANNED' })).toBe(98);
    expect(readComplianceScore({ verdict: 'AS_PLANNED' })).toBeNull();
    expect(readComplianceScore(null)).toBeNull();
    expect(readComplianceScore('97')).toBeNull();
  });
});
