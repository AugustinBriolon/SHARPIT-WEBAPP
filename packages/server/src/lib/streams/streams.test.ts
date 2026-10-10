import { describe, expect, it } from 'vitest';
import {
  compactRawStreamsForStorage,
  isThinStream,
  normalizeMultisportLegRawStreams,
  shouldAskProviderForFullerStream,
} from '@sharpit/server/lib/streams/streams';

describe('compactRawStreamsForStorage', () => {
  it('réduit une série haute fréquence à 1 Hz', () => {
    const raw = {
      time: [0, 0.5, 1, 1.5, 2],
      distance: [0, 5, 10, 15, 20],
      altitude: [100, 100, 101, 101, 102],
      heartrate: [120, 122, 124, 126, 128],
      watts: [0, 0, 200, 210, 220],
      cadence: [0, 80, 82, 84, 86],
      velocity: [0, 2.5, 2.6, 2.7, 2.8],
      latlng: [
        [48.0, 2.0],
        [48.01, 2.01],
      ] as [number, number][],
    };

    const compact = compactRawStreamsForStorage(raw);

    expect(compact.time).toEqual([0, 1, 2]);
    expect(compact.distance).toEqual([0, 10, 20]);
    expect(compact.heartrate).toEqual([120, 124, 128]);
  });

  it('tronque au-delà de 8 h et échantillonne latlng', () => {
    const n = 30_000;
    const raw = {
      time: Array.from({ length: n }, (_, i) => i),
      distance: Array.from({ length: n }, (_, i) => i),
      altitude: [],
      heartrate: [],
      watts: [],
      cadence: [],
      velocity: [],
      latlng: Array.from(
        { length: 5_000 },
        (_, i) => [48 + i * 0.0001, 2 + i * 0.0001] as [number, number],
      ),
    };

    const compact = compactRawStreamsForStorage(raw);

    expect(compact.time.length).toBe(28_801);
    expect(compact.latlng.length).toBeLessThanOrEqual(801);
  });
});

describe('normalizeMultisportLegRawStreams', () => {
  it('rebases cumulative leg distance to zero for multisport splits', () => {
    const raw = {
      time: [0, 60, 120],
      distance: [10_100, 10_600, 11_100],
      altitude: [5, 5, 5],
      heartrate: [150, 152, 154],
      watts: [],
      cadence: [86, 87, 88],
      velocity: [2.8, 2.8, 2.8],
      latlng: [] as [number, number][],
    };

    const normalized = normalizeMultisportLegRawStreams(raw);

    expect(normalized.distance).toEqual([0, 500, 1000]);
  });

  it('keeps already rebased leg distance unchanged', () => {
    const raw = {
      time: [0, 60, 120],
      distance: [0, 500, 1000],
      altitude: [5, 5, 5],
      heartrate: [150, 152, 154],
      watts: [],
      cadence: [86, 87, 88],
      velocity: [2.8, 2.8, 2.8],
      latlng: [] as [number, number][],
    };

    const normalized = normalizeMultisportLegRawStreams(raw);

    expect(normalized.distance).toEqual([0, 500, 1000]);
  });
});

describe('shouldAskProviderForFullerStream', () => {
  const heartRateOnly = {
    time: [0, 1, 2],
    heartrate: [120, 121, 122],
    distance: [],
    altitude: [],
    watts: [],
    cadence: [],
    velocity: [],
    latlng: [],
  };
  const garmin = { garminId: '24671569284', stravaId: null };
  const now = Date.UTC(2026, 9, 10, 12);

  it('asks Garmin again for an Apple Health copy that carries heart rate alone', () => {
    expect(isThinStream(heartRateOnly)).toBe(true);
    expect(shouldAskProviderForFullerStream(heartRateOnly, garmin, now)).toBe(true);
  });

  it('keeps a stream that has a route or a distance', () => {
    const run = { ...heartRateOnly, distance: [0, 3, 6] };
    expect(isThinStream(run)).toBe(false);
    expect(shouldAskProviderForFullerStream(run, garmin, now)).toBe(false);
  });

  it('never asks for a session no provider holds', () => {
    expect(
      shouldAskProviderForFullerStream(heartRateOnly, { garminId: null, stravaId: null }, now),
    ).toBe(false);
  });

  it('waits six hours after a provider had nothing better', () => {
    const checked = { ...heartRateOnly, providerCheckedAt: now - 60 * 60 * 1000 };
    expect(shouldAskProviderForFullerStream(checked, garmin, now)).toBe(false);
    const stale = { ...heartRateOnly, providerCheckedAt: now - 7 * 60 * 60 * 1000 };
    expect(shouldAskProviderForFullerStream(stale, garmin, now)).toBe(true);
  });
});
