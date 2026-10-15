/**
 * Resolves a single positive « Porté par » signal from calculated recovery hints.
 * Never invents a support when the dimension is the frein, or when data is missing.
 */

import { isSet } from '@sharpit/shared/value';
import type { LimiterSignalCode } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import type { LimiterSignalHints } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import {
  SUPPORT_SIGNAL_CODES,
  type SupportSignalCode,
} from '@sharpit/server/lib/verdict/verdict-copy';

export type ResolveSupportSignalInput = {
  hints?: LimiterSignalHints | null;
  /** Frein already shown — never emit the conflicting support. */
  limiterSignal?: LimiterSignalCode | null;
  /** Subjective wellness when known: HIGH | NORMAL | LOW | VERY_LOW */
  subjectiveWellness?: string | null;
  /** Load stress context when known: UNDERTRAINED | OPTIMAL | ELEVATED | HIGH | CRITICAL */
  loadStressContext?: string | null;
};

function isHrvOk(hints: LimiterSignalHints): boolean {
  const { hrv, hrvBaselineLow, hrvBaselineHigh, hrvStatus } = hints;
  if (typeof hrvStatus === 'string' && /UNBALANCED_LOW|LOW/i.test(hrvStatus)) {
    return false;
  }
  if (typeof hrvStatus === 'string' && /ENHANCED|BALANCED|NORMAL|HIGH/i.test(hrvStatus)) {
    return true;
  }
  if (!isSet(hrv) || !isSet(hrvBaselineLow) || !isSet(hrvBaselineHigh)) {
    return false;
  }
  return hrv >= hrvBaselineLow && hrv <= hrvBaselineHigh;
}

function isRhrOk(hints: LimiterSignalHints): boolean {
  const { restingHr, restingHrTypical } = hints;
  if (!isSet(restingHr) || !isSet(restingHrTypical)) {
    return false;
  }
  return restingHr <= restingHrTypical + 2;
}

function isSleepAdequate(hints: LimiterSignalHints): boolean {
  const target = hints.sleepTargetMinutes;
  const slept = hints.sleepMinutes;
  if (!isSet(slept)) {
    return false;
  }
  if (isSet(target)) {
    return slept >= target * 0.9;
  }
  return slept >= 6.5 * 60;
}

function isSleepQualityOk(hints: LimiterSignalHints): boolean {
  const deep = hints.sleepDeepMin;
  const rem = hints.sleepRemMin;
  const total = hints.sleepMinutes;
  if (!isSet(deep) || !isSet(rem) || !isSet(total) || total <= 0) {
    return false;
  }
  return ((deep + rem) / total) * 100 >= 40;
}

/** Limiter codes that block a given support. */
const BLOCKED_BY_LIMITER: Record<SupportSignalCode, readonly LimiterSignalCode[]> = {
  hrv_ok: ['hrv_low'],
  rhr_ok: ['rhr_high'],
  sleep_adequate: ['sleep_short'],
  sleep_quality_ok: ['sleep_poor'],
  subjective_ok: ['subjective_low'],
  load_managed: ['load_elevated'],
};

function isBlocked(
  code: SupportSignalCode,
  limiter: LimiterSignalCode | null | undefined,
): boolean {
  if (!limiter) {
    return false;
  }
  return BLOCKED_BY_LIMITER[code].includes(limiter);
}

/**
 * Picks at most one support signal, priority: autonomic → sleep → subjective → load.
 * Returns null when no positive fact is calculated.
 */
export function resolveSupportSignal(input: ResolveSupportSignalInput): SupportSignalCode | null {
  const hints = input.hints ?? {};
  const limiter = input.limiterSignal;

  const candidates: Array<{ code: SupportSignalCode; ok: boolean }> = [
    { code: 'hrv_ok', ok: isHrvOk(hints) },
    { code: 'rhr_ok', ok: isRhrOk(hints) },
    { code: 'sleep_adequate', ok: isSleepAdequate(hints) },
    { code: 'sleep_quality_ok', ok: isSleepQualityOk(hints) },
    {
      code: 'subjective_ok',
      ok: input.subjectiveWellness === 'HIGH' || input.subjectiveWellness === 'NORMAL',
    },
    {
      code: 'load_managed',
      ok: input.loadStressContext === 'OPTIMAL' || input.loadStressContext === 'UNDERTRAINED',
    },
  ];

  for (const candidate of candidates) {
    if (candidate.ok && !isBlocked(candidate.code, limiter)) {
      return candidate.code;
    }
  }
  return null;
}

export { SUPPORT_SIGNAL_CODES };
