/**
 * Resolves positive « Porté par » signals from calculated recovery hints.
 * Never invents a support when the dimension is a frein, or when data is missing.
 */

import { isSet } from '@sharpit/shared/value';
import type { LimiterSignalCode } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import type { LimiterSignalHints } from '@sharpit/app/lib/today/dashboard/limiter-signal';
import {
  filterSupportsAgainstLimiters,
  SUPPORT_SIGNAL_CODES,
  type SupportSignalCode,
} from '@sharpit/server/lib/verdict/verdict-copy';

export type ResolveSupportSignalInput = {
  hints?: LimiterSignalHints | null;
  /** Freins already shown — never emit a conflicting support. */
  limiterSignals?: readonly LimiterSignalCode[] | null;
  /** @deprecated Prefer limiterSignals. */
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

function limiterList(input: ResolveSupportSignalInput): LimiterSignalCode[] {
  if (input.limiterSignals && input.limiterSignals.length > 0) {
    return [...input.limiterSignals];
  }
  return input.limiterSignal ? [input.limiterSignal] : [];
}

/**
 * All positive support signals that pass, priority order.
 * Returns [] when no positive fact is calculated.
 * Generator rule: never emit a support on a system that already has a frein.
 */
export function resolveSupportSignals(input: ResolveSupportSignalInput): SupportSignalCode[] {
  const hints = input.hints ?? {};
  const limiters = limiterList(input);

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

  const ok = candidates.filter((candidate) => candidate.ok).map((candidate) => candidate.code);
  return filterSupportsAgainstLimiters(ok, limiters);
}

/** @deprecated Prefer resolveSupportSignals — returns the first support only. */
export function resolveSupportSignal(input: ResolveSupportSignalInput): SupportSignalCode | null {
  return resolveSupportSignals(input)[0] ?? null;
}

export { SUPPORT_SIGNAL_CODES };
