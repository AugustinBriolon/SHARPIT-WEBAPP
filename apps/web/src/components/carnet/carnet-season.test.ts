import { describe, expect, it } from 'vitest';
import { closedAdherence, seasonWeeks } from './carnet-season';
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
});
