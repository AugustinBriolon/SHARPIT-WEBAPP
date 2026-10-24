import { describe, expect, it } from 'vitest';
import { computePlanAdherence, summarizeCohort, type AdherenceSession } from './plan-adherence';

const session = (
  date: string,
  done: boolean,
  extra: Partial<AdherenceSession> = {},
): AdherenceSession => ({
  date,
  done,
  isKey: false,
  brickGroupId: null,
  ...extra,
});

describe('computePlanAdherence', () => {
  it('starts week 1 on the first planned day and counts only days already over', () => {
    const result = computePlanAdherence(
      [
        session('2026-10-01', true),
        session('2026-10-03', false),
        session('2026-10-09', true),
        session('2026-10-10', true),
      ],
      '2026-10-10',
    );
    expect(result.startsOn).toBe('2026-10-01');
    expect(result.weeks[0]).toMatchObject({
      status: 'closed',
      all: { done: 1, planned: 2, rate: 0.5 },
    });
    // Week 2 runs from the 8th: the 10th is today, not over yet.
    expect(result.weeks[1]).toMatchObject({
      status: 'running',
      all: { done: 1, planned: 1, rate: 1 },
    });
    expect(result.weeks[2]).toMatchObject({ status: 'upcoming', all: { planned: 0, rate: null } });
  });

  it('counts a brick once, done when two legs are', () => {
    const result = computePlanAdherence(
      [
        session('2026-10-01', true, { brickGroupId: 'b1' }),
        session('2026-10-01', false, { brickGroupId: 'b1' }),
        session('2026-10-02', true, { brickGroupId: 'b2' }),
        session('2026-10-02', true, { brickGroupId: 'b2' }),
      ],
      '2026-10-20',
    );
    expect(result.weeks[0]!.all).toEqual({ done: 1, planned: 2, rate: 0.5 });
  });

  it('reads key sessions alone, or every session in a week with none marked', () => {
    const result = computePlanAdherence(
      [
        session('2026-10-01', true, { isKey: true }),
        session('2026-10-02', false, { isKey: true }),
        session('2026-10-03', false),
        session('2026-10-08', true),
        session('2026-10-09', false),
      ],
      '2026-10-20',
    );
    expect(result.weeks[0]!.key).toEqual({ done: 1, planned: 2, rate: 0.5 });
    expect(result.weeks[1]!.key).toEqual({ done: 1, planned: 2, rate: 0.5 });
  });

  it('has no weeks before anything is planned', () => {
    expect(computePlanAdherence([], '2026-10-20')).toEqual({ startsOn: null, weeks: [] });
  });
});

describe('summarizeCohort', () => {
  it('averages closed weeks only and counts week 4 on target', () => {
    const fourWeeks = (doneInLastWeek: boolean) =>
      computePlanAdherence(
        [
          session('2026-09-01', true),
          session('2026-09-08', false),
          session('2026-09-15', true),
          session('2026-09-22', doneInLastWeek),
        ],
        '2026-10-20',
      );
    const running = computePlanAdherence([session('2026-10-15', false)], '2026-10-20');
    const cohort = summarizeCohort([fourWeeks(true), fourWeeks(false), running]);
    expect(cohort.meanByWeek).toEqual([1, 0, 1, 0.5]);
    expect(cohort).toMatchObject({ weekFourClosed: 2, weekFourOnTarget: 1 });
  });
});
