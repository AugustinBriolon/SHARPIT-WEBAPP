import { describe, expect, it } from 'vitest';
import type { StreamSample } from '@sharpit/app/lib/streams/stream-types';
import { heartRateLine, powerBars, streamProfile } from './carnet-stream';

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

function effort(t: number, watts: number | null, hr: number | null): StreamSample {
  return { t, d: 0, alt: null, hr, watts, cadence: null, speed: null };
}

describe('powerBars', () => {
  it('reads a block and its recovery as two steps, each in its zone', () => {
    const samples = [
      effort(0, 200, null),
      effort(10, 200, null),
      effort(20, 100, null),
      effort(30, 100, null),
    ];
    const bars = powerBars(samples, 200, 2);
    expect(bars.map((b) => b.watts)).toEqual([200, 100]);
    expect(bars.map((b) => b.share)).toEqual([1, 0.5]);
    expect(bars.map((b) => b.zone)).toEqual([3, 0]);
  });

  it('gives no zone without an FTP and nothing without power', () => {
    expect(powerBars([effort(0, 150, null), effort(10, 150, null)], null, 1)[0]?.zone).toBeNull();
    expect(powerBars([effort(0, null, 140)], 200)).toEqual([]);
  });
});

describe('heartRateLine', () => {
  it('puts the lowest beat on the floor and the highest at the top', () => {
    const line = heartRateLine(
      [effort(0, null, 100), effort(50, null, 150), effort(100, null, 125)],
      100,
      50,
    );
    expect(line).toBe('0.0,50.0 50.0,0.0 100.0,25.0');
  });

  it('is empty without a heart-rate recording', () => {
    expect(heartRateLine([effort(0, 200, null), effort(10, 200, null)], 100, 50)).toBe('');
  });
});
