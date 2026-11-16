/**
 * SESSION FEATURE EXTRACTOR
 *
 * Pure function: (SessionObservation, SubjectiveObservation | null, ExtractionContext)
 *               → SessionFeatureSet
 *
 * Invariants:
 *   - Zero side effects. No I/O. No randomness.
 *   - Fully deterministic: same inputs always produce the same output.
 *   - TSS is computed using the highest-confidence method available (5-tier hierarchy).
 *   - Features that require stream data (hrDriftPercent, timeInZones, paceVariabilityIndex,
 *     aerobicLoadFactor, anaerobicLoadFactor) are null in v1.
 *     These are honest PENDING values — NOT zero.
 *
 * Scientific references:
 *   - TSS: Coggan (2003); Allen & Coggan "Training and Racing with a Power Meter"
 *   - TRIMP: Banister et al. (1975), modified by Morton et al. (1990)
 *   - TRIMP normalization: Manzi et al. (2009)
 *   - Session RPE / Foster load: Foster et al. (2001); TSS_rpe = (RPE×min)/600×100
 */

import type { SessionFeatureSet, TssMethod, SessionExtractorInput } from '../types';
import { isSet } from '@sharpit/shared/value';
import type { ExtractionContext } from '../context';
import { canUsePowerTss, canUseTrimpTss, canUsePaceTss } from '../context';
import type { SportType } from '../../observation/types';
import { TSS_METHOD_CONFIDENCE, QUALITY_CONFIDENCE } from '../types';
import {
  computeFosterSessionLoad,
  fosterSessionLoadToTss,
} from '../../training/foster-session-load';

// ─────────────────────────────────────────────────────────────────────────────
// Sport-specific constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TSS per hour when using the Duration × Factor method (last resort).
 * Values calibrated to approximate physiological cost relative to cycling FTP baseline.
 * Scientific basis: RPE-based metabolic equivalents per sport type.
 */
const SPORT_TSS_PER_HOUR: Record<SportType, number> = {
  RUN: 60,
  BIKE: 55,
  SWIM: 65,
  STRENGTH: 35,
  OPEN_WATER: 65,
  TRAIL_RUN: 70,
  MTB: 65,
  TRIATHLON: 60,
  YOGA: 20,
  OTHER: 45,
};

/**
 * Elevation stress factor per sport type.
 * Multiplied by elevation gain (m) to produce a dimensionless stress score.
 */
const ELEVATION_STRESS_FACTOR: Record<SportType, number> = {
  RUN: 0.1,
  BIKE: 0.05,
  SWIM: 0,
  STRENGTH: 0,
  OPEN_WATER: 0,
  TRAIL_RUN: 0.12,
  MTB: 0.08,
  TRIATHLON: 0.06,
  YOGA: 0,
  OTHER: 0.06,
};

const PACE_TSS_SPORTS: SportType[] = ['RUN', 'TRAIL_RUN', 'OPEN_WATER'];
const POWER_TSS_SPORTS: SportType[] = ['BIKE', 'MTB'];
const PACE_IF_SPORTS: SportType[] = ['RUN', 'TRAIL_RUN'];

/**
 * Sports whose load heart rate does not describe: the work is mechanical and the
 * pulse stays low, so TRIMP scored a recorded strength session at a third of an
 * unrecorded one. They go to the athlete's own RPE, then to the sport constant.
 */
const HR_BLIND_SPORTS: SportType[] = ['STRENGTH', 'YOGA'];

/**
 * Highest intensity factor a session of this length can hold. One hour at threshold
 * is 1.0 by definition, so a higher figure means the stored threshold is stale, not
 * that the athlete outran it: the tier steps aside rather than double the load.
 */
function maxPlausibleIntensityFactor(durationSec: number): number {
  if (durationSec >= 3600) {
    return 1.05;
  }
  if (durationSec >= 1200) {
    return 1.15;
  }
  return 1.3;
}

// ─────────────────────────────────────────────────────────────────────────────
// TSS computation — 5-tier hierarchy
// ─────────────────────────────────────────────────────────────────────────────

type TssResult = {
  tssScore: number;
  method: TssMethod;
  confidence: number;
};

/**
 * Tier 1 — Power-based TSS (most accurate).
 * TSS = IF² × durationHr × 100, where IF = NP / FTP.
 * Requires normalizedPower AND FTP.
 */
