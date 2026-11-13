import { describe, expect, it } from 'vitest';
import { BLOOD_MARKER_CATALOG, bloodMarker, bloodMarkerStatus } from './catalog';

describe('blood marker catalog', () => {
  it('gives every marker a unique key, a unique LOINC code and an ordered plausible range', () => {
    const keys = BLOOD_MARKER_CATALOG.map((entry) => entry.key);
    const loincs = BLOOD_MARKER_CATALOG.map((entry) => entry.loinc);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(loincs).size).toBe(loincs.length);
    for (const entry of BLOOD_MARKER_CATALOG) {
      expect(entry.loinc).toMatch(/^\d+-\d$/);
      expect(entry.plausible[0]).toBeLessThan(entry.plausible[1]);
    }
  });

  it('finds a marker by key and nothing for an unknown one', () => {
    expect(bloodMarker('ferritin')?.unit).toBe('µg/L');
    expect(bloodMarker('vitamin_z')).toBeUndefined();
  });
});

describe('bloodMarkerStatus', () => {
  it('reads the value against the lab bounds, bounds included', () => {
    expect(bloodMarkerStatus({ value: 3.6, refLow: 4.1, refHigh: 10.8 })).toBe('low');
    expect(bloodMarkerStatus({ value: 4.1, refLow: 4.1, refHigh: 10.8 })).toBe('in_range');
    expect(bloodMarkerStatus({ value: 11, refLow: 4.1, refHigh: 10.8 })).toBe('high');
  });

  it('handles a one-sided bound and a result printed without any', () => {
    expect(bloodMarkerStatus({ value: 2.2, refLow: null, refHigh: 1.9 })).toBe('high');
    expect(bloodMarkerStatus({ value: 1.2, refLow: null, refHigh: 1.9 })).toBe('in_range');
    expect(bloodMarkerStatus({ value: 1.6, refLow: null, refHigh: null })).toBe('no_reference');
  });
});
