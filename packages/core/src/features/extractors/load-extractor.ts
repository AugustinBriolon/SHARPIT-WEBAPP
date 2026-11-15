/**
 * LOAD FEATURE EXTRACTOR
 *
 * Pure function: (LoadHistory, trainingDayId) → LoadFeatureSet
 *
 * Computes rolling-window load features from a 42-day history of session TSS values.
 *
 * Key architectural distinction (INFERENCE_ARCHITECTURE_REVIEW.md §4.6):
 *   - acuteLoad (7-day rolling SUM) ≠ ATL (EWMA τ=7 — computed by Training Stress Model)
 *   - chronicLoad (42-day rolling SUM ÷ 6) ≠ CTL (EWMA τ=42 — computed by Training Stress Model)
 *
 * The Feature Layer produces simple, model-independent rolling sums.
 * The Training Stress Model produces scientifically-tuned EWMA values and stores them
 * in the Digital Twin's FitnessState.
 *
 * Scientific references:
 *   - ACWR: Gabbett (2016); Hulin et al. (2016) — British Journal of Sports Medicine
 *   - Load Monotony/Strain: Foster et al. (1996) — Medicine & Science in Sports & Exercise
 */

import type { LoadFeatureSet, LoadHistory } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Rolling window helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD training day ID into a comparable number (days since epoch).
 * Avoids Date constructor timezone issues by parsing the string directly.
 */
function dayIdToEpochDays(trainingDayId: string): number {
  const [year, month, day] = trainingDayId.split('-').map(Number);
  // Zeller's congruence adapted — good enough for comparison arithmetic
  const d = new Date(Date.UTC(year, month - 1, day));
  return Math.floor(d.getTime() / 86_400_000);
}