function computePowerTss(
  durationSec: number,
  normalizedPower: number,
  ftpW: number,
  powerQuality: 'MEASURED_DIRECT' | 'MEASURED_OPTICAL',
): TssResult {
  const durationHr = durationSec / 3600;
  const intensityFactor = normalizedPower / ftpW;
  const tssScore = intensityFactor * intensityFactor * durationHr * 100;

  const baseConfidence = TSS_METHOD_CONFIDENCE.POWER_BASED;
  const qualityConfidence = QUALITY_CONFIDENCE[powerQuality];
  const confidence = baseConfidence * qualityConfidence;

  return { tssScore, method: 'POWER_BASED', confidence };
}

type TrimpTssInput = {
  durationSec: number;
  avgBpm: number;
  maxHr: number;
  restingHr: number;
  lthr: number | undefined;
  hrQuality: 'MEASURED_DIRECT' | 'MEASURED_OPTICAL';
  sportType: SportType;
};

/**
 * Tier 2 — TRIMP-HR (Banister method normalized to TSS scale).
 *
 * TRIMP = durationMin × HRR × 0.64 × e^(1.92 × HRR)
 * where HRR = (avgHr − restingHr) / (maxHr − restingHr)
 *
 * Normalization: 1 hour at LTHR = 100 TSS.
 * If LTHR is not provided, it is estimated as 0.85 × maxHr.
 *
 * Scientific basis: Banister et al. (1975); Manzi et al. (2009) normalization.
 * Known limitation: assumes male physiology (coefficient 1.92).
 * See TRAINING_STRESS_MODEL.md Scientific Debt SD-013.
 */
function computeTrimpTss(input: TrimpTssInput): TssResult {
  const { durationSec, avgBpm, maxHr, restingHr, lthr, hrQuality, sportType } = input;
  const durationMin = durationSec / 60;
  const hrRange = maxHr - restingHr;

  if (hrRange <= 0) {
    return durationFactorFallback(durationSec, sportType);
  }

  const hrr = Math.max(0, Math.min(1, (avgBpm - restingHr) / hrRange));
  const trimp = durationMin * hrr * 0.64 * Math.exp(1.92 * hrr);

  const effectiveLthr = lthr ?? maxHr * 0.85;
  const hrrLt = Math.max(0, Math.min(1, (effectiveLthr - restingHr) / hrRange));
  const trimpPerHourAtThreshold = 60 * hrrLt * 0.64 * Math.exp(1.92 * hrrLt);

  // Without a usable threshold anchor there is no TRIMP normalisation, so this is
  // not a TRIMP result and must not be reported as one — the method tag is what
  // downstream auditing relies on to know how a number was produced.
  if (trimpPerHourAtThreshold <= 0) {
    return durationFactorFallback(durationSec, sportType);
  }

  const tssScore = (trimp / trimpPerHourAtThreshold) * 100;

  const baseConfidence = TSS_METHOD_CONFIDENCE.TRIMP_HR;
  const qualityConfidence = QUALITY_CONFIDENCE[hrQuality];
  const confidence = baseConfidence * qualityConfidence;

  return { tssScore, method: 'TRIMP_HR', confidence };
}

/**
 * Tier 3 — Pace-based TSS (for running and open water, when threshold pace is known).
 * Uses the same IF²-based formula as power TSS, with velocity ratio as IF proxy.
 * Known limitation: does not account for elevation gain (NGP approximation).
 */
function computePaceTss(
  durationSec: number,
  avgMinPerKm: number,
  distanceM: number,
  thresholdPaceSecPerKm: number,
): TssResult {
  const durationHr = durationSec / 3600;
  const avgPaceSecPerKm = avgMinPerKm * 60;
  const intensityFactor = thresholdPaceSecPerKm / avgPaceSecPerKm; // faster pace = higher IF
  const tssScore = intensityFactor * intensityFactor * durationHr * 100;

  return {
    tssScore,
    method: 'PACE_BASED',
    confidence: TSS_METHOD_CONFIDENCE.PACE_BASED,
  };
}

/**
 * Tier 4 — Foster session-RPE, normalized to a TSS-like scale for the cascade.
 * See `lib/training/foster-session-load.ts` and TRAINING_STRESS_MODEL.md.
 */
function computeRpeTss(durationSec: number, rpe: number): TssResult {
  const sessionLoad = computeFosterSessionLoad(durationSec, rpe);
  const tssScore = fosterSessionLoadToTss(sessionLoad);

  return {
    tssScore,
    method: 'RPE_BASED',
    confidence: TSS_METHOD_CONFIDENCE.RPE_BASED,
  };
}

