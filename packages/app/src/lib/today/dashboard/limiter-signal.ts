/**
 * Athlete-facing limiter signal for the Today verdict chip.
 *
 * Maps the recovery primary limiting dimension (+ optional night hints) to a
 * stable machine code and a short French label — never jargon like
 * « Système autonome », never a blind default to « VFC basse ».
 */

import type { RecoveryData } from '@sharpit/app/athlete-state/today-state';
import { isSet } from '@sharpit/shared/value';

export const LIMITER_SIGNAL_CODES = [
  'hrv_low',
  'rhr_high',
  'sleep_short',
  'sleep_poor',
  'subjective_low',
  'load_elevated',
] as const;

export type LimiterSignalCode = (typeof LIMITER_SIGNAL_CODES)[number];

export type LimiterSignalHints = {
  hrv?: number | null;
  hrvBaselineLow?: number | null;
  hrvBaselineHigh?: number | null;
  hrvStatus?: string | null;
  restingHr?: number | null;
  /** Typical resting HR when known (multi-day median); optional. */
  restingHrTypical?: number | null;
  sleepMinutes?: number | null;
  sleepTargetMinutes?: number | null;
  sleepDeepMin?: number | null;
  sleepRemMin?: number | null;
};

export type LimiterSignal = {
  code: LimiterSignalCode;
  label: string;
};

const LABEL_FR: Record<LimiterSignalCode, string> = {
  hrv_low: 'VFC basse',
  rhr_high: 'FC au repos élevée',
  sleep_short: 'Sommeil court',
  sleep_poor: 'Sommeil fragmenté',
  subjective_low: 'Ressenti bas',
  load_elevated: 'Charge élevée',
};

export function limiterSignalLabel(code: LimiterSignalCode): string {
  return LABEL_FR[code];
}

/** Chip copy for native / web: « Frein · VFC basse ». */
export function limiterSignalChip(code: LimiterSignalCode): string {
  return `Frein · ${LABEL_FR[code]}`;
}

function restorativeRatioPercent(hints: LimiterSignalHints): number | null {
  const deep = hints.sleepDeepMin;
  const rem = hints.sleepRemMin;
  const total = hints.sleepMinutes;
  if (!isSet(deep) || !isSet(rem) || !isSet(total) || total <= 0) {
    return null;
  }
  return ((deep + rem) / total) * 100;
}

function isHrvSuppressed(hints: LimiterSignalHints): boolean {
  const { hrv, hrvBaselineLow, hrvStatus } = hints;
  if (typeof hrvStatus === 'string' && /UNBALANCED_LOW|LOW/i.test(hrvStatus)) {
    return true;
  }
  if (isSet(hrv) && isSet(hrvBaselineLow) && hrv < hrvBaselineLow) {
    return true;
  }
  return false;
}

function isHrvInBand(hints: LimiterSignalHints): boolean {
  const { hrv, hrvBaselineLow, hrvBaselineHigh } = hints;
  if (!isSet(hrv) || !isSet(hrvBaselineLow) || !isSet(hrvBaselineHigh)) {
    return false;
  }
  return hrv >= hrvBaselineLow && hrv <= hrvBaselineHigh;
}

function isRhrElevated(hints: LimiterSignalHints): boolean {
  const { restingHr, restingHrTypical } = hints;
  if (!isSet(restingHr) || !isSet(restingHrTypical)) {
    return false;
  }
  return restingHr >= restingHrTypical + 4;
}

/**
 * Autonomic dimension is HRV-primary in Core. Prefer VFC when HRV is clearly
 * suppressed; prefer FC repos when HRV sits in band (or is unknown) while RHR
 * is elevated. Never invent « VFC basse » for non-autonomic limiters.
 */
function resolveAutonomicSignal(hints: LimiterSignalHints): LimiterSignalCode {
  const hrvDown = isHrvSuppressed(hints);
  const rhrUp = isRhrElevated(hints);
  if (rhrUp && !hrvDown && (isHrvInBand(hints) || !isSet(hints.hrv))) {
    return 'rhr_high';
  }
  if (hrvDown) {
    return 'hrv_low';
  }
  if (rhrUp) {
    return 'rhr_high';
  }
  // Autonomic score requires HRV in Core — when this dimension is the frein,
  // the computed signal is the overnight HRV path.
  return 'hrv_low';
}

function isSleepShort(hints: LimiterSignalHints): boolean | null {
  const target = hints.sleepTargetMinutes;
  const slept = hints.sleepMinutes;
  if (!isSet(slept)) {
    return null;
  }
  if (isSet(target)) {
    return slept < target * 0.9;
  }
  return slept < 6.5 * 60;
}

function resolveSleepSignal(hints: LimiterSignalHints): LimiterSignalCode {
  const ratio = restorativeRatioPercent(hints);
  const short = isSleepShort(hints);
  const poor = isSet(ratio) ? ratio < 40 : null;

  if (short === true && poor !== true) {
    return 'sleep_short';
  }
  if (poor === true && short !== true) {
    return 'sleep_poor';
  }
  if (short === true) {
    return 'sleep_short';
  }
  if (poor === true) {
    return 'sleep_poor';
  }
  // Sleep dimension limited without night duration/quality hints → duration is
  // the usual athlete-facing signal for sleep adequacy in Core.
  return 'sleep_short';
}

export type ResolveLimiterSignalInput = {
  primaryLimitingFactor: RecoveryData['primaryLimitingFactor'] | null | undefined;
  hints?: LimiterSignalHints | null;
};

/**
 * Resolves the machine signal for the recovery frein. Returns null when there
 * is no recovery primary limiter (fatigue / adaptation freins stay out of band).
 */
export function resolveLimiterSignal(input: ResolveLimiterSignalInput): LimiterSignal | null {
  const factor = input.primaryLimitingFactor;
  if (!factor) {
    return null;
  }
  const hints = input.hints ?? {};
  let code: LimiterSignalCode;
  switch (factor) {
    case 'autonomic':
      code = resolveAutonomicSignal(hints);
      break;
    case 'sleep':
      code = resolveSleepSignal(hints);
      break;
    case 'subjective':
      code = 'subjective_low';
      break;
    case 'loadContext':
      code = 'load_elevated';
      break;
    default:
      return null;
  }
  return { code, label: LABEL_FR[code] };
}

/** Every limiter dimension × signal code the API may emit (for exhaustive tests). */
export const LIMITER_SIGNAL_BY_DIMENSION: Record<
  NonNullable<RecoveryData['primaryLimitingFactor']>,
  readonly LimiterSignalCode[]
> = {
  autonomic: ['hrv_low', 'rhr_high'],
  sleep: ['sleep_short', 'sleep_poor'],
  subjective: ['subjective_low'],
  loadContext: ['load_elevated'],
};
