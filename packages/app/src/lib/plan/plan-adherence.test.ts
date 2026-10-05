import { describe, expect, it } from 'vitest';
import { mondayOf } from '@sharpit/app/lib/plan/training-week';
import {
  adherence,
  outcomeAdherence,
  planUnits,
  weekProgress,
  type AdherenceSession,
} from '@sharpit/app/lib/plan/plan-adherence';

const session = (day: string, completed: boolean, brickGroupId: string | null = null) =>
  ({ day, completed, brickGroupId }) satisfies AdherenceSession;

describe('plan adherence', () => {
  it('counts a brick as one session, done once every leg is', () => {
    const units = planUnits([
      session('2026-10-01', true, 'b1'),
      session('2026-10-01', false, 'b1'),
      session('2026-10-02', true),
    ]);
    expect(units).toEqual([session('2026-10-01', false, 'b1'), session('2026-10-02', true)]);
  });

  it('counts past sessions, and today’s only once done', () => {
    const sessions = [
      session('2026-09-30', true),
      session('2026-10-01', false),
      session('2026-10-02', true),
      session('2026-10-02', false), // later today: not missed yet
      session('2026-10-03', false), // ahead
    ];
    expect(adherence(sessions, { from: '2026-09-28', to: '2026-10-05' }, '2026-10-02')).toEqual({
      planned: 3,
      done: 2,
      rate: 2 / 3,
    });
  });

  it('has no rate before anything is due', () => {
    expect(
      adherence(
        [session('2026-10-03', false)],
        { from: '2026-10-01', to: '2026-10-08' },
        '2026-10-02',
      ).rate,
    ).toBeNull();
  });

  it('measures the first four weeks against the target', () => {
    const start = '2026-09-01';
    const sessions = [
      ...['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23'].map((day) => session(day, true)),
      session('2026-09-25', false),
      session('2026-09-29', false), // day 28: outside the window
    ];
    const running = outcomeAdherence(sessions, start, '2026-09-20');
    expect(running).toMatchObject({ planned: 3, done: 3, complete: false, meetsTarget: true });

    const final = outcomeAdherence(sessions, start, '2026-10-02');
    expect(final).toMatchObject({
      planned: 5,
      done: 4,
      rate: 0.8,
      complete: true,
      meetsTarget: true,
    });
  });

  it('counts the key sessions apart, every session of a week with none', () => {
    const key = (day: string, completed: boolean) => ({ ...session(day, completed), isKey: true });
    const sessions = [
      key('2026-09-02', true),
      session('2026-09-03', false), // optional, missed
      key('2026-09-05', true),
      session('2026-09-09', true), // a week with no key session: counts
      session('2026-09-10', false),
    ];
    const outcome = outcomeAdherence(sessions, '2026-09-01', '2026-10-02');
    expect(outcome).toMatchObject({ planned: 5, done: 3 });
    expect(outcome.key).toEqual({ planned: 4, done: 3, rate: 0.75 });
  });

  it('counts the week from Monday, the sessions ahead included', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // a Sunday
    expect(mondayOf('2026-09-28')).toBe('2026-09-28');
    const sessions = [
      session('2026-09-27', true), // last week
      session('2026-09-28', true),
      session('2026-09-30', false),
      session('2026-10-01', true),
      session('2026-10-04', false),
    ];
    expect(weekProgress(sessions, '2026-10-01')).toEqual({ done: 2, planned: 4 });
  });
});
