import { describe, expect, it } from 'vitest';
import type { StreamSample } from '@sharpit/app/lib/streams/stream-types';
import { streamProfile } from './carnet-stream';

function sample(t: number, d: number): StreamSample {
  return { t, d, alt: 100.4, hr: 140, watts: null, cadence: null, speed: null };
}

describe('streamProfile', () => {
  it('thins the recording evenly and reads it by the kilometre', () => {
    const samples = Array.from({ length: 1000 }, (_, i) => sample(i * 5, i * 10));
    const points = streamProfile(samples, 100);
    expect(points).toHaveLength(100);
    expect(points[1]).toEqual({ label: '0.1 km', hr: 140, alt: 100, watts: null });
  });

  it('reads by the minute when the session covered no distance', () => {
    const points = streamProfile([sample(0, 0), sample(600, 0)]);
    expect(points.map((p) => p.label)).toEqual(['0 min', '10 min']);
  });

  it('has nothing to draw without samples', () => {
    expect(streamProfile([])).toEqual([]);
  });
});
