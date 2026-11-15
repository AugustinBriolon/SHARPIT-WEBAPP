/**
 * How far an FTP can be trusted. An estimate read from the athlete's best recent effort is only a
 * measure when that effort was near maximal; from a comfortable ride it is a floor, and a plan
 * written against it under-prescribes.
 */

export interface FtpEvidence {
  watts: number;
  seconds: number;
  /** ISO date of the activity the effort comes from. */
  date: string;
  /** Mean heart rate over the effort; null when the recording has none. */
  avgHr: number | null;
}

export type FtpConfidence =
  | { level: 'none' }
  | { level: 'floor' | 'verified'; evidence: FtpEvidence; bikeLthr: number | null };

/** A best effort of 10 min or more held at this share of max heart rate was close to all-out. */
export const NEAR_MAX_HR_SHARE = 0.85;

const MIN_SECONDS_FOR_LTHR = 1200;
const ONE_HOUR = 3600;
/**
 * shortcut: one flat correction from a 20–30 min effort's mean heart rate to the hour value;
 * replace with the athlete's own curve once several verified efforts exist.
 */
const SHORT_EFFORT_LTHR_FACTOR = 0.97;

/**
 * Mean of `signal` over the `window` seconds where `drive` averaged highest. Both are 1 Hz
 * grids of one recording. Zeros in `signal` are dropouts and are left out of the mean.
 */
export function meanOverBestWindow(
  drive: readonly number[],
  signal: readonly number[],
  window: number,
): number | null {
  if (window <= 0 || drive.length < window) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < window; i++) {
    sum += drive[i]!;
  }
  let best = sum;
  let bestEnd = window;
  for (let i = window; i < drive.length; i++) {
    sum += drive[i]! - drive[i - window]!;
    if (sum > best) {
      best = sum;
      bestEnd = i + 1;
    }
  }
  const samples = signal.slice(bestEnd - window, bestEnd).filter((value) => value > 0);
  return samples.length > 0
    ? Math.round(samples.reduce((total, value) => total + value, 0) / samples.length)
    : null;
}

function bikeLthrFrom(evidence: FtpEvidence): number | null {
  if (evidence.avgHr === null || evidence.seconds < MIN_SECONDS_FOR_LTHR) {
    return null;
  }
  const factor = evidence.seconds >= ONE_HOUR ? 1 : SHORT_EFFORT_LTHR_FACTOR;
  return Math.round(evidence.avgHr * factor);
}

/** Without a heart rate to read the effort by, it stays a floor: nothing shows it was maximal. */
export function assessFtpConfidence(
  evidence: FtpEvidence | null,
  maxHr: number | null,
): FtpConfidence {
  if (!evidence) {
    return { level: 'none' };
  }
  const nearMax =
    evidence.avgHr !== null && maxHr !== null && evidence.avgHr >= maxHr * NEAR_MAX_HR_SHARE;
  return nearMax
    ? { level: 'verified', evidence, bikeLthr: bikeLthrFrom(evidence) }
    : { level: 'floor', evidence, bikeLthr: null };
}
