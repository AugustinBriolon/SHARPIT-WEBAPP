import { median } from '@sharpit/app/lib/journal/journal-habit-analysis';

/*
 * Run capacity from training (ADR-081): most amateurs train easy, so their training pace says
 * little about what they hold on race day. Two readings, both pure:
 *  - HR curve: pace against average HR over 26 weeks, fitted robustly (Theil–Sen), read at the
 *    race's target HR (a share of LTHR set by the format). Run only: bike speed depends on
 *    terrain and wind, so it does not transfer;
 *  - decayed best: each reference counts with an age penalty instead of falling off a window.
 * Plus the smoothed weekly series the race-day trend is fitted on.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
export const CAPACITY_WINDOW_DAYS = 182;
const MIN_HR_POINTS = 5;
const MIN_CORRELATION = 0.4;
/** The fit is read at most this far above the hardest HR the athlete trained at. */
const MAX_HR_EXTRAPOLATION = 15;
/** LTHR ≈ 0.935 × max HR (0.87 × max ≈ 0.93 × LTHR for a half), when LTHR is unknown. */
const LTHR_FROM_MAX_HR = 0.935;
/** A reference loses 0.5 % per 4 weeks of age. */
const DECAY_PER_WEEK = 0.005 / 4;
const SMOOTHING_ALPHA = 0.4;

export type HrPoint = { hr: number; value: number };
export type DatedValue = { date: Date | string; sec: number };

function timeMs(date: Date | string): number {
  return new Date(date).getTime();
}

/** Inside the 26 weeks before `asOf`. */
export function inCapacityWindow(date: Date | string, asOf: Date): boolean {
  const t = timeMs(date);
  return t < asOf.getTime() && t >= asOf.getTime() - CAPACITY_WINDOW_DAYS * DAY_MS;
}

/** Target HR for a race: `factor` × LTHR, else × LTHR estimated from max HR; null without either. */
export function raceTargetHr(
  profile: { lthr: number | null; maxHr: number | null },
  factor: number,
): number | null {
  if (profile.lthr && profile.lthr > 0) {
    return factor * profile.lthr;
  }
  return profile.maxHr && profile.maxHr > 0 ? factor * profile.maxHr * LTHR_FROM_MAX_HR : null;
}

/** Theil–Sen line: median pairwise slope, median intercept. Null under 2 distinct HRs. */
export function robustLine(
  points: readonly HrPoint[],
): { slope: number; intercept: number } | null {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].hr - points[i].hr;
      if (dx !== 0) {
        slopes.push((points[j].value - points[i].value) / dx);
      }
    }
  }
  if (slopes.length === 0) {
    return null;
  }
  const slope = median(slopes);
  return { slope, intercept: median(points.map((point) => point.value - slope * point.hr)) };
}

/** Pearson correlation of pace against HR; 0 without spread. */
export function hrCorrelation(points: readonly HrPoint[]): number {
  const n = points.length;
  const meanHr = points.reduce((sum, point) => sum + point.hr, 0) / n;
  const meanValue = points.reduce((sum, point) => sum + point.value, 0) / n;
  let covariance = 0;
  let hrVariance = 0;
  let valueVariance = 0;
  for (const point of points) {
    covariance += (point.hr - meanHr) * (point.value - meanValue);
    hrVariance += (point.hr - meanHr) ** 2;
    valueVariance += (point.value - meanValue) ** 2;
  }
  return hrVariance > 0 && valueVariance > 0
    ? covariance / Math.sqrt(hrVariance * valueVariance)
    : 0;
}

/**
 * Pace the fit gives at `targetHr`; null under 5 points, when pace does not fall as HR rises,
 * or when HR explains too little of the pace (|r| < 0.4) to be extrapolated.
 */
export function paceAtHr(points: readonly HrPoint[], targetHr: number | null): number | null {
  if (targetHr === null || points.length < MIN_HR_POINTS) {
    return null;
  }
  const line = robustLine(points);
  if (!line || line.slope >= 0 || hrCorrelation(points) > -MIN_CORRELATION) {
    return null;
  }
  const hr = Math.min(
    targetHr,
    Math.max(...points.map((point) => point.hr)) + MAX_HR_EXTRAPOLATION,
  );
  return line.intercept + line.slope * hr;
}

/** Fastest reference once each is slowed by its age; null with none. */
export function decayedBest(references: readonly DatedValue[], asOf: Date): number | null {
  const decayed = references.map((reference) => {
    const ageWeeks = Math.max(0, (asOf.getTime() - timeMs(reference.date)) / WEEK_MS);
    return reference.sec * (1 + DECAY_PER_WEEK * ageWeeks);
  });
  return decayed.length > 0 ? Math.min(...decayed) : null;
}

/**
 * One point per week with data — the week's `pick` (best or median), smoothed by an EWMA in
 * time order — so one strong session neither jumps in nor drops out of the trend.
 */
export function smoothedWeekly(
  values: readonly DatedValue[],
  asOf: Date,
  pick: (weekValues: number[]) => number,
): DatedValue[] {
  const byWeek = new Map<number, number[]>();
  for (const value of values) {
    const week = Math.floor((asOf.getTime() - timeMs(value.date)) / WEEK_MS);
    byWeek.set(week, [...(byWeek.get(week) ?? []), value.sec]);
  }
  const weeks = [...byWeek.keys()].sort((a, b) => b - a);
  let smoothed: number | null = null;
  return weeks.map((week) => {
    const raw = pick(byWeek.get(week)!);
    smoothed = smoothed === null ? raw : SMOOTHING_ALPHA * raw + (1 - SMOOTHING_ALPHA) * smoothed;
    return { date: new Date(asOf.getTime() - (week + 0.5) * WEEK_MS), sec: smoothed };
  });
}
