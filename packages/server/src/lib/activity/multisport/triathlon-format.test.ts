import { describe, expect, it } from 'vitest';
import {
  nearestTriathlonFormat,
  triathlonTitle,
} from '@sharpit/server/lib/activity/multisport/triathlon-format';

describe('nearestTriathlonFormat', () => {
  it.each([
    [{ swim: 400, bike: 10_500, run: 2400 }, 'XS'],
    [{ swim: 780, bike: 21_000, run: 5100 }, 'S'],
    [{ swim: 1500, bike: 39_000, run: 10_200 }, 'M'],
    [{ swim: 1900, bike: 88_000, run: 21_000 }, 'L'],
    [{ swim: 3900, bike: 180_000, run: 42_195 }, 'XL'],
  ] as const)('classifies %o as %s', (distances, format) => {
    expect(nearestTriathlonFormat(distances)).toBe(format);
  });

  it('works without the swim distance', () => {
    expect(nearestTriathlonFormat({ swim: null, bike: 40_000, run: 10_000 })).toBe('M');
  });

  it('returns null with a single leg or far from every format', () => {
    expect(nearestTriathlonFormat({ swim: null, bike: 40_000, run: null })).toBeNull();
    expect(nearestTriathlonFormat({ swim: 100, bike: 400_000, run: 500 })).toBeNull();
  });
});

describe('triathlonTitle', () => {
  it('suffixes the format, else stays plain', () => {
    expect(triathlonTitle({ swim: 1500, bike: 40_000, run: 10_000 })).toBe('Triathlon M');
    expect(triathlonTitle({ swim: null, bike: null, run: null })).toBe('Triathlon');
  });
});
