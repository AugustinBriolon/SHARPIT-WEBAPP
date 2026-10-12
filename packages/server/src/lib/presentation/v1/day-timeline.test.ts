/**
 * Callers: vitest suite. API: buildV1DayTimeline. Schema: none.
 * User: "fix all" — go-all P2 day timeline.
 */
import { describe, expect, it } from 'vitest';
import { buildV1DayTimeline } from './day-timeline';

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
