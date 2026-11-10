import { describe, expect, it } from 'vitest';
import { formatRaceFeasibilityForCoach, raceGoalFeasibility } from './goal-feasibility';

const projection = (targetSec: number | null) => ({
  finishSec: 4 * 3600,
  lowSec: 3.75 * 3600,
  highSec: 4.25 * 3600,
  targetSec,
  confidence: 'low' as const,
});

describe('raceGoalFeasibility', () => {
  it('has nothing to say of a race without a target time', () => {
    expect(raceGoalFeasibility(projection(null))).toBeNull();
    expect(formatRaceFeasibilityForCoach(projection(null))).toEqual([]);
  });

  it('reads a target at or behind the projected finish as within reach', () => {
    expect(raceGoalFeasibility(projection(4 * 3600))).toBe('within_reach');
    expect(raceGoalFeasibility(projection(4.5 * 3600))).toBe('within_reach');
  });

  it('reads a target inside the optimistic range as a stretch', () => {
    expect(raceGoalFeasibility(projection(3.8 * 3600))).toBe('stretch');
  });

  it('reads a target faster than the whole range as out of reach, and tells the coach', () => {
    expect(raceGoalFeasibility(projection(3.5 * 3600))).toBe('out_of_reach');
    const [figures, instruction] = formatRaceFeasibilityForCoach(projection(3.5 * 3600));
    expect(figures).toContain('4h00');
    expect(figures).toContain('cible 3h30');
    expect(instruction).toContain('hors de portée');
  });
});
