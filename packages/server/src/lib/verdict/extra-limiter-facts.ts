/**
 * Extra frein-like facts for the explanation — never invent, only surface when
 * calculated, and never duplicate the primary limiter chip.
 */

import { isSet } from '@sharpit/shared/value';
import type {
  LimiterSignalCode,
  LimiterSignalHints,
} from '@sharpit/app/lib/today/dashboard/limiter-signal';

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

function isRhrElevated(hints: LimiterSignalHints): boolean {
  const { restingHr, restingHrTypical } = hints;
  if (!isSet(restingHr) || !isSet(restingHrTypical)) {
    return false;
  }
  return restingHr >= restingHrTypical + 4;
}

function isSleepShort(hints: LimiterSignalHints): boolean {
  const target = hints.sleepTargetMinutes;
  const slept = hints.sleepMinutes;
  if (!isSet(slept)) {
    return false;
  }
  if (isSet(target)) {
    return slept < target * 0.9;
  }
  return slept < 6.5 * 60;
}

function isSleepPoor(hints: LimiterSignalHints): boolean {
  const deep = hints.sleepDeepMin;
  const rem = hints.sleepRemMin;
  const total = hints.sleepMinutes;
  if (!isSet(deep) || !isSet(rem) || !isSet(total) || total <= 0) {
    return false;
  }
  return ((deep + rem) / total) * 100 < 40;
}

/**
 * Secondary limiter facts to weave into the explanation when calculated,
 * excluding the primary frein chip code.
 */
export function resolveExtraLimiterFacts(input: {
  primary: LimiterSignalCode | null | undefined;
  hints?: LimiterSignalHints | null;
  subjectiveWellness?: string | null;
  loadStressContext?: string | null;
}): LimiterSignalCode[] {
  const hints = input.hints ?? {};
  const primary = input.primary ?? null;
  const extras: LimiterSignalCode[] = [];

  const push = (code: LimiterSignalCode, ok: boolean) => {
    if (ok && code !== primary) {
      extras.push(code);
    }
  };

  push('hrv_low', isHrvSuppressed(hints));
  push('rhr_high', isRhrElevated(hints));
  push('sleep_short', isSleepShort(hints));
  push('sleep_poor', isSleepPoor(hints));
  push(
    'subjective_low',
    input.subjectiveWellness === 'LOW' || input.subjectiveWellness === 'VERY_LOW',
  );
  push(
    'load_elevated',
    input.loadStressContext === 'ELEVATED' ||
      input.loadStressContext === 'HIGH' ||
      input.loadStressContext === 'CRITICAL',
  );

  return extras;
}
