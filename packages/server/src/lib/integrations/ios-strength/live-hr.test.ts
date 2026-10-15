import { describe, expect, it } from 'vitest';
import {
  hrCoverageSec,
  liveHrSamplesToRawStreams,
  maxLiveHrSamples,
  preferHrStream,
  validateLiveHrSamples,
  LIVE_HR_ABSOLUTE_MAX_SAMPLES,
} from './live-hr';

function samplesEvery5s(durationSec: number, bpm = 120, source: 'watch' | 'ble' = 'watch') {
  const out: { t: number; bpm: number; source: 'watch' | 'ble' }[] = [];
  for (let t = 0; t <= durationSec; t += 5) {
    out.push({ t, bpm, source });
  }
  return out;
}

describe('maxLiveHrSamples', () => {
  it('caps at duration/5 + margin and never above the absolute max', () => {
    expect(maxLiveHrSamples(300)).toBe(Math.floor(300 / 5) + 24);
    expect(maxLiveHrSamples(14_400)).toBe(Math.floor(14_400 / 5) + 24);
    expect(maxLiveHrSamples(20_000)).toBe(LIVE_HR_ABSOLUTE_MAX_SAMPLES);
  });
});

describe('validateLiveHrSamples', () => {
  it('accepts a dense watch series and recomputes avg/max', () => {
    const hrSamples = samplesEvery5s(60, 140, 'watch');
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 140,
      maxHr: 140,
      hrSamples,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.avgHr).toBe(140);
    expect(result.maxHr).toBe(140);
    expect(result.source).toBe('watch');
    expect(result.sampleCount).toBe(hrSamples.length);
  });

  it('rejects bpm outside 25..250', () => {
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 140,
      maxHr: 140,
      hrSamples: [{ t: 0, bpm: 20, source: 'watch' }],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_BPM' });
  });

  it('rejects t beyond durationSec', () => {
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 140,
      maxHr: 140,
      hrSamples: [{ t: 61, bpm: 140, source: 'watch' }],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_SAMPLE_TIME' });
  });

  it('rejects an unknown source', () => {
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 140,
      maxHr: 140,
      hrSamples: [{ t: 0, bpm: 140, source: 'chest' }],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_SAMPLE_SOURCE' });
  });

  it('rejects too many samples', () => {
    const durationSec = 60;
    const cap = maxLiveHrSamples(durationSec);
    const hrSamples = Array.from({ length: cap + 1 }, (_, i) => ({
      t: Math.min(i, durationSec),
      bpm: 120,
      source: 'watch' as const,
    }));
    const result = validateLiveHrSamples({
      durationSec,
      avgHr: 120,
      maxHr: 120,
      hrSamples,
    });
    expect(result).toEqual({ ok: false, code: 'TOO_MANY_SAMPLES' });
  });

  it('rejects empty samples', () => {
    expect(
      validateLiveHrSamples({ durationSec: 60, avgHr: 120, maxHr: 120, hrSamples: [] }),
    ).toEqual({ ok: false, code: 'EMPTY_HR_SAMPLES' });
  });

  it('rejects client avg that disagrees with recomputed', () => {
    const hrSamples = samplesEvery5s(60, 140);
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 100,
      maxHr: 140,
      hrSamples,
    });
    expect(result).toEqual({ ok: false, code: 'AVG_HR_INCONSISTENT' });
  });

  it('rejects client max that disagrees with recomputed', () => {
    const hrSamples = [
      { t: 0, bpm: 120, source: 'ble' as const },
      { t: 5, bpm: 180, source: 'ble' as const },
    ];
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 150,
      maxHr: 160,
      hrSamples,
    });
    expect(result).toEqual({ ok: false, code: 'MAX_HR_INCONSISTENT' });
  });

  it('picks ble when it is the majority source', () => {
    const hrSamples = [
      { t: 0, bpm: 130, source: 'ble' as const },
      { t: 5, bpm: 132, source: 'ble' as const },
      { t: 10, bpm: 131, source: 'watch' as const },
    ];
    const result = validateLiveHrSamples({
      durationSec: 60,
      avgHr: 131,
      maxHr: 132,
      hrSamples,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('ble');
    }
  });
});

describe('liveHrSamplesToRawStreams', () => {
  it('leaves gaps as 0 so charts can break the line', () => {
    const raw = liveHrSamplesToRawStreams(
      [
        { t: 0, bpm: 120, source: 'watch' },
        { t: 5, bpm: 122, source: 'watch' },
        // gap 10..25
        { t: 30, bpm: 125, source: 'watch' },
      ],
      30,
    );
    expect(raw.heartrate[0]).toBe(120);
    expect(raw.heartrate[1]).toBe(122);
    expect(raw.heartrate[2]).toBe(0);
    expect(raw.heartrate[3]).toBe(0);
    expect(raw.heartrate[4]).toBe(0);
    expect(raw.heartrate[5]).toBe(0);
    expect(raw.heartrate[6]).toBe(125);
  });
});

describe('preferHrStream / hrCoverageSec', () => {
  it('prefers the series with more coverage', () => {
    const sparse = liveHrSamplesToRawStreams(
      [
        { t: 0, bpm: 120, source: 'watch' },
        { t: 60, bpm: 122, source: 'watch' },
      ],
      60,
    );
    const dense = liveHrSamplesToRawStreams(samplesEvery5s(60, 118, 'ble'), 60);
    expect(hrCoverageSec(dense)).toBeGreaterThan(hrCoverageSec(sparse));
    expect(preferHrStream(sparse, dense)).toBe('b');
    expect(preferHrStream(dense, sparse)).toBe('a');
  });
});
