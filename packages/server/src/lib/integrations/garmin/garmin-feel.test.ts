import { describe, expect, it } from 'vitest';
import { garminRpeToScale } from '@sharpit/server/lib/integrations/garmin/garmin-feel';

describe('garminRpeToScale', () => {
  it('maps Garmin encoded scale 10..100 to 1..10', () => {
    expect(garminRpeToScale(10)).toBe(1);
    expect(garminRpeToScale(20)).toBe(2);
    expect(garminRpeToScale(100)).toBe(10);
  });

  it('preserves already-normalized 1..9 values', () => {
    expect(garminRpeToScale(1)).toBe(1);
    expect(garminRpeToScale(7)).toBe(7);
    expect(garminRpeToScale(9)).toBe(9);
  });

  it('returns null for empty or invalid values', () => {
    expect(garminRpeToScale(null)).toBeNull();
    expect(garminRpeToScale(undefined)).toBeNull();
    expect(garminRpeToScale(0)).toBeNull();
    expect(garminRpeToScale(-10)).toBeNull();
  });
});
