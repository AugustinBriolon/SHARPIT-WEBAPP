import { describe, expect, it } from 'vitest';
import {
  estimateBikeSpeedMsFromPower,
  resolveTriathlonFormat,
} from '@sharpit/app/lib/training/periodization/triathlon-performance-predictor';

describe('resolveTriathlonFormat', () => {
  it('maps Half / 70.3 / Ironman / Olympic', () => {
    expect(resolveTriathlonFormat('Half Ironman', null)).toBe('half');
    expect(resolveTriathlonFormat('70.3', 'Versailles')).toBe('half');
    expect(resolveTriathlonFormat(null, 'Half IronMan Versailles')).toBe('half');
    expect(resolveTriathlonFormat('Ironman', 'Nice')).toBe('full');
    expect(resolveTriathlonFormat('Olympique', null)).toBe('olympic');
  });

  it('does not guess bare triathlon', () => {
    expect(resolveTriathlonFormat('Triathlon', null)).toBeNull();
  });
});

describe('estimateBikeSpeedMsFromPower', () => {
  it('is faster at higher watts', () => {
    const slow = estimateBikeSpeedMsFromPower(180, 75);
    const fast = estimateBikeSpeedMsFromPower(250, 75);
    expect(fast).toBeGreaterThan(slow);
  });
});