/**
 * Tier 5 — Duration × sport constant (last resort).
 */
function durationFactorFallback(
  durationSec: number,
  sportType: SportType,
  ctx?: ExtractionContext,
): TssResult {
  const durationHr = durationSec / 3600;
  const perHour = ctx?.typicalLoadPerHour?.[sportType] ?? SPORT_TSS_PER_HOUR[sportType];
  const tssScore = durationHr * perHour;
  return {
    tssScore,
    method: 'DURATION_FACTOR',
    confidence: TSS_METHOD_CONFIDENCE.DURATION_FACTOR,
  };
}

/** A gap longer than this between two samples is a pause, not time at that pulse. */
const MAX_SAMPLE_GAP_SEC = 30;

/**
 * TRIMP summed sample by sample, on the same scale as `computeTrimpTss`. The weighting
 * is convex, so applied to the session's mean pulse it under-scores intervals against a
 * steady effort of the same mean. Null without a usable pulse range or threshold.
 */
export function sampledTrimpTss(
  timeSec: readonly number[],
  heartRate: readonly number[],
  hr: { maxHr: number; restingHr: number; lthr?: number },
): number | null {
  const hrRange = hr.maxHr - hr.restingHr;
  const reserve = (bpm: number) => Math.max(0, Math.min(1, (bpm - hr.restingHr) / hrRange));
  const perMinute = (hrr: number) => hrr * 0.64 * Math.exp(1.92 * hrr);
  const atThreshold = hrRange > 0 ? perMinute(reserve(hr.lthr ?? hr.maxHr * 0.85)) * 60 : 0;
  if (atThreshold <= 0 || timeSec.length < 2 || heartRate.length < timeSec.length) {
    return null;
  }
  let trimp = 0;
  for (let i = 1; i < timeSec.length; i += 1) {
    const gapSec = Math.min(timeSec[i]! - timeSec[i - 1]!, MAX_SAMPLE_GAP_SEC);
    const bpm = heartRate[i]!;
    if (gapSec > 0 && bpm > 0) {
      trimp += (gapSec / 60) * perMinute(reserve(bpm));
    }
  }
  return (trimp / atThreshold) * 100;
}

function tryPowerTss(input: SessionExtractorInput, ctx: ExtractionContext): TssResult | null {
  const { session } = input;
  const { durationSec } = session;
  const normalizedPower = session.powerData?.normalizedPower;
  if (
    !POWER_TSS_SPORTS.includes(session.sportType) ||
    !canUsePowerTss(ctx) ||
    normalizedPower === undefined ||
    normalizedPower === null ||
    normalizedPower === undefined ||
    normalizedPower <= 0 ||
    normalizedPower / ctx.ftpW! > maxPlausibleIntensityFactor(durationSec)
  ) {
    return null;
  }

  return computePowerTss(durationSec, normalizedPower, ctx.ftpW!, session.powerData!.quality);
}

function tryTrimpTss(input: SessionExtractorInput, ctx: ExtractionContext): TssResult | null {
  const { session } = input;
  const { durationSec } = session;
  const avgBpm = session.hrData?.avgBpm;
  if (
    HR_BLIND_SPORTS.includes(session.sportType) ||
    !canUseTrimpTss(ctx) ||
    avgBpm === undefined ||
    avgBpm === null
  ) {
    return null;
  }

  const sampled = input.stream?.hrTrimpTss;
  if (isSet(sampled)) {
    return {
      tssScore: sampled,
      method: 'TRIMP_HR',
      confidence: TSS_METHOD_CONFIDENCE.TRIMP_HR * QUALITY_CONFIDENCE[session.hrData!.quality],
    };
  }

  return computeTrimpTss({
    durationSec,
    avgBpm,
    maxHr: ctx.maxHr!,
    restingHr: ctx.restingHr!,
    lthr: ctx.lthr,
    hrQuality: session.hrData!.quality,
    sportType: session.sportType,
  });
}

function hasPaceData(session: SessionExtractorInput['session']): boolean {
  const pace = session.paceData;
  return (
    pace?.avgMinPerKm !== undefined &&
    pace.avgMinPerKm !== null &&
    pace.distanceM !== undefined &&
    pace.distanceM !== null
  );
}

