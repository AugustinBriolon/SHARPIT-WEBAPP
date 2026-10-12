/**
 * Daily target strain band (ADR-079), SharpIt 0–21 strain scale.
 * Midpoint from recent strain baseline; readiness shifts the window up/down.
 */

import { isSet } from '@sharpit/shared/value';

export const TARGET_STRAIN_ALGORITHM_VERSION = 'target-strain-v1';

const STRAIN_MAX = 21;
const BAND_HALF_WIDTH = 2.5;
const MIN_BAND = 1.5;

export type TargetStrainStatus = 'below' | 'within' | 'above';

export type TargetStrainBand = {
  algorithmVersion: typeof TARGET_STRAIN_ALGORITHM_VERSION;
  low: number;
  high: number;
  status: TargetStrainStatus | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Build a low–high target band and classify today’s strain against it.
 */
export function computeTargetStrainBand(input: {
  readinessScore: number | null;
  recentStrainScores: Array<number | null>;
  todayStrainScore: number | null;
}): TargetStrainBand | null {
  const recent = input.recentStrainScores.filter((v): v is number => isSet(v) && v >= 0);
  const baseline = mean(recent);
  if (!isSet(baseline) && !isSet(input.readinessScore)) {
    return null;
  }

  let mid = isSet(baseline) ? baseline : 8;
  if (isSet(input.readinessScore)) {
    // High readiness → allow more strain; low → protect.
    mid += ((input.readinessScore - 60) / 100) * 6;
  }
  mid = clamp(mid, MIN_BAND, STRAIN_MAX - MIN_BAND);

  const low = Math.round(clamp(mid - BAND_HALF_WIDTH, 0, STRAIN_MAX) * 10) / 10;
  const high = Math.round(clamp(mid + BAND_HALF_WIDTH, low + MIN_BAND, STRAIN_MAX) * 10) / 10;

  let status: TargetStrainStatus | null = null;
  if (isSet(input.todayStrainScore)) {
    if (input.todayStrainScore < low) {
      status = 'below';
    } else if (input.todayStrainScore > high) {
      status = 'above';
    } else {
      status = 'within';
    }
  }

  return {
    algorithmVersion: TARGET_STRAIN_ALGORITHM_VERSION,
    low,
    high,
    status,
  };
}
