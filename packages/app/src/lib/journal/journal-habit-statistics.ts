/**
 * The statistics behind journal habit associations (ADR-098): a rank test per contrast, a
 * false-discovery correction across contrasts, and a load adjustment. Pure and dependency-free.
 */

/** Ranks from 1, ties sharing their average rank. */
function averageRanks(values: readonly number[]): { ranks: number[]; tieCorrection: number } {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let tieCorrection = 0;
  for (let start = 0; start < order.length;) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.value === order[start]!.value) {
      end += 1;
    }
    const tied = end - start + 1;
    tieCorrection += tied ** 3 - tied;
    for (let k = start; k <= end; k += 1) {
      ranks[order[k]!.index] = (start + end) / 2 + 1;
    }
    start = end + 1;
  }
  return { ranks, tieCorrection };
}

/** Abramowitz–Stegun 7.1.26, |error| < 1.5e-7. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - poly * Math.exp(-x * x));
}

/**
 * Two-sided Mann–Whitney U p-value, normal approximation with tie and continuity corrections.
 * Ranks, not values: one extreme night cannot make a habit look decisive.
 */
export function mannWhitneyPValue(a: readonly number[], b: readonly number[]): number {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) {
    return 1;
  }
  const total = n1 + n2;
  const { ranks, tieCorrection } = averageRanks([...a, ...b]);
  const rankSumA = ranks.slice(0, n1).reduce((sum, rank) => sum + rank, 0);
  const u = rankSumA - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * n2) / 2;
  const variance = ((n1 * n2) / 12) * (total + 1 - tieCorrection / (total * (total - 1)));
  if (variance <= 0) {
    return 1;
  }
  const z = Math.max(0, Math.abs(u - mean) - 0.5) / Math.sqrt(variance);
  return Math.min(1, 1 - erf(z / Math.SQRT2));
}

/** Benjamini–Hochberg adjusted p-values (q-values), in the input order. */
export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const count = pValues.length;
  const order = pValues.map((p, index) => ({ p, index })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(count);
  let running = 1;
  for (let rank = count; rank >= 1; rank -= 1) {
    const { p, index } = order[rank - 1]!;
    running = Math.min(running, (p * count) / rank);
    adjusted[index] = running;
  }
  return adjusted;
}

/** Below this many measured days a load slope is noise. */
export const MIN_DAYS_FOR_LOAD_FIT = 10;

/**
 * Least-squares slope of the outcome on the load, as a function that brings a value back to
 * the athlete's average load. Null when the days are too few or the load never varies.
 */
export function loadAdjuster(
  points: ReadonlyArray<{ load: number; value: number }>,
): ((value: number, load: number) => number) | null {
  if (points.length < MIN_DAYS_FOR_LOAD_FIT) {
    return null;
  }
  const meanLoad = points.reduce((sum, point) => sum + point.load, 0) / points.length;
  const meanValue = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const { load, value } of points) {
    covariance += (load - meanLoad) * (value - meanValue);
    variance += (load - meanLoad) ** 2;
  }
  if (variance === 0) {
    return null;
  }
  const slope = covariance / variance;
  return (value, load) => value - slope * (load - meanLoad);
}

/** Below this many mornings on either side a weekend gap is noise. */
export const MIN_DAYS_FOR_WEEKEND_FIT = 4;

/**
 * Brings a weekend morning back to the athlete's weekday level, as a function. Nights are
 * longer before a day off and weekend habits come with them: left in, a Saturday-evening
 * habit takes the credit for Sunday's lie-in. Null when either side has too few mornings.
 */
export function weekendAdjuster(
  points: ReadonlyArray<{ weekend: boolean; value: number }>,
): ((value: number, weekend: boolean) => number) | null {
  const weekend = points.filter((point) => point.weekend).map((point) => point.value);
  const weekday = points.filter((point) => !point.weekend).map((point) => point.value);
  if (weekend.length < MIN_DAYS_FOR_WEEKEND_FIT || weekday.length < MIN_DAYS_FOR_WEEKEND_FIT) {
    return null;
  }
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const gap = mean(weekend) - mean(weekday);
  return (value, isWeekend) => (isWeekend ? value - gap : value);
}

/** Calendar days on each side of a morning that make its own baseline. */
export const BASELINE_HALF_WINDOW_DAYS = 10;

/** Below this many neighbouring mornings the baseline is the whole journal's. */
export const MIN_DAYS_FOR_BASELINE = 6;

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Reads each morning against its own neighbourhood: the median of the mornings around it
 * (ten days each side, itself left out), brought back to the journal's overall level. A block
 * of fitness, a new watch or a season moves every morning in it together; without this, a
 * habit started at the same time takes the whole shift. A morning with too few neighbours is
 * read against the whole journal. Null when there is nothing to read.
 */
export function baselineAdjuster(
  points: ReadonlyArray<{ dayIndex: number; value: number }>,
): ((value: number, dayIndex: number) => number) | null {
  if (points.length < MIN_DAYS_FOR_BASELINE) {
    return null;
  }
  const sorted = [...points].sort((a, b) => a.dayIndex - b.dayIndex);
  const overall = medianOf(sorted.map((point) => point.value));
  return (value, dayIndex) => {
    const around = sorted.filter(
      (point) =>
        point.dayIndex !== dayIndex &&
        Math.abs(point.dayIndex - dayIndex) <= BASELINE_HALF_WINDOW_DAYS,
    );
    if (around.length < MIN_DAYS_FOR_BASELINE) {
      return value;
    }
    return value - medianOf(around.map((point) => point.value)) + overall;
  };
}
