import { describe, expect, it } from 'vitest';
import { raceDemandsFor } from './race-demands';

describe('raceDemandsFor', () => {
  it('knows what a full-distance triathlon asks', () => {
    expect(raceDemandsFor('Triathlon XXL')).toEqual({
      peakWeeklyHours: 13,
      longRideHours: 5,
      longRunHours: 2.5,
    });
    expect(raceDemandsFor('triathlon xxl · 3800 m D+')).not.toBeNull();
    expect(raceDemandsFor('Ironman')).not.toBeNull();
  });

  it('answers nothing for a format it has no sourced figure for', () => {
    for (const format of [
      'Triathlon XL',
      'Triathlon L',
      'Ironman 70.3',
      'Marathon',
      'Trail · 42 km',
      '',
      null,
    ]) {
      expect(raceDemandsFor(format)).toBeNull();
    }
  });
});
