import { describe, expect, it } from 'vitest';
import {
  findTravelConflict,
  type ConflictSession,
  type ConflictWindow,
} from '@sharpit/server/lib/travel-context/travel-conflict';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function trip(overrides: Partial<ConflictWindow> = {}): ConflictWindow {
  return {
    id: 'trip',
    type: 'TRAVEL',
    label: null,
    locationLabel: 'Lyon',
    startDate: day('2026-11-07'),
    endDate: day('2026-11-08'),
    trainingConstraint: 'NONE',
    allowedDisciplines: [],
    ...overrides,
  };
}

function session(date: string, overrides: Partial<ConflictSession> = {}): ConflictSession {
  return { date: day(date), type: 'RUN', intensity: 'ENDURANCE', isKey: false, ...overrides };
}

describe('findTravelConflict', () => {
  it('counts every session a pause covers, and names the trip by its place', () => {
    const conflict = findTravelConflict(
      [trip()],
      [session('2026-11-06'), session('2026-11-07'), session('2026-11-08', { type: 'BIKE' })],
    );
    expect(conflict).toEqual({
      travelId: 'trip',
      type: 'TRAVEL',
      name: 'Lyon',
      startDate: '2026-11-07',
      endDate: '2026-11-08',
      trainingConstraint: 'NONE',
      sessionCount: 2,
    });
  });

  it('flags a sport left off the list, not the ones on it', () => {
    const window = trip({ trainingConstraint: 'FULL', allowedDisciplines: ['RUN'] });
    const conflict = findTravelConflict(
      [window],
      [session('2026-11-07'), session('2026-11-08', { type: 'BIKE' })],
    );
    expect(conflict?.sessionCount).toBe(1);
  });

  it('under a lighter load, flags key and hard sessions only', () => {
    const window = trip({ trainingConstraint: 'REDUCED' });
    const sessions = [
      session('2026-11-07'),
      session('2026-11-07', { intensity: 'THRESHOLD' }),
      session('2026-11-08', { isKey: true }),
    ];
    expect(findTravelConflict([window], sessions)?.sessionCount).toBe(2);
  });

  it('finds nothing once the sessions fit', () => {
    const window = trip({ trainingConstraint: 'REDUCED' });
    expect(
      findTravelConflict([window], [session('2026-11-07', { intensity: 'RECOVERY' })]),
    ).toBeNull();
  });

  it('leaves a trip that changes nothing alone', () => {
    const window = trip({ trainingConstraint: 'FULL' });
    expect(
      findTravelConflict([window], [session('2026-11-07', { intensity: 'VO2MAX', isKey: true })]),
    ).toBeNull();
  });

  it('reports the earliest window in conflict, a constraint by its title', () => {
    const later = trip({ id: 'later', startDate: day('2026-11-12'), endDate: day('2026-11-12') });
    const sooner = trip({
      id: 'sooner',
      type: 'CONSTRAINT',
      label: 'Boulot',
      locationLabel: null,
      startDate: day('2026-11-09'),
      endDate: day('2026-11-09'),
    });
    const conflict = findTravelConflict(
      [later, sooner],
      [session('2026-11-09'), session('2026-11-12')],
    );
    expect(conflict?.travelId).toBe('sooner');
    expect(conflict?.name).toBe('Boulot');
  });
});