function hasPaceTssInputs(
  session: SessionExtractorInput['session'],
  ctx: ExtractionContext,
): boolean {
  if (!canUsePaceTss(ctx) || !PACE_TSS_SPORTS.includes(session.sportType)) {
    return false;
  }
  return hasPaceData(session);
}

function tryPaceTss(input: SessionExtractorInput, ctx: ExtractionContext): TssResult | null {
  const { session } = input;
  const { durationSec } = session;
  if (!hasPaceTssInputs(session, ctx)) {
    return null;
  }
  const intensityFactor = ctx.runThresholdPaceSecPerKm! / (session.paceData!.avgMinPerKm! * 60);
  if (intensityFactor > maxPlausibleIntensityFactor(durationSec)) {
    return null;
  }

  return computePaceTss(
    durationSec,
    session.paceData!.avgMinPerKm!,
    session.paceData!.distanceM!,
    ctx.runThresholdPaceSecPerKm!,
  );
}

function tryRpeTss(input: SessionExtractorInput): TssResult | null {
  const { linkedSubjective, session } = input;
  const { durationSec } = session;
  if (
    linkedSubjective?.rpe === undefined ||
    linkedSubjective?.rpe === null ||
    linkedSubjective?.rpe === undefined
  ) {
    return null;
  }
  return computeRpeTss(durationSec, linkedSubjective.rpe);
}

/**
 * Main TSS dispatcher — selects the highest-confidence method available.
 */
