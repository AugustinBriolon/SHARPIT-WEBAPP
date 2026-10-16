import { describe, expect, it } from 'vitest';
import { buildGoalsContext } from './coach-context-assembly';

type Goals = Parameters<typeof buildGoalsContext>[0];

const race = (id: string, title: string, targetDate: string, priority: 'A' | 'B' | 'C' | null) => ({
  id,
  title,
  kind: 'RACE',
  achieved: false,
  targetDate: new Date(targetDate),
  priority,
  discipline: null,
  formatKey: null,
  location: null,
  raceFormat: null,
  targetPerformance: null,
});

describe('the coach reads race priorities as the macro plan does', () => {
  it('gives an unset step race its suggested priority', () => {
    const goals = [
      race('a', 'Ironman', '2027-06-20', 'A'),
      race('b', 'Triathlon L', '2027-05-10', null),
    ] as unknown as Goals;

    const { races, primaryRace } = buildGoalsContext(goals, new Date('2026-10-16'));

    expect(primaryRace?.title).toBe('Ironman');
    expect(races.find((r) => r.title === 'Triathlon L')?.priority).toBe('B');
  });
});
