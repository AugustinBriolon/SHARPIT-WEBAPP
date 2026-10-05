import { describe, expect, it } from 'vitest';
import {
  type SessionListItem,
  sessionDistanceM,
  sessionsByMonth,
  sportsByFrequency,
} from './carnet-sessions';

function item(overrides: Partial<SessionListItem>): SessionListItem {
  return {
    id: 'a',
    type: 'RUN',
    date: new Date('2026-10-01T08:00:00'),
    title: null,
    duration: null,
    load: null,
    runMetrics: null,
    bikeMetrics: null,
    swimMetrics: null,
    hikeMetrics: null,
    ...overrides,
  };
}

describe('sessionsByMonth', () => {
  it('groups newest month first and sums its time and load', () => {
    const months = sessionsByMonth([
      item({ id: 'sep', date: new Date('2026-09-30T08:00:00'), duration: 1800, load: 40 }),
      item({ id: 'oct1', date: new Date('2026-10-01T08:00:00'), duration: 3600, load: 60 }),
      item({ id: 'oct3', date: new Date('2026-10-03T08:00:00'), duration: 600 }),
    ]);

    expect(months.map((m) => m.label)).toEqual(['octobre 2026', 'septembre 2026']);
    expect(months[0]?.items.map((i) => i.id)).toEqual(['oct3', 'oct1']);
    expect(months[0]).toMatchObject({ durationSec: 4200, load: 60 });
  });
});

describe('sessionDistanceM', () => {
  it('reads whichever sport carries a distance', () => {
    expect(sessionDistanceM(item({ type: 'BIKE', bikeMetrics: { distanceM: 42000 } }))).toBe(42000);
    expect(sessionDistanceM(item({ type: 'STRENGTH' }))).toBeNull();
  });
});

describe('sportsByFrequency', () => {
  it('orders sports by how often they were done', () => {
    expect(
      sportsByFrequency([item({ type: 'BIKE' }), item({ type: 'RUN' }), item({ type: 'RUN' })]),
    ).toEqual(['RUN', 'BIKE']);
  });
});
