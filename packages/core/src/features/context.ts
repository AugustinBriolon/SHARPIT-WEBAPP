/**
 * FEATURE ENGINE — Extraction Context
 *
 * ExtractionContext carries everything the Feature extractors need that is NOT
 * derivable from the Observation itself. Primarily: athlete-specific constants
 * (FTP, HR thresholds) that personalize the extraction algorithms.
 *
 * The FeatureEngine assembles this context from the AthleteProfile / Digital Twin
 * before calling any extractor. The extractors themselves have no import
 * dependency on the Digital Twin — this is the FeatureEngine's concern.
 *
 * Invariants:
 *   - All fields are optional because an athlete may not have completed onboarding.
 *   - Extractors must gracefully degrade when context is incomplete:
 *     use a lower-tier TSS method rather than returning null.
 *   - Context is ephemeral — it is assembled at extraction time, not persisted.
 */

import type { SportType } from '../observation/types';

export type ExtractionContext = {
  readonly athleteId: string;
  /** YYYY-MM-DD — the training day being extracted. */
  readonly trainingDayId: string;
  /** IANA timezone string (e.g. 'Europe/Paris'). Defaults to 'UTC'. */
  readonly timezone: string;

  // ── Athlete capabilities (from AthleteProfile / Digital Twin) ──────────────

  /** Functional Threshold Power in watts. Required for power-based TSS. */
  readonly ftpW?: number;

  /** Maximum heart rate in bpm. Required for TRIMP-based TSS and HR zone computation. */
  readonly maxHr?: number;

  /** Resting heart rate in bpm. Required for TRIMP computation (HRR denominator). */
  readonly restingHr?: number;

  /**
   * Lactate Threshold Heart Rate in bpm.
   * Used as the TRIMP normalization reference (1hr at LTHR = 100 TSS).
   * If absent, estimated as 0.85 × maxHr (conservative approximation).
   */
  readonly lthr?: number;

  /**
   * Running threshold pace in seconds per kilometre.
   * Used for pace-based TSS (CSS / Critical Speed approach).
   */
  readonly runThresholdPaceSecPerKm?: number;

  /**
   * Target sleep duration in minutes (from athlete preferences).
   * Used to compute sleep debt. Default: 480 (8 hours) if absent.
   */
  readonly sleepTargetMinutes?: number;

  /**
   * The athlete's own mean load per hour by sport, from sessions scored on a measure.
   * Replaces the sport constant when a session has nothing to be scored on, so an
   * unmeasured ride weighs what this athlete's measured rides weigh.
   */
  readonly typicalLoadPerHour?: Partial<Record<SportType, number>>;
};

import { SLEEP_TARGET_MIN } from '../sleep/targets';
import { isSet } from '@sharpit/shared/value';

/** Effective sleep target — defaults to 7h30 if athlete has not set one. */
export function effectiveSleepTarget(ctx: ExtractionContext): number {
  return ctx.sleepTargetMinutes ?? SLEEP_TARGET_MIN;
}

/** Whether context has enough data for power-based TSS. */
export function canUsePowerTss(ctx: ExtractionContext): boolean {
  return isSet(ctx.ftpW) && ctx.ftpW > 0;
}

/** Whether context has enough data for TRIMP-based TSS. */
export function canUseTrimpTss(ctx: ExtractionContext): boolean {
  return isSet(ctx.maxHr) && ctx.maxHr > 0 && isSet(ctx.restingHr) && ctx.restingHr >= 0;
}

/** Whether context has enough data for pace-based TSS. */
export function canUsePaceTss(ctx: ExtractionContext): boolean {
  return isSet(ctx.runThresholdPaceSecPerKm) && ctx.runThresholdPaceSecPerKm > 0;
}

/** Measured sessions a sport needs before its mean replaces the constant. */
export const MIN_SESSIONS_FOR_TYPICAL_LOAD = 5;

/**
 * Mean load per hour by sport over sessions scored on power, heart rate, pace or RPE.
 * Sessions scored on the constant are left out: they would feed it back to itself.
 */
export function typicalLoadPerHour(
  sessions: ReadonlyArray<{
    sportType: SportType;
    durationSec: number;
    tssScore: number;
    tssMethod: string;
  }>,
): Partial<Record<SportType, number>> {
  const bySport = new Map<SportType, { hours: number; load: number; count: number }>();
  for (const session of sessions) {
    if (session.tssMethod === 'DURATION_FACTOR' || session.durationSec <= 0) {
      continue;
    }
    const entry = bySport.get(session.sportType) ?? { hours: 0, load: 0, count: 0 };
    entry.hours += session.durationSec / 3600;
    entry.load += session.tssScore;
    entry.count += 1;
    bySport.set(session.sportType, entry);
  }
  const typical: Partial<Record<SportType, number>> = {};
  for (const [sport, { hours, load, count }] of bySport) {
    if (count >= MIN_SESSIONS_FOR_TYPICAL_LOAD && hours > 0) {
      typical[sport] = Math.round((load / hours) * 10) / 10;
    }
  }
  return typical;
}
