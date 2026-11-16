import { describe, expect, it } from 'vitest';
import { loadChange } from './carnet-bilan';

describe('loadChange', () => {
  it('signs a rise and a fall against the week before', () => {
    expect(loadChange({ totalLoad: 413, prevTotalLoad: 350 })).toBe('+18 % sur la semaine d’avant');
    expect(loadChange({ totalLoad: 280, prevTotalLoad: 350 })).toBe('-20 % sur la semaine d’avant');
  });

  it('says nothing without a week before', () => {
    expect(loadChange({ totalLoad: 400, prevTotalLoad: 0 })).toBeNull();
  });
});