function selectBestTss(input: SessionExtractorInput, ctx: ExtractionContext): TssResult {
  const tierAttempts = [
    () => tryPowerTss(input, ctx),
    () => tryTrimpTss(input, ctx),
    () => tryPaceTss(input, ctx),
    () => tryRpeTss(input),
  ];

  for (const attempt of tierAttempts) {
    const result = attempt();
    if (result) {
      return result;
    }
  }

  return durationFactorFallback(input.session.durationSec, input.session.sportType, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mechanical metrics
// ─────────────────────────────────────────────────────────────────────────────

function computeMechanicalLoad(durationSec: number, avgWatts: number | undefined): number | null {
  if (avgWatts === undefined || avgWatts === null || avgWatts <= 0) {
    return null;
  }
  return (avgWatts * durationSec) / 1000; // kJ
}

function computeElevationStressScore(
  elevationM: number | undefined,
  sportType: SportType,
): number | null {
  if (elevationM === undefined || elevationM === null || elevationM <= 0) {
    return null;
  }
  const factor = ELEVATION_STRESS_FACTOR[sportType];
  if (factor === 0) {
    return null;
  } // sport has no elevation cost (SWIM, YOGA, STRENGTH)
  return elevationM * factor;
}

// ─────────────────────────────────────────────────────────────────────────────
// Intensity factor
// ─────────────────────────────────────────────────────────────────────────────

function computePowerIntensityFactor(
  session: SessionExtractorInput['session'],
  ctx: ExtractionContext,
): number | null {
  // The FTP is a cycling threshold. A run recorded with running power (some 300 W) divided by
  // it read as 1.3 to 1.75 times threshold; such a session is read by its pace instead.
  if (!POWER_TSS_SPORTS.includes(session.sportType)) {
    return null;
  }
  const normalizedPower = session.powerData?.normalizedPower;
  if (ctx.ftpW && ctx.ftpW > 0 && normalizedPower) {
    return normalizedPower / ctx.ftpW;
  }
  return session.powerData?.intensityFactor ?? null;
}

function computePaceIntensityFactor(
  session: SessionExtractorInput['session'],
  ctx: ExtractionContext,
): number | null {
  if (
    !ctx.runThresholdPaceSecPerKm ||
    !session.paceData?.avgMinPerKm ||
    !PACE_IF_SPORTS.includes(session.sportType)
  ) {
    return null;
  }
  const avgPaceSecPerKm = session.paceData.avgMinPerKm * 60;
  return ctx.runThresholdPaceSecPerKm / avgPaceSecPerKm;
}

function computeIntensityFactor(
  input: SessionExtractorInput,
  ctx: ExtractionContext,
): number | null {
  return (
    computePowerIntensityFactor(input.session, ctx) ??
    computePaceIntensityFactor(input.session, ctx)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Efficiency factor
// ─────────────────────────────────────────────────────────────────────────────

function computeEfficiencyFactor(input: SessionExtractorInput): number | null {
  const { session } = input;
  const avgHr = session.hrData?.avgBpm;
  if (!avgHr || avgHr <= 0) {
    return null;
  }

  // Power EF (NP ÷ avgHR), for the sports whose power is cycling power: a run with a power
  // meter would otherwise sit on another scale (2.3 W/bpm) than a run without (0.02 m/s/bpm),
  // and no trend could be read across the two.
  if (POWER_TSS_SPORTS.includes(session.sportType) && session.powerData?.normalizedPower) {
    return session.powerData.normalizedPower / avgHr;
  }

  // Pace EF (m/s ÷ avgHR)
  if (session.paceData?.avgMinPerKm) {
    const speedMps = 1000 / (session.paceData.avgMinPerKm * 60);
    return speedMps / avgHr;
  }

  return null;
}

function collectSourceObsIds(
  sessionId: string,
  linkedSubjective: SessionExtractorInput['linkedSubjective'],
): string[] {
  const ids = [sessionId];
  if (linkedSubjective) {
    ids.push(linkedSubjective.id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main extractor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract all Session Features from a session observation and its optional linked subjective.
 *
 * Pure function — no side effects, no async, fully deterministic.
 */
type SessionMetrics = {
  tssResult: TssResult;
  intensityFactor: number | null;
  mechanicalLoad: number | null;
  elevationStressScore: number | null;
  efficiencyFactor: number | null;
};

function computeSessionMetrics(
  input: SessionExtractorInput,
  ctx: ExtractionContext,
): SessionMetrics {
  const { session } = input;
  return {
    tssResult: selectBestTss(input, ctx),
    intensityFactor: computeIntensityFactor(input, ctx),
    mechanicalLoad: computeMechanicalLoad(session.durationSec, session.powerData?.avgWatts),
    elevationStressScore: computeElevationStressScore(session.elevationM, session.sportType),
    efficiencyFactor: computeEfficiencyFactor(input),
  };
}

const EMPTY_STREAM_FEATURES = {
  aerobicLoadFactor: null,
  anaerobicLoadFactor: null,
  timeInZones: null,
  hrDriftPercent: null,
  paceVariabilityIndex: null,
} as const;

function streamFeatureFields(
  stream: SessionExtractorInput['stream'],
): Pick<
  SessionFeatureSet,
  | 'aerobicLoadFactor'
  | 'anaerobicLoadFactor'
  | 'timeInZones'
  | 'hrDriftPercent'
  | 'paceVariabilityIndex'
> {
  if (!stream) {
    return { ...EMPTY_STREAM_FEATURES };
  }

  return {
    aerobicLoadFactor: stream.aerobicLoadFactor ?? null,
    anaerobicLoadFactor: stream.anaerobicLoadFactor ?? null,
    timeInZones: stream.timeInZones ?? null,
    hrDriftPercent: stream.hrDriftPercent ?? null,
    paceVariabilityIndex: stream.paceVariabilityIndex ?? null,
  };
}

function buildSessionFeatureSet(
  input: SessionExtractorInput,
  metrics: SessionMetrics,
): SessionFeatureSet {
  const { session, linkedSubjective } = input;
  const subjectiveRpe = linkedSubjective?.rpe ?? null;

  return {
    sessionObsId: session.id,
    trainingDayId: session.trainingDayId,
    sportType: session.sportType,
    durationSec: session.durationSec,
    tssScore: metrics.tssResult.tssScore,
    tssMethod: metrics.tssResult.method,
    intensityFactor: metrics.intensityFactor,
    ...streamFeatureFields(input.stream),
    mechanicalLoad: metrics.mechanicalLoad,
    elevationStressScore: metrics.elevationStressScore,
    efficiencyFactor: metrics.efficiencyFactor,
    subjectiveRpe,
    fosterSessionLoad: isSet(subjectiveRpe)
      ? computeFosterSessionLoad(session.durationSec, subjectiveRpe)
      : null,
    sourceProvidedTss: session.sourceProvidedStress?.value ?? null,
    confidence: metrics.tssResult.confidence,
    algorithmId: 'session-features-v1',
    sourceObsIds: collectSourceObsIds(session.id, linkedSubjective),
  } satisfies SessionFeatureSet;
}

export function extractSessionFeatures(
  input: SessionExtractorInput,
  ctx: ExtractionContext,
): SessionFeatureSet {
  return buildSessionFeatureSet(input, computeSessionMetrics(input, ctx));
}
