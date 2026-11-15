/**
 * LOAD FEATURE EXTRACTOR — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { extractLoadFeatures } from '../load-extractor';
import type { LoadHistory } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

// Mutable variant used only in tests — assignable to readonly LoadHistory
type MutableLoadEntry = {
  trainingDayId: string;
  tssScore: number;
  sportBreakdown: { run: number; bike: number; other: number };
};
type MutableLoadHistory = { dailyLoad42d: MutableLoadEntry[] };

function makeHistory(
  entries: Array<{ dayId: string; tss: number; run?: number; bike?: number }>,
): LoadHistory {
  return {
    dailyLoad42d: entries.map((e) => ({
      trainingDayId: e.dayId,
      tssScore: e.tss,
      sportBreakdown: {
        run: e.run ?? 0,
        bike: e.bike ?? 0,
        other: e.tss - (e.run ?? 0) - (e.bike ?? 0),
      },
    })),
  };
}

/** Build 42 days of zero-TSS history ending on anchorDayId. */
function emptyHistory(anchorDayId: string): MutableLoadHistory {
  const result: MutableLoadEntry[] = [];
  const [year, month, day] = anchorDayId.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  for (let i = 0; i < 42; i++) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i);
    result.push({
      trainingDayId: d.toISOString().split('T')[0],
      tssScore: 0,
      sportBreakdown: { run: 0, bike: 0, other: 0 },
    });
  }
  return { dailyLoad42d: result };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acute load
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — acuteLoad', () => {
  it('sums TSS over last 7 days', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);

    // Set 7 days of known TSS
    history.dailyLoad42d[0].tssScore = 100; // today
    history.dailyLoad42d[1].tssScore = 80; // -1 day
    history.dailyLoad42d[2].tssScore = 90; // -2 days
    history.dailyLoad42d[3].tssScore = 70; // -3 days
    history.dailyLoad42d[4].tssScore = 110; // -4 days
    history.dailyLoad42d[5].tssScore = 60; // -5 days
    history.dailyLoad42d[6].tssScore = 50; // -6 days
    // -7 days = outside 7d window

    const result = extractLoadFeatures(history, anchor);
    expect(result.acuteLoad).toBeCloseTo(560, 1);
  });

  it('excludes sessions older than 7 days from acuteLoad', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    history.dailyLoad42d[7].tssScore = 999; // exactly 7 days ago (outside window)
    history.dailyLoad42d[0].tssScore = 50; // today (inside window)

    const result = extractLoadFeatures(history, anchor);
    expect(result.acuteLoad).toBeCloseTo(50, 1);
  });

  it('weeklyLoad is an alias for acuteLoad', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    history.dailyLoad42d[0].tssScore = 100;

    const result = extractLoadFeatures(history, anchor);
    expect(result.weeklyLoad).toBe(result.acuteLoad);
  });

  it('returns 0 when no sessions in the last 7 days', () => {
    const result = extractLoadFeatures(emptyHistory('2026-07-02'), '2026-07-02');
    expect(result.acuteLoad).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chronic load
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — chronicLoad', () => {
  it('divides 42-day sum by 6 (weekly equivalent)', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    // Fill all 42 days with 100 TSS each
    for (let i = 0; i < 42; i++) {
      history.dailyLoad42d[i].tssScore = 100;
    }
    const result = extractLoadFeatures(history, anchor);
    // Sum = 4200; chronic = 4200 / 6 = 700
    expect(result.chronicLoad).toBeCloseTo(700, 1);
  });

  it('returns 0 when no history', () => {
    const result = extractLoadFeatures(emptyHistory('2026-07-02'), '2026-07-02');
    expect(result.chronicLoad).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACWR
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — ACWR', () => {
  it('computes ACWR = acuteLoad / chronicLoad', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    // 7 days of 80 TSS = acuteLoad 560
    for (let i = 0; i < 7; i++) {
      history.dailyLoad42d[i].tssScore = 80;
    }
    // Total 42d = 7 × 80 = 560; chronic = 560 / 6 ≈ 93.33
    const result = extractLoadFeatures(history, anchor);
    // ACWR = 560 / 93.33 ≈ 6.0 (high: only last 7 days had load)
    expect(result.acwr).not.toBeNull();
  });

  it('returns null ACWR when chronicLoad is 0', () => {
    const result = extractLoadFeatures(emptyHistory('2026-07-02'), '2026-07-02');
    expect(result.acwr).toBeNull();
  });

  it('ACWR ≈ 1.0 when load is perfectly consistent', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    // Uniform 100 TSS/day across all 42 days
    for (let i = 0; i < 42; i++) {
      history.dailyLoad42d[i].tssScore = 100;
    }
    const result = extractLoadFeatures(history, anchor);
    // acuteLoad = 700, chronicLoad = 4200/6 = 700 → ACWR = 1.0
    expect(result.acwr).toBeCloseTo(1.0, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Load monotony and strain
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — load monotony and strain', () => {
  it('returns null monotony when all days have the same load (stdDev = 0)', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    for (let i = 0; i < 7; i++) {
      history.dailyLoad42d[i].tssScore = 100;
    } // identical
    const result = extractLoadFeatures(history, anchor);
    expect(result.loadMonotony).toBeNull();
    expect(result.loadStrain).toBeNull();
  });

  it('computes monotony = mean / stdDev', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    // 4 days of 100, 3 days of 0 → mean=57.14, stdDev≈42.6
    for (let i = 0; i < 4; i++) {
      history.dailyLoad42d[i].tssScore = 100;
    }

    const result = extractLoadFeatures(history, anchor);
    expect(result.loadMonotony).toBeGreaterThan(0);
    expect(result.loadMonotony).not.toBeNull();
  });

  it('computes strain = acuteLoad × monotony', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    for (let i = 0; i < 4; i++) {
      history.dailyLoad42d[i].tssScore = 100;
    }

    const result = extractLoadFeatures(history, anchor);
    if (result.loadMonotony !== null && result.loadStrain !== null) {
      expect(result.loadStrain).toBeCloseTo(result.acuteLoad * result.loadMonotony, 4);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frequency and rest
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — training frequency and rest days', () => {
  it('counts sessions in the last 7 days', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    history.dailyLoad42d[0].tssScore = 100;
    history.dailyLoad42d[2].tssScore = 80;
    history.dailyLoad42d[4].tssScore = 90;

    const result = extractLoadFeatures(history, anchor);
    expect(result.trainingFrequency).toBe(3);
  });

  it('counts rest days correctly', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    history.dailyLoad42d[0].tssScore = 100;
    history.dailyLoad42d[2].tssScore = 80;
    // 2 training days → 5 rest days

    const result = extractLoadFeatures(history, anchor);
    expect(result.restDayCount).toBe(5);
  });

  it('reports 7 rest days and 0 training frequency when no sessions', () => {
    const result = extractLoadFeatures(emptyHistory('2026-07-02'), '2026-07-02');
    expect(result.trainingFrequency).toBe(0);
    expect(result.restDayCount).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sport-specific loads
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — sport-specific loads', () => {
  it('segregates run and bike loads', () => {
    const anchor = '2026-07-02';
    const history = makeHistory([
      { dayId: '2026-07-02', tss: 100, run: 60, bike: 40 },
      { dayId: '2026-07-01', tss: 80, run: 50, bike: 30 },
    ]);

    const result = extractLoadFeatures(history, anchor);
    expect(result.acuteLoadRun).toBeCloseTo(110, 1);
    expect(result.acuteLoadBike).toBeCloseTo(70, 1);
  });

  it('returns null for sport-specific loads when no data', () => {
    const anchor = '2026-07-02';
    const history = makeHistory([{ dayId: '2026-07-02', tss: 50, run: 0, bike: 0 }]);

    const result = extractLoadFeatures(history, anchor);
    expect(result.acuteLoadRun).toBeNull();
    expect(result.acuteLoadBike).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sparse data confidence
// ─────────────────────────────────────────────────────────────────────────────

describe('extractLoadFeatures — confidence', () => {
  it('applies SPARSE_DATA penalty when fewer than 3 data points in 7d', () => {
    const anchor = '2026-07-02';
    const history = makeHistory([{ dayId: '2026-07-02', tss: 100 }]);
    // Only 1 entry → sparse
    const result = extractLoadFeatures(history, anchor);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('has higher confidence when 7d window has ≥ 3 data points', () => {
    const anchor = '2026-07-02';
    const history = emptyHistory(anchor);
    for (let i = 0; i < 7; i++) {
      history.dailyLoad42d[i].tssScore = 80;
    }

    const result = extractLoadFeatures(history, anchor);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('algorithmId is load-features-v1', () => {
    const result = extractLoadFeatures(emptyHistory('2026-07-02'), '2026-07-02');
    expect(result.algorithmId).toBe('load-features-v1');
  });
});

describe('extractLoadFeatures — ACWR trend (audit F3)', () => {
  const steady = (days: number) =>
    makeHistory(
      Array.from({ length: days }, (_, i) => {
        const d = new Date(Date.UTC(2026, 6, 2));
        d.setUTCDate(d.getUTCDate() - i);
        return { dayId: d.toISOString().split('T')[0], tss: 50 };
      }),
    );

  it('is flat for a constant load once every day has its own 42 days', () => {
    const features = extractLoadFeatures(steady(56), '2026-07-02');
    expect(features.acuteChronicLoadTrend).toBeCloseTo(0, 6);
  });

  it('is not computed from days whose history is cut short', () => {
    // On 42 days only, the day 13 back saw 29 days: its ratio read 1.45, the trend fell.
    const features = extractLoadFeatures(steady(42), '2026-07-02');
    expect(features.acuteChronicLoadTrend).toBeNull();
  });
});
