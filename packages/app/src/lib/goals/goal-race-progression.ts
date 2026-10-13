import { adherence, type AdherenceSession } from '@sharpit/app/lib/plan/plan-adherence';

/*
 * Where the athlete is heading by race day (ADR-081): a per-leg trend, weighted by how regularly
 * they train, extrapolated to the race and capped.
 *
 *   regularity = 0.6 × plan adherence (8 weeks) + 0.4 × (1 − CV of weekly training time)
 *   trend      = least-squares slope of the leg-equivalent time over the last 12 weeks,
 *                relative to its mean (fraction per week, negative = getting faster)
 *   rate       = clamp(trend × regularity, ±1 %/week)
 *   change     = clamp(rate × weeks to race, −6 %, + min(6 %, slowdown actually observed))
 *   race-day leg = today's leg × (1 + change)
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
export const REGULARITY_WEEKS = 8;
const ADHERENCE_WEIGHT = 0.6;
/** Regularity assumed when there is nothing to measure it from. */
export const DEFAULT_REGULARITY = 0.5;
const MIN_TREND_POINTS = 3;
const MIN_TREND_SPAN_WEEKS = 3;
const MAX_WEEKLY_CHANGE = 0.01;
const MAX_TOTAL_CHANGE = 0.06;

export type RegularityInputs = {
  plannedSessions: readonly AdherenceSession[];
  /** Every training activity (any sport), dated with its duration. */
  trainingVolume: readonly { date: Date | string; durationSec: number }[];
};

export type LegTrend = {
  /** Relative change of the leg time per week: −0.005 = 0.5 % faster each week. */
  perWeek: number;
  spanWeeks: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 1 − coefficient of variation of weekly training time over 8 weeks; null with no training. */
export function volumeSteadiness(
  volume: RegularityInputs['trainingVolume'],
  asOf: Date,
): number | null {
  const weeks = new Array<number>(REGULARITY_WEEKS).fill(0);
  for (const entry of volume) {
    const age = Math.floor((asOf.getTime() - new Date(entry.date).getTime()) / WEEK_MS);
    if (age >= 0 && age < REGULARITY_WEEKS) {
      weeks[age] += Math.max(0, entry.durationSec);
    }
  }
  const mean = weeks.reduce((sum, week) => sum + week, 0) / REGULARITY_WEEKS;
  if (mean <= 0) {
    return null;
  }
  const variance = weeks.reduce((sum, week) => sum + (week - mean) ** 2, 0) / REGULARITY_WEEKS;
  return clamp(1 - Math.sqrt(variance) / mean, 0, 1);
}

/** Regularity 0..1 over the 8 weeks before `asOf`; null with neither a plan nor training. */
export function regularityScore(inputs: RegularityInputs, asOf: Date): number | null {
  const today = dayKey(asOf);
  const from = dayKey(new Date(asOf.getTime() - REGULARITY_WEEKS * WEEK_MS));
  const planRate = adherence(inputs.plannedSessions, { from, to: today }, today).rate;
  const steadiness = volumeSteadiness(inputs.trainingVolume, asOf);
  if (planRate === null || steadiness === null) {
    return planRate ?? steadiness;
  }
  return ADHERENCE_WEIGHT * planRate + (1 - ADHERENCE_WEIGHT) * steadiness;
}

/** Least-squares relative slope of leg-equivalent times; null under 3 points or 3 weeks. */
export function legTrend(points: readonly { date: Date | string; sec: number }[]): LegTrend | null {
  if (points.length < MIN_TREND_POINTS) {
    return null;
  }
  const weeks = points.map((point) => new Date(point.date).getTime() / WEEK_MS);
  const spanWeeks = Math.max(...weeks) - Math.min(...weeks);
  if (spanWeeks < MIN_TREND_SPAN_WEEKS) {
    return null;
  }
  const meanX = weeks.reduce((sum, x) => sum + x, 0) / weeks.length;
  const meanY = points.reduce((sum, point) => sum + point.sec, 0) / points.length;
  const covariance = points.reduce(
    (sum, point, i) => sum + (weeks[i] - meanX) * (point.sec - meanY),
    0,
  );
  const variance = weeks.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  return { perWeek: covariance / variance / meanY, spanWeeks };
}

/** Multiplier from today's leg time to the race-day one (1 = no change). */
export function raceDayFactor(
  trend: LegTrend | null,
  regularity: number | null,
  weeksToRace: number,
): number {
  if (!trend || weeksToRace <= 0) {
    return 1;
  }
  const rate = appliedWeeklyRate(trend, regularity);
  const observedSlowdown = Math.max(0, trend.perWeek * trend.spanWeeks);
  return (
    1 + clamp(rate * weeksToRace, -MAX_TOTAL_CHANGE, Math.min(MAX_TOTAL_CHANGE, observedSlowdown))
  );
}

/** The weekly rate actually applied (after regularity and the weekly cap), as a fraction. */
export function appliedWeeklyRate(trend: LegTrend, regularity: number | null): number {
  return clamp(
    trend.perWeek * (regularity ?? DEFAULT_REGULARITY),
    -MAX_WEEKLY_CHANGE,
    MAX_WEEKLY_CHANGE,
  );
}
