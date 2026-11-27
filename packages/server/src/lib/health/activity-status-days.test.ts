import { describe, expect, it } from 'vitest';
import { daysBetween, resolveActivityStatusDays } from './activity-status-days';

const at = (iso: string) => new Date(iso);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('activity-status-days', () => {
  it('lists every day of a range, both ends included, across a month', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });

  it('gives a day the mode still open when it ends', () => {
    const periods = [
      {
        status: 'active',
        startedAt: at('2026-11-01T08:00:00Z'),
        endedAt: at('2026-11-03T09:00:00Z'),
        untilDate: null,
      },
      {
        status: 'sick',
        startedAt: at('2026-11-03T09:00:00Z'),
        endedAt: at('2026-11-05T18:00:00Z'),
        untilDate: null,
      },
      { status: 'active', startedAt: at('2026-11-05T18:00:00Z'), endedAt: null, untilDate: null },
    ];
    expect(
      resolveActivityStatusDays(daysBetween('2026-11-02', '2026-11-06'), periods, []).map(
        (row) => row.status,
      ),
    ).toEqual(['active', 'sick', 'sick', 'active', 'active']);
  });

  it('lets a day set after the fact win over the history', () => {
    const periods = [
      { status: 'active', startedAt: at('2026-11-01T08:00:00Z'), endedAt: null, untilDate: null },
    ];
    const overrides = [{ day: day('2026-11-02'), status: 'injured' }];
    expect(
      resolveActivityStatusDays(['2026-11-01', '2026-11-02', '2026-11-03'], periods, overrides),
    ).toEqual([
      { day: '2026-11-01', status: 'active' },
      { day: '2026-11-02', status: 'injured' },
      { day: '2026-11-03', status: 'active' },
    ]);
  });

  it('stops a mode at its deadline even before the next read closes it', () => {
    const periods = [
      {
        status: 'paused',
        startedAt: at('2026-11-01T08:00:00Z'),
        endedAt: null,
        untilDate: day('2026-11-02'),
      },
    ];
    expect(
      resolveActivityStatusDays(['2026-11-02', '2026-11-03'], periods, []).map((row) => row.status),
    ).toEqual(['paused', 'active']);
  });

  it('reads a day with no history as active, and an unknown mode as active', () => {
    expect(
      resolveActivityStatusDays(
        ['2026-01-01', '2026-01-02'],
        [],
        [{ day: day('2026-01-02'), status: 'vacation' }],
      ).map((row) => row.status),
    ).toEqual(['active', 'active']);
  });

  it('counts a mode taken late in the evening for the Paris day, not the UTC one', () => {
    // 23:30 Paris on 2 Nov is 22:30 UTC the same day; 00:30 Paris on 3 Nov is 23:30 UTC on 2 Nov.
    const periods = [
      { status: 'sick', startedAt: at('2026-11-02T23:30:00Z'), endedAt: null, untilDate: null },
    ];
    expect(
      resolveActivityStatusDays(['2026-11-02', '2026-11-03'], periods, []).map((row) => row.status),
    ).toEqual(['active', 'sick']);
  });
});
