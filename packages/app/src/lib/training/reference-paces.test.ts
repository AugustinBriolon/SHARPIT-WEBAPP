import { describe, expect, it } from 'vitest';
import { deriveZone2PaceSecPerKm, resolveZone2PaceSecPerKm } from './reference-paces';

describe('reference paces', () => {
  it('derives Z2 ~15% slower than threshold', () => {
    expect(deriveZone2PaceSecPerKm(300)).toBe(345);
    expect(deriveZone2PaceSecPerKm(null)).toBeNull();
  });

  it('prefers a declared easy pace', () => {
    expect(resolveZone2PaceSecPerKm({ easyPaceSecPerKm: 330, thresholdPaceSecPerKm: 300 })).toEqual(
      { paceSecPerKm: 330, source: 'declared' },
    );
    expect(resolveZone2PaceSecPerKm({ thresholdPaceSecPerKm: 300 })).toEqual({
      paceSecPerKm: 345,
      source: 'derived',
    });
  });
});
