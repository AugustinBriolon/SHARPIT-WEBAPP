import { describe, expect, it } from 'vitest';
import {
  collectDataDays,
  dataDaysSourcesFor,
  parseDataDaysRequest,
  type DataDaysHealthRow,
  type DataDaysSources,
} from '@sharpit/app/lib/presentation/data-days/data-days';

const RANGE = { from: '2026-09-01', to: '2026-09-30' };

function healthRow(date: string, fields: Partial<DataDaysHealthRow> = {}): DataDaysHealthRow {
  return {
    // @db.Date rows come back at UTC midnight.
    date: new Date(`${date}T00:00:00.000Z`),
    sleepMinutes: null,
    hrv: null,
    restingHr: null,
    recoveryScore: null,
    bodyBattery: null,
    ...fields,
  };
}

function sources(partial: Partial<DataDaysSources>): DataDaysSources {
  return { health: [], activityDates: [], nutrition: [], ...partial };
}

describe('collectDataDays', () => {
  it('counts a sleep day only when minutes were recorded', () => {
    const input = sources({
      health: [
        healthRow('2026-09-02', { sleepMinutes: 420 }),
        healthRow('2026-09-03', { sleepMinutes: 0 }),
        healthRow('2026-09-04', { hrv: 60 }),
      ],
    });

    expect(collectDataDays('sleep', input, RANGE)).toEqual(['2026-09-02']);
  });

  it('counts a recovery day from any recovery signal', () => {
    const input = sources({
      health: [
        healthRow('2026-09-02', { hrv: 55 }),
        healthRow('2026-09-03', { restingHr: 48 }),
        healthRow('2026-09-04', { bodyBattery: 70 }),
        healthRow('2026-09-05', { sleepMinutes: 400 }),
      ],
    });

    expect(collectDataDays('recovery', input, RANGE)).toEqual([
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('counts an effort day per activity, de-duplicating two sessions on one day', () => {
    const input = sources({
      activityDates: [
        new Date(2026, 8, 5, 7, 30),
        new Date(2026, 8, 5, 18, 0),
        new Date(2026, 8, 7, 12, 0),
      ],
    });

    expect(collectDataDays('effort', input, RANGE)).toEqual(['2026-09-05', '2026-09-07']);
  });

  it('merges health and activity days for adaptation, sorted', () => {
    const input = sources({
      health: [healthRow('2026-09-09', { hrv: 50 })],
      activityDates: [new Date(2026, 8, 3, 9, 0)],
    });

    expect(collectDataDays('adaptation', input, RANGE)).toEqual(['2026-09-03', '2026-09-09']);
  });

  it('ignores nutrition days logged with zero calories', () => {
    const input = sources({
      nutrition: [
        { date: new Date('2026-09-02T00:00:00.000Z'), calories: 2100 },
        { date: new Date('2026-09-03T00:00:00.000Z'), calories: 0 },
      ],
    });

    expect(collectDataDays('nutrition', input, RANGE)).toEqual(['2026-09-02']);
  });

  it('drops days outside the requested range', () => {
    const input = sources({
      health: [
        healthRow('2026-08-31', { sleepMinutes: 400 }),
        healthRow('2026-10-01', { sleepMinutes: 400 }),
      ],
    });

    expect(collectDataDays('sleep', input, RANGE)).toEqual([]);
  });
});

describe('dataDaysSourcesFor', () => {
  it('reads only the sources a domain needs', () => {
    expect(dataDaysSourcesFor('sleep')).toEqual({
      health: true,
      activities: false,
      nutrition: false,
      journal: false,
    });
    expect(dataDaysSourcesFor('adaptation')).toEqual({
      health: true,
      activities: true,
      nutrition: false,
      journal: false,
    });
    expect(dataDaysSourcesFor('nutrition')).toEqual({
      health: false,
      activities: false,
      nutrition: true,
      journal: false,
    });
  });
});

describe('parseDataDaysRequest', () => {
  function parse(query: string) {
    return parseDataDaysRequest(new URLSearchParams(query));
  }

  it('accepts a valid request', () => {
    expect(parse('domain=sleep&from=2026-09-01&to=2026-09-28')).toEqual({
      ok: true,
      request: { domain: 'sleep', from: '2026-09-01', to: '2026-09-28' },
    });
  });

  it('rejects an unknown domain', () => {
    expect(parse('domain=body&from=2026-09-01&to=2026-09-28').ok).toBe(false);
  });

  it('rejects malformed or missing dates', () => {
    expect(parse('domain=sleep&from=2026-9-1&to=2026-09-28').ok).toBe(false);
    expect(parse('domain=sleep&to=2026-09-28').ok).toBe(false);
  });

  it('rejects an inverted range', () => {
    expect(parse('domain=sleep&from=2026-09-28&to=2026-09-01').ok).toBe(false);
  });

  it('rejects a range longer than the cap', () => {
    expect(parse('domain=sleep&from=2026-01-01&to=2026-09-28').ok).toBe(false);
  });
});

describe('journal data days', () => {
  const sources = {
    health: [],
    activityDates: [],
    nutrition: [],
    journal: [
      {
        trainingDayId: '2026-09-27',
        factors: { alcohol: 'yes' },
        moodLabel: null,
        hydrationMl: null,
        caffeineMg: null,
      },
      {
        trainingDayId: '2026-09-28',
        factors: { alcohol: 'unset' },
        moodLabel: null,
        hydrationMl: null,
        caffeineMg: null,
      },
      {
        trainingDayId: '2026-09-29',
        factors: {},
        moodLabel: null,
        hydrationMl: 500,
        caffeineMg: null,
      },
    ],
  };

  it('marks the days something was answered, not the rows reset to unset', () => {
    expect(collectDataDays('journal', sources, { from: '2026-09-01', to: '2026-09-30' })).toEqual([
      '2026-09-27',
      '2026-09-29',
    ]);
  });

  it('counts a morning check-in as a journal day — the mood lives there', () => {
    expect(
      collectDataDays(
        'journal',
        { ...sources, checkinDays: ['2026-09-20', '2026-09-27'] },
        { from: '2026-09-01', to: '2026-09-30' },
      ),
    ).toEqual(['2026-09-20', '2026-09-27', '2026-09-29']);
  });

  it('reads only the journal for the journal domain', () => {
    expect(dataDaysSourcesFor('journal')).toEqual({
      health: false,
      activities: false,
      nutrition: false,
      journal: true,
    });
  });
});
