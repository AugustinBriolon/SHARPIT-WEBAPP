/**
 * Callers: vitest suite. API: buildV1DayTimeline. Schema: none.
 * User: "fix all" — go-all P2 day timeline.
 */
import { describe, expect, it } from 'vitest';
import { buildV1DayTimeline, mealMoments } from './day-timeline';

describe('buildV1DayTimeline', () => {
  it('orders wake, check-ins, meals, sessions and stress by minuteOfDay', () => {
    const events = buildV1DayTimeline({
      bedtimeMin: 23 * 60,
      wakeMin: 7 * 60,
      sessions: [{ title: 'Seuil', kind: 'planned', minuteOfDay: 18 * 60 }],
      meals: [{ meal: 'BREAKFAST', count: 2, kcal: 420 }],
      journal: { moodLabel: 'Bon', hydrationMl: 1500, caffeineMg: 80 },
      stress: { value: 55, asOf: '2026-10-12' },
      energyBank: {
        algorithmVersion: 'energy-bank-v1',
        value: 62,
        typicalBaseline: null,
        asOfMinuteOfDay: 14 * 60,
        series: [
          { minuteOfDay: 10 * 60, value: 80 },
          { minuteOfDay: 14 * 60, value: 60 },
        ],
      },
    });

    expect(events.map((event) => event.kind)).toEqual([
      'wake',
      'meal',
      'checkin',
      'checkin',
      'stress',
      'checkin',
      'session',
      'sleep',
    ]);
    expect(events.find((event) => event.kind === 'stress')?.title).toBe('Pic de drain');
    expect(events.find((event) => event.kind === 'meal')?.detail).toContain('420 kcal');
  });

  it('groups the thousands of a meal that runs long', () => {
    const events = buildV1DayTimeline({
      bedtimeMin: null,
      wakeMin: null,
      sessions: [],
      meals: [{ meal: 'DINNER', count: 40, kcal: 124_356.4 }],
      journal: { moodLabel: null, hydrationMl: null, caffeineMg: null },
      stress: null,
      energyBank: null,
    });

    expect(events[0]?.detail).toMatch(/^40 aliments · 124\s356 kcal$/u);
  });

  it('falls back to a day stress marker when the energy series is flat', () => {
    const events = buildV1DayTimeline({
      bedtimeMin: null,
      wakeMin: null,
      sessions: [],
      meals: [],
      journal: { moodLabel: null, hydrationMl: null, caffeineMg: null },
      stress: { value: 40, asOf: '2026-10-12' },
      energyBank: null,
    });
    expect(events).toEqual([
      {
        kind: 'stress',
        minuteOfDay: 15 * 60,
        title: 'Stress du jour',
        detail: '40 / 100',
      },
    ]);
  });
});

describe('mealMoments (ADR-137)', () => {
  it('stands a meal without any time at its usual hour', () => {
    const [moment] = mealMoments([
      { meal: 'LUNCH', kcal: 300, eatenMinute: null },
      { meal: 'LUNCH', kcal: 200, eatenMinute: null },
    ]);
    expect(moment).toEqual({ meal: 'LUNCH', count: 2, kcal: 500, minuteOfDay: null });
  });

  it('places a meal at its first food and folds the untimed foods into it', () => {
    expect(
      mealMoments([
        { meal: 'BREAKFAST', kcal: 100, eatenMinute: 7 * 60 + 40 },
        { meal: 'BREAKFAST', kcal: 50, eatenMinute: null },
        { meal: 'BREAKFAST', kcal: 80, eatenMinute: 7 * 60 + 10 },
      ]),
    ).toEqual([{ meal: 'BREAKFAST', count: 3, kcal: 230, minuteOfDay: 7 * 60 + 10 }]);
  });

  it('splits foods of one meal eaten more than 45 minutes apart', () => {
    const moments = mealMoments([
      { meal: 'SNACKS', kcal: 90, eatenMinute: 10 * 60 },
      { meal: 'SNACKS', kcal: 200, eatenMinute: 16 * 60 + 30 },
      { meal: 'SNACKS', kcal: 40, eatenMinute: 16 * 60 + 45 },
    ]);
    expect(moments.map((moment) => [moment.minuteOfDay, moment.count])).toEqual([
      [10 * 60, 1],
      [16 * 60 + 30, 2],
    ]);
  });

  it('puts a timed meal on the rail at its own time, not the usual hour', () => {
    const events = buildV1DayTimeline({
      bedtimeMin: null,
      wakeMin: null,
      sessions: [],
      meals: [
        { meal: 'DINNER', count: 1, kcal: 600, minuteOfDay: 21 * 60 + 15 },
        { meal: 'LUNCH', count: 1, kcal: 500 },
      ],
      journal: { moodLabel: null, hydrationMl: null, caffeineMg: null },
      stress: null,
      energyBank: null,
    });
    expect(events.map((event) => [event.title, event.minuteOfDay])).toEqual([
      ['Déjeuner', 12 * 60 + 30],
      ['Dîner', 21 * 60 + 15],
    ]);
  });
});

describe('sessions and coffee on the clock (ADR-138)', () => {
  const quiet = {
    bedtimeMin: null,
    wakeMin: null,
    meals: [],
    stress: null,
    energyBank: null,
  };

  it('places a session at its start and says whether it is done', () => {
    const events = buildV1DayTimeline({
      ...quiet,
      sessions: [
        { title: 'Footing', kind: 'done', minuteOfDay: 7 * 60 + 10 },
        { title: 'Seuil', kind: 'planned', minuteOfDay: 18 * 60 },
      ],
      journal: { moodLabel: null, hydrationMl: null, caffeineMg: null },
    });
    expect(events.map((event) => [event.title, event.minuteOfDay, event.state])).toEqual([
      ['Footing', 7 * 60 + 10, 'done'],
      ['Seuil', 18 * 60, 'planned'],
    ]);
  });

  it('puts the coffee when it was noted, else at the old fixed hour', () => {
    const at = (caffeineMinute: number | null) =>
      buildV1DayTimeline({
        ...quiet,
        sessions: [],
        journal: { moodLabel: null, hydrationMl: null, caffeineMg: 80, caffeineMinute },
      })[0]?.minuteOfDay;
    expect(at(13 * 60 + 2)).toBe(13 * 60 + 2);
    expect(at(null)).toBe(16 * 60);
  });
});