/** Returns true when a training day is within `windowDays` days before `anchorDayId`. */
function isWithinWindow(trainingDayId: string, anchorDayId: string, windowDays: number): boolean {
  const anchorEpoch = dayIdToEpochDays(anchorDayId);
  const dayEpoch = dayIdToEpochDays(trainingDayId);
  const diff = anchorEpoch - dayEpoch;
  return diff >= 0 && diff < windowDays;
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistical helpers
// ─────────────────────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const avg = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Linear regression slope over a series of (x, y) pairs.
 * Returns the slope dy/dx (here: TSS/day trend).
 */
function linearRegressionSlope(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 3) {
    return null;
  }

  const sumX = pairs.reduce((a, [x]) => a + x, 0);
  const sumY = pairs.reduce((a, [, y]) => a + y, 0);
  const sumXY = pairs.reduce((a, [x, y]) => a + x * y, 0);
  const sumX2 = pairs.reduce((a, [x]) => a + x * x, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return null;
  }

  return (n * sumXY - sumX * sumY) / denominator;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACWR trend
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the ACWR 14-day trend (Δ ACWR per day via linear regression).
 * Requires at least 3 ACWR data points in the 14-day window.
 */
function computeAcwrTrend(
  daily42d: LoadHistory['dailyLoad42d'],
  anchorDayId: string,
): number | null {
  const anchorEpoch = dayIdToEpochDays(anchorDayId);

  const acwrByDay: Array<[number, number]> = [];
  const earliestEpoch = Math.min(...daily42d.map((e) => dayIdToEpochDays(e.trainingDayId)));

  for (const entry of daily42d) {
    const entryEpoch = dayIdToEpochDays(entry.trainingDayId);
    const daysAgo = anchorEpoch - entryEpoch;
    if (daysAgo < 0 || daysAgo >= 14) {
      continue;
    }
    // A day whose own 42 days are not all in the history would get a chronic load
    // cut short, so a ratio biased high and a trend biased downward.
    if (entryEpoch - earliestEpoch < 41) {
      continue;
    }

    // Compute a "local" ACWR for this day (using data available at that point)
    const acute7dFromEntry = daily42d
      .filter((e) => {
        const diff = entryEpoch - dayIdToEpochDays(e.trainingDayId);
        return diff >= 0 && diff < 7;
      })
      .reduce((acc, e) => acc + e.tssScore, 0);

    const chronic42dFromEntry = daily42d
      .filter((e) => {
        const diff = entryEpoch - dayIdToEpochDays(e.trainingDayId);
        return diff >= 0 && diff < 42;
      })
      .reduce((acc, e) => acc + e.tssScore, 0);

    const chronicWeekly = chronic42dFromEntry / 6;
    if (chronicWeekly <= 0) {
      continue;
    }

    const acwr = acute7dFromEntry / chronicWeekly;
    acwrByDay.push([entryEpoch, acwr]);
  }

  return linearRegressionSlope(acwrByDay);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract all Load Features from a 42-day history of daily TSS values.
 *
 * The `dailyLoad42d` array must include ALL days (including zero-TSS rest days)
 * for the 42-day window ending on (and including) trainingDayId.
 *
 * Pure function — no side effects, no async, fully deterministic.
 */
function sumSportTss(entries: LoadHistory['dailyLoad42d'], sport: 'run' | 'bike'): number {
  return entries.reduce((acc, e) => acc + e.sportBreakdown[sport], 0);
}

function chronicSportLoad(total: number): number | null {
  return total > 0 ? total / 6 : null;
}

function computeLoadConfidence(last7dCount: number, last42dCount: number): number {
  let confidence = 0.85;
  if (last7dCount < 3) {
    confidence *= 0.5;
  }
  if (last42dCount < 14) {
    confidence *= 0.75;
  }
  return confidence;
}

function computeLoadStrain(acuteLoad: number, dailyTssValues7d: number[]): number | null {
  const avgDailyLoad = mean(dailyTssValues7d);
  const sdDailyLoad = stdDev(dailyTssValues7d);
  const loadMonotony = sdDailyLoad > 0 ? avgDailyLoad / sdDailyLoad : null;
  return loadMonotony !== null ? acuteLoad * loadMonotony : null;
}

export function extractLoadFeatures(history: LoadHistory, trainingDayId: string): LoadFeatureSet {
  const { dailyLoad42d } = history;
  const last7d = dailyLoad42d.filter((e) => isWithinWindow(e.trainingDayId, trainingDayId, 7));
  const last42d = dailyLoad42d.filter((e) => isWithinWindow(e.trainingDayId, trainingDayId, 42));

  const acuteLoad = last7d.reduce((acc, e) => acc + e.tssScore, 0);
  const chronicLoad = last42d.reduce((acc, e) => acc + e.tssScore, 0) / 6;
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : null;

  const acuteLoadRun = sumSportTss(last7d, 'run') || null;
  const acuteLoadBike = sumSportTss(last7d, 'bike') || null;
  const chronicLoadRun = chronicSportLoad(sumSportTss(last42d, 'run'));
  const chronicLoadBike = chronicSportLoad(sumSportTss(last42d, 'bike'));

  const dailyTssValues7d = last7d.map((e) => e.tssScore);
  const loadStrain = computeLoadStrain(acuteLoad, dailyTssValues7d);
  const loadMonotony = (() => {
    const sdDailyLoad = stdDev(dailyTssValues7d);
    const avgDailyLoad = mean(dailyTssValues7d);
    return sdDailyLoad > 0 ? avgDailyLoad / sdDailyLoad : null;
  })();

  const trainingFrequency = last7d.filter((e) => e.tssScore > 0).length;
  const restDayCount = Math.max(0, 7 - trainingFrequency);
  const acuteChronicLoadTrend = computeAcwrTrend(dailyLoad42d, trainingDayId);
  const confidence = computeLoadConfidence(last7d.length, last42d.length);

  return {
    trainingDayId,

    acuteLoad,
    chronicLoad,
    acwr,
    weeklyLoad: acuteLoad,

    loadMonotony,
    loadStrain,

    trainingFrequency,
    restDayCount,

    acuteChronicLoadTrend,

    acuteLoadRun: acuteLoadRun ?? null,
    acuteLoadBike: acuteLoadBike ?? null,
    chronicLoadRun,
    chronicLoadBike,

    confidence,
    algorithmId: 'load-features-v1',
    sourceObsIds: [], // populated by FeatureEngine from session observation IDs
  } satisfies LoadFeatureSet;
}
