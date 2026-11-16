import { describe, expect, it } from 'vitest';
import {
  closedAdherence,
  planTimeline,
  type SeasonSession,
  seasonWeeks,
  sportShares,
  upcomingSeasonSessions,
  weekDayKinds,
} from './carnet-season';
import { dayOf } from './carnet-time';

const MONDAYS = [dayOf('2026-09-28'), dayOf('2026-10-05')];

describe('seasonWeeks', () => {
  it('counts planned and done sessions per week, a linked activity counting as done', () => {
    const weeks = seasonWeeks(
      [
        { date: '2026-09-29T00:00:00.000Z', completed: true },
        { date: '2026-10-01T00:00:00.000Z', completed: false, activity: { id: 'a1' } },
        { date: '2026-10-03T00:00:00.000Z', completed: false },
        { date: '2026-10-06T00:00:00.000Z', completed: false },
      ],
      MONDAYS,
      '2026-10-05',
    );

    expect(weeks[0]).toMatchObject({
      planned: 3,
      done: 2,
      open: false,
      label: '28 sept. – 4 oct.',
    });
    expect(weeks[0]?.adherence).toBeCloseTo(2 / 3);
    expect(weeks[1]).toMatchObject({ planned: 1, done: 0, open: true });
  });

  it('counts only the key sessions as key once one is marked, every session otherwise', () => {
    const [marked] = seasonWeeks(
      [
        { date: '2026-09-29', completed: true, isKey: true },
        { date: '2026-09-30', completed: false, isKey: true },
        { date: '2026-10-01', completed: true },
      ],
      MONDAYS,
      '2026-10-05',
    );
    expect(marked).toMatchObject({ keyPlanned: 2, keyDone: 1 });

    const [unmarked] = seasonWeeks(
      [
        { date: '2026-09-29', completed: true },
        { date: '2026-09-30', completed: false },
      ],
      MONDAYS,
      '2026-10-05',
    );
    expect(unmarked).toMatchObject({ keyPlanned: 2, keyDone: 1 });
  });

  it('has no adherence for a week with nothing planned', () => {
    expect(seasonWeeks([], MONDAYS, '2026-10-05')[0]?.adherence).toBeNull();
  });
});

describe('upcomingSeasonSessions', () => {
  it('keeps open sessions from today on, soonest first, and drops done or linked ones', () => {
    expect(
      upcomingSeasonSessions(
        [
          {
            id: 'done',
            date: '2026-10-16',
            completed: true,
            title: 'Seuil',
            startTime: '07:00',
          },
          {
            id: 'linked',
            date: '2026-10-16',
            completed: false,
            activity: { id: 'a1' },
            startTime: '08:00',
          },
          { id: 'later', date: '2026-10-18', completed: false, title: 'Long', startTime: '09:00' },
          { id: 'today-late', date: '2026-10-16', completed: false, startTime: '18:00' },
          { id: 'today-early', date: '2026-10-16', completed: false, startTime: '07:00' },
          { date: '2026-10-17', completed: false },
        ],
        '2026-10-16',
      ).map((session) => session.id),
    ).toEqual(['today-early', 'today-late', 'later']);
  });
});

describe('closedAdherence', () => {
  it('reads the closed weeks only', () => {
    const weeks = seasonWeeks(
      [
        { date: '2026-09-29', completed: true },
        { date: '2026-09-30', completed: false },
        { date: '2026-10-06', completed: false },
      ],
      MONDAYS,
      '2026-10-05',
    );
    expect(closedAdherence(weeks)).toBe(0.5);
    expect(closedAdherence([])).toBeNull();
  });

  it('is null with no planned sessions — empty state for Séances faites (no — %)', () => {
    const weeks = seasonWeeks([], MONDAYS, '2026-10-05');
    expect(closedAdherence(weeks)).toBeNull();
  });
});

describe('weekDayKinds', () => {
  const monday = dayOf('2026-11-16');
  const session = (date: string, extra: Partial<SeasonSession> = {}): SeasonSession => ({
    date,
    completed: false,
    ...extra,
  });

  it('reads a day with no session as none', () => {
    expect(weekDayKinds([], monday)).toEqual(Array(7).fill('none'));
  });

  it('tells a done day, a key session ahead and a plain planned one', () => {
    const kinds = weekDayKinds(
      [
        session('2026-11-16', { completed: true }),
        session('2026-11-17'),
        session('2026-11-19', { isKey: true }),
      ],
      monday,
    );
    expect(kinds).toEqual(['done', 'planned', 'none', 'key', 'none', 'none', 'none']);
  });

  it('keeps a day open while one of its sessions is not done', () => {
    const kinds = weekDayKinds(
      [session('2026-11-18', { completed: true }), session('2026-11-18')],
      monday,
    );
    expect(kinds[2]).toBe('planned');
  });
});

describe('planTimeline', () => {
  const plan = [
    { weekStart: '2026-11-02', weekIndex: 0, phase: 'BASE', targetLoad: 400, isDeload: false },
    { weekStart: '2026-11-09', weekIndex: 1, phase: 'BASE', targetLoad: 300, isDeload: true },
    { weekStart: '2026-11-16', weekIndex: 2, phase: 'BUILD', targetLoad: 500, isDeload: false },
    { weekStart: '2026-11-23', weekIndex: 3, phase: 'BUILD', targetLoad: 250, isDeload: false },
  ] as const;

  it('places today in its week and sizes each bar against the heaviest week', () => {
    const timeline = planTimeline(plan, '2026-11-18');
    expect(timeline.currentWeek).toBe(3);
    expect(timeline.currentPhase).toBe('BUILD');
    expect(timeline.weeks.map((w) => w.when)).toEqual(['past', 'past', 'current', 'ahead']);
    expect(timeline.weeks.map((w) => w.share)).toEqual([0.8, 0.6, 1, 0.5]);
    expect(timeline.weeks[1]?.deload).toBe(true);
  });

  it('groups consecutive weeks into phases and marks the running one', () => {
    expect(planTimeline(plan, '2026-11-18').phases).toEqual([
      { phase: 'BASE', first: 1, last: 2, weeks: 2, current: false },
      { phase: 'BUILD', first: 3, last: 4, weeks: 2, current: true },
    ]);
  });

  it('has no current week before the plan starts or once it is over', () => {
    expect(planTimeline(plan, '2026-10-30').currentWeek).toBeNull();
    const after = planTimeline(plan, '2026-12-15');
    expect(after.currentWeek).toBeNull();
    expect(after.weeks.every((w) => w.when === 'past')).toBe(true);
  });
});

describe('sportShares', () => {
  it('sums time by sport, largest first, ignoring sessions with no duration', () => {
    expect(
      sportShares([
        { type: 'RUN', duration: 1800 },
        { type: 'BIKE', duration: 5400 },
        { type: 'RUN', duration: null },
      ]),
    ).toEqual([
      { type: 'BIKE', seconds: 5400, share: 0.75 },
      { type: 'RUN', seconds: 1800, share: 0.25 },
    ]);
  });
});
