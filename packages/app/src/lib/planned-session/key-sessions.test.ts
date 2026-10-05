import { describe, expect, it } from 'vitest';
import {
  chooseKeySessions,
  countsAsKey,
  type KeySessionCandidate,
} from '@sharpit/app/lib/planned-session/key-sessions';

const session = (
  date: string,
  type: KeySessionCandidate['type'],
  intensity: KeySessionCandidate['intensity'],
  durationMin: number,
  brickGroupId: string | null = null,
): KeySessionCandidate => ({ date, type, intensity, durationMin, brickGroupId });

describe('key sessions', () => {
  it('keeps the hard sessions and the long outing, not the easy ones', () => {
    const week = [
      session('2026-10-05', 'SWIM', 'ENDURANCE', 45), // 0
      session('2026-10-06', 'RUN', 'THRESHOLD', 50), // 1
      session('2026-10-07', 'STRENGTH', null, 40), // 2
      session('2026-10-08', 'BIKE', 'VO2MAX', 60), // 3
      session('2026-10-09', 'RUN', 'RECOVERY', 30), // 4
      session('2026-10-11', 'BIKE', 'ENDURANCE', 180), // 5 — the long ride
      session('2026-10-10', 'RUN', 'ENDURANCE', 70), // 6
    ];
    expect([...chooseKeySessions(week)].sort()).toEqual([1, 3, 5]);
  });

  it('picks at most three a week, every week on its own', () => {
    const twoWeeks = [
      session('2026-10-05', 'RUN', 'THRESHOLD', 50),
      session('2026-10-06', 'BIKE', 'VO2MAX', 60),
      session('2026-10-07', 'SWIM', 'TEMPO', 45),
      session('2026-10-08', 'RUN', 'TEMPO', 40),
      session('2026-10-12', 'RUN', 'THRESHOLD', 50), // next Monday
    ];
    expect([...chooseKeySessions(twoWeeks)].sort()).toEqual([0, 1, 2, 4]);
  });

  it('a race always counts, and a brick takes one place with both its legs', () => {
    const week = [
      session('2026-10-05', 'RUN', 'THRESHOLD', 50), // 0
      session('2026-10-06', 'BIKE', 'VO2MAX', 60), // 1
      session('2026-10-10', 'BIKE', 'ENDURANCE', 90, 'b1'), // 2
      session('2026-10-10', 'RUN', 'TEMPO', 20, 'b1'), // 3
      session('2026-10-11', 'TRIATHLON', 'RACE', 300), // 4
    ];
    // The race, the brick (both legs, one place) and the VO2max session.
    expect([...chooseKeySessions(week)].sort()).toEqual([1, 2, 3, 4]);
  });

  it('marks nothing in a week of easy sessions', () => {
    expect(chooseKeySessions([session('2026-10-05', 'RUN', 'RECOVERY', 30)]).size).toBe(0);
  });

  it('counts every session as key in a week where none is marked', () => {
    expect(countsAsKey({ isKey: false }, false)).toBe(true);
    expect(countsAsKey({ isKey: false }, true)).toBe(false);
    expect(countsAsKey({ isKey: true }, true)).toBe(true);
  });
});
