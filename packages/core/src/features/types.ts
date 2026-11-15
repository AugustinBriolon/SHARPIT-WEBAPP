/**
 * FEATURE ENGINE — Type System
 *
 * Features are the second layer of the SHARPIT inference pipeline:
 *
 *   Observations  →  Features  →  [Inference Models]  →  Athlete State
 *
 * Key invariants (from FEATURE_EXTRACTION.md and INFERENCE_ARCHITECTURE_REVIEW.md):
 *
 *   1. Features are computable, reproducible, and context-free facts.
 *      They contain NO interpretation. "acuteLoad = 420 TSS" is a Feature.
 *      "Training stress is elevated" is a Signal (ephemeral, from a model).
 *
 *   2. Feature values are always numeric, boolean, or structured numeric objects.
 *      Never strings that imply judgment ("good", "elevated", "dangerous").
 *
 *   3. PENDING is a first-class status — it is NOT null, NOT zero.
 *      Downstream models must treat PENDING as "unknown", not as absence.
 *
 *   4. Every Feature records the algorithm version that produced it.
 *      An anonymous Feature is invalid.
 *
 *   5. A Feature's confidence ceiling equals the quality-derived confidence
 *      of its weakest input Observation.
 *
 *   6. Features are never deleted — only versioned and superseded.
 */

import type { SportType } from '../observation/types';

// ─────────────────────────────────────────────────────────────────────────────
// Feature lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export type FeatureStatus = 'PENDING' | 'COMPUTING' | 'COMPUTED' | 'INVALIDATED';

export type FeatureCategory = 'SESSION' | 'LOAD' | 'RECOVERY' | 'BODY' | 'CONDITION' | 'FUEL';

// ─────────────────────────────────────────────────────────────────────────────
// TSS computation metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Records which method was used to compute the canonical TSS for a session.
 * Ordered from most to least reliable (matching the 5-tier hierarchy in
 * INFERENCE_ARCHITECTURE_REVIEW.md §4.1 and TRAINING_STRESS_MODEL.md §5.1).
 */
export type TssMethod =
  | 'POWER_BASED' // NP²/FTP² × duration × 100 — most accurate
  | 'TRIMP_HR' // Banister TRIMP normalized to TSS scale
  | 'PACE_BASED' // threshold pace ratio × duration
  | 'RPE_BASED' // Foster session-RPE normalized to TSS scale (Tier 4)
  | 'DURATION_FACTOR'; // duration × sport constant (last resort)

/** Quality-to-confidence mapping for Observation inputs. */
export const QUALITY_CONFIDENCE = {
  MEASURED_DIRECT: 1.0,
  MEASURED_OPTICAL: 0.85,
  MANUAL: 0.8,
  ESTIMATED: 0.6,
  PROPRIETARY_MODEL: 0.4,
} as const;

/** Baseline confidence ceiling per TSS computation method. */
export const TSS_METHOD_CONFIDENCE: Record<TssMethod, number> = {
  POWER_BASED: 1.0, // further capped by power data quality
  TRIMP_HR: 0.75, // TRIMP has inherent ±15% error
  PACE_BASED: 0.75, // pace is a good proxy but still approximate
  RPE_BASED: 0.45, // Foster sRPE → TSS; ±30% typical (Level 3)
  DURATION_FACTOR: 0.25, // last resort — high uncertainty
};

// ─────────────────────────────────────────────────────────────────────────────
// SESSION Feature Set
// (one per SESSION observation)
// ─────────────────────────────────────────────────────────────────────────────

export type SessionFeatureSet = {
  readonly sessionObsId: string;
  readonly trainingDayId: string;
  readonly sportType: SportType;
  readonly durationSec: number;

  // ── Canonical training stress ──────────────────────────────────────────────

  /**
   * SHARPIT canonical TSS. This is NOT the source-provided TSS.
   * Computed independently using the highest-confidence method available
   * (5-tier hierarchy: power → TRIMP → pace → RPE → duration factor).
   */
  readonly tssScore: number;
  readonly tssMethod: TssMethod;

  // ── Intensity ──────────────────────────────────────────────────────────────

  /**
   * Intensity Factor = NP / FTP (power path) or avgPace / thresholdPace (run).
   * Null when neither FTP nor threshold pace is available.
   */
  readonly intensityFactor: number | null;

  // ── Aerobic/anaerobic distribution ────────────────────────────────────────

  /**
   * Fraction of duration spent in Z1+Z2 (aerobic zones), 0–1.
   * Null when no HR stream data is available (requires session-level stream,
   * not currently in the Observation schema — v2 enhancement).
   */
  readonly aerobicLoadFactor: number | null;

  /**
   * Fraction of duration spent in Z4+Z5 (supra-threshold zones), 0–1.
   * Same stream data constraint as aerobicLoadFactor.
   */
  readonly anaerobicLoadFactor: number | null;

  /**
   * Duration in minutes per HR/power zone: [z1, z2, z3, z4, z5].
   * Null when stream data is unavailable.
   */
  readonly timeInZones: readonly [number, number, number, number, number] | null;

  // ── Fatigue indicators ─────────────────────────────────────────────────────

  /**
   * Heart rate drift during the session: (avgHR_2nd_half − avgHR_1st_half) / avgHR_1st_half × 100.
   * Requires HR stream data — null when unavailable (v2 enhancement).
   */
  readonly hrDriftPercent: number | null;

  // ── Work metrics ──────────────────────────────────────────────────────────

  /**
   * Total mechanical work in kilojoules (kJ = avgWatts × durationSec / 1000).
   * Null when no power data is available.
   */
  readonly mechanicalLoad: number | null;

  /**
   * Elevation stress score (dimensionless). Elevation gain adjusted by sport-type
   * factor to capture additional physiological cost.
   */
  readonly elevationStressScore: number | null;

  // ── Efficiency ────────────────────────────────────────────────────────────

  /**
   * Efficiency factor: pace (m/s) ÷ avgHR (power path: NP ÷ avgHR).
   * Higher values indicate better cardiovascular efficiency.
   */
  readonly efficiencyFactor: number | null;

  /**
   * Pace variability index: stdDev(pace) / avgPace.
   * Requires pace stream data — null when unavailable.
   */
  readonly paceVariabilityIndex: number | null;

  // ── Subjective ────────────────────────────────────────────────────────────

  /**
   * RPE from a linked SubjectiveObservation (Borg CR10, 0–10).
   * Null when no subjective observation links to this session.
   */
  readonly subjectiveRpe: number | null;

  /**
   * Foster session load (internal load): RPE × durationMin.
   * Always computed when subjectiveRpe is present — even if tssMethod is power/HR/pace.
   * Units are Foster "training load" (not TSS). Null when no RPE.
   * Reference: Foster et al. (2001).
   */
  readonly fosterSessionLoad: number | null;

  // ── Source cross-validation ───────────────────────────────────────────────

  /**
   * TSS reported by the source platform (Garmin, Strava).
   * Retained for cross-validation only. NOT used in downstream models.
   */
  readonly sourceProvidedTss: number | null;

  // ── Feature metadata ──────────────────────────────────────────────────────

  readonly confidence: number;
  readonly algorithmId: 'session-features-v1';
  readonly sourceObsIds: readonly string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD Feature Set
// (one per training day — aggregated from a rolling window of sessions)
// ─────────────────────────────────────────────────────────────────────────────

export type LoadFeatureSet = {
  readonly trainingDayId: string;

  // ── PMC rolling sums (simple, model-independent) ──────────────────────────

  /**
   * Acute Training Load: rolling 7-day sum of daily tssScore.
   * NOTE: This is a SIMPLE ROLLING SUM, distinct from ATL (EWMA τ=7) which
   * the Training Stress Model computes and stores in the Digital Twin.
   * See INFERENCE_ARCHITECTURE_REVIEW.md §4.6.
   */
  readonly acuteLoad: number;

  /**
   * Chronic Training Load: rolling 42-day sum ÷ 6 (weekly equivalent).
   * Distinct from CTL (EWMA τ=42) in the Digital Twin.
   */
  readonly chronicLoad: number;

  /**
   * Acute:Chronic Workload Ratio = acuteLoad / chronicLoad.
   * Null when chronicLoad is 0 (no historical training data).
   */
  readonly acwr: number | null;

  /** acuteLoad alias — kept for readability in consuming models. */
  readonly weeklyLoad: number;

  // ── Monotony and strain ───────────────────────────────────────────────────

  /**
   * Load Monotony: mean(daily TSS over 7d) / stdDev(daily TSS over 7d).
   * High monotony (>2) signals insufficient training variety.
   * Null when stdDev is 0 (all days have identical load, e.g. < 3 sessions).
   */
  readonly loadMonotony: number | null;

  /**
   * Load Strain: weeklyLoad × loadMonotony.
   * Null when loadMonotony is null.
   */
  readonly loadStrain: number | null;

  // ── Frequency and rest ────────────────────────────────────────────────────

  /** Number of sessions in the last 7 days. */
  readonly trainingFrequency: number;

  /** Days with zero training load in the last 7 days. */
  readonly restDayCount: number;

  // ── ACWR trend ────────────────────────────────────────────────────────────

  /**
   * Rate of ACWR change over the last 14 days (Δ acwr per day).
   * Positive = load is increasing. Negative = load is tapering.
   * Null when insufficient history (< 14 days).
   */
  readonly acuteChronicLoadTrend: number | null;

  // ── Sport-specific ACWR (for injury risk per-discipline) ──────────────────

  readonly acuteLoadRun: number | null;
  readonly acuteLoadBike: number | null;
  readonly chronicLoadRun: number | null;
  readonly chronicLoadBike: number | null;

  // ── Feature metadata ──────────────────────────────────────────────────────

  readonly confidence: number;
  readonly algorithmId: 'load-features-v1';
  readonly sourceObsIds: readonly string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// RECOVERY Feature Set
// (one per training day)
// ─────────────────────────────────────────────────────────────────────────────

export type SubjectiveWellnessComponents = {
  readonly mood: number | null; // 1–5 scale, raw
  readonly energyLevel: number | null; // 1–5 scale, raw
  readonly perceivedSoreness: number | null; // 0–10 scale, raw (higher = worse)
  readonly stressLevel: number | null; // 1–5 scale, raw (higher = worse)
};

export type RecoveryFeatureSet = {
  readonly trainingDayId: string;

  // ── Sleep ─────────────────────────────────────────────────────────────────

  /**
   * Sleep efficiency: (deepMin + remMin) / totalMinutes × 100.
   * Null when deep or REM data is unavailable.
   */
  readonly sleepEfficiencyPercent: number | null;

  /**
   * Last night's sleep against the athlete's target (1.0 = the target reached).
   * Optional: feature sets stored before it existed do not carry it.
   */
  readonly sleepDurationRatio?: number | null;

  /**
   * Cumulative sleep debt over last 7 days in minutes.
   * = (sleepTargetMinutes × 7) − sum(actualSleepMin last 7 days)
   * Positive = sleep deficit. Negative = sleep surplus.
   */
  readonly sleepDebtMin: number | null;

  /**
   * Standard deviation of bedtime (minutes from midnight) over last 14 nights.
   * Higher values indicate irregular sleep schedule.
   */
  readonly sleepOnsetConsistencyMin: number | null;

  /**
   * Linear regression slope of total sleep duration over last 7 days (min/day).
   * Negative trend indicates progressive sleep restriction.
   */
  readonly sleepDurationTrend: number | null;

  // ── HRV ───────────────────────────────────────────────────────────────────

  /** Absolute HRV value in milliseconds RMSSD. */
  readonly hrvAbsolute: number | null;

  /**
   * HRV relative to 14-day personal baseline: (today − baseline) / baseline × 100.
   * Positive = HRV above baseline (good recovery signal).
   * Null when baseline cannot be established (< 7 data points in 14-day window).
   */
  readonly hrvDeltaFromBaseline: number | null;

  /**
   * Today's ln(rMSSD) against the athlete's own 14-day mean, in standard deviations
   * of that window: a −10 % morning is noise for one athlete and a signal for another.
   * Optional: feature sets stored before it existed do not carry it.
   */
  readonly hrvZScore?: number | null;

  /**
   * HRV coefficient of variation over last 7 days: stdDev(hrv7d) / mean(hrv7d) × 100.
   * High CV (> 10%) signals physiological instability.
   */
  readonly hrvCoefficientOfVariation: number | null;

  // ── Resting Heart Rate ────────────────────────────────────────────────────

  /** Absolute RHR in bpm. */
  readonly rhrAbsolute: number | null;

  /**
   * RHR relative to 14-day personal baseline: today − baseline (in bpm).
   * Positive = RHR above baseline (suppressed recovery signal).
   */
  readonly rhrDeltaFromBaseline: number | null;

  // ── Subjective wellness ───────────────────────────────────────────────────

  /**
   * Composite wellness index (0–10) from subjective self-report.
   * Weights: mood (0.30) + energy (0.35) + soreness_inverted (0.25) + stress_inverted (0.10).
   * Null when no subjective observation is available for the day.
   */
  readonly subjectiveWellnessIndex: number | null;

  /** Raw sub-components of the wellness index (for model use). */
  readonly subjectiveWellnessComponents: SubjectiveWellnessComponents | null;

  /**
   * Difference between actual RPE and expected RPE for the session type.
   * Positive = perceived effort was higher than expected (indicator of fatigue).
   * Null when no subjective observation exists, or no session for the day.
   *
   * v1 simplification: expected RPE is derived from sportType using a lookup table.
   * See INFERENCE_ARCHITECTURE_REVIEW.md §4.4.
   */
  readonly rpeVsTargetZone: number | null;

  /**
   * Average stress during overnight sleep (0–100), from Sleep observation.
   * Used as a sleep-dimension modifier — not a proprietary readiness score.
   */
  readonly avgStressDuringSleep: number | null;

  // ── Feature metadata ──────────────────────────────────────────────────────

  readonly confidence: number;
  readonly algorithmId: 'recovery-features-v1';
  readonly sourceObsIds: readonly string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// BODY Feature Set
// (one per BodyCompositionObservation)
// ─────────────────────────────────────────────────────────────────────────────

export type BodyFeatureSet = {
  readonly trainingDayId: string;
  readonly observationId: string;

  readonly weightKg: number;
  readonly fatPercent: number | null;
  readonly fatMassKg: number | null;
  readonly leanMassKg: number | null;
  readonly musclePercent: number | null;
  readonly waterPercent: number | null;
  readonly visceralFat: number | null;

  // ── Trends (require multiple prior observations) ──────────────────────────

  /** Linear regression slope of weight over last 7 days (kg/day). */
  readonly weightTrend7d: number | null;

  /** Linear regression slope of fat % over last 7 days (%/day). */
  readonly fatPercentTrend7d: number | null;

  // ── Feature metadata ──────────────────────────────────────────────────────

  readonly confidence: number;
  readonly algorithmId: 'body-features-v1';
  readonly sourceObsIds: readonly string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// FUEL Feature Set
// (one per training day — derived from that day's NUTRITION observation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What the athlete ate on a training day, restated against their own targets
 * and their body mass.
 *
 * Strictly extractive: every field is arithmetic over one nutrition observation
 * plus the athlete's latest weight. It infers no adequacy, no deficiency and no
 * recommendation — those would need a Nutrition Engine, which the architecture
 * gates behind a decision-gap analysis.
 *
 * `logged` is the field every consumer must read first. A day the athlete never
 * opened still produces goals, so zero intake means "unknown", not "fasted", and
 * treating it as a real zero would poison any average built on top.
 */
export type FuelFeatureSet = {
  readonly trainingDayId: string;
  readonly observationId: string;

  /** False when no food entry backs this day. Everything below is then unusable as intake. */
  readonly logged: boolean;
  readonly entryCount: number;

  readonly energyKcal: number;
  readonly proteinG: number;
  readonly carbohydratesG: number;
  readonly fatG: number;

  // ── Against the athlete's own targets (null when no goal is set) ───────────

  readonly energyGoalKcal: number | null;

  /** Energy the provider credits back from exercise, in kilocalories. */
  readonly exerciseEnergyKcal: number | null;

  /** Goal plus exercise credit — the day's actual allowance. */
  readonly energyBudgetKcal: number | null;

  /** Intake minus budget. Negative means under the allowance. */
  readonly energyBalanceKcal: number | null;

  /** Intake as a share of budget, 1 = exactly on target. */
  readonly energyBudgetRatio: number | null;

  // ── Against body mass (null without a recent weight) ───────────────────────

  readonly proteinGPerKg: number | null;
  readonly carbohydratesGPerKg: number | null;

  /** Body weight used for the per-kilogram ratios (latest within 30 days). */
  readonly referenceWeightKg: number | null;

  /** True when the athlete marked the diary day as finished. */
  readonly diaryComplete: boolean;

  // ── Feature metadata ──────────────────────────────────────────────────────

  readonly confidence: number;
  readonly algorithmId: 'fuel-features-v1';
  readonly sourceObsIds: readonly string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION Feature Set
// (one per training day — aggregated from all active PhysicalConditionObservations)
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionTrend = 'IMPROVING' | 'STABLE' | 'WORSENING';

export type ConditionFeatureSet = {
  readonly trainingDayId: string;

  /** Number of active (unresolved) physical conditions. */
  readonly activeConditionCount: number;

  /**
   * Maximum severity among all active conditions (0–10).
   * 0 when no active conditions exist.
   */
  readonly maxActiveSeverity: number;

  /**
   * True when at least one active condition has affectsTraining=true.
   * Triggers a capacity reduction signal in the Fatigue Model.
   */
  readonly trainingBlockedByCondition: boolean;

  /**
   * Trend of the most severe condition over the last 14 days.
   * Null when insufficient check-in history.
   */
  readonly conditionTrend: ConditionTrend | null;

  // ── Feature metadata ──────────────────────────────────────────────────────

  readonly confidence: number;
  readonly algorithmId: 'condition-features-v1';
  readonly sourceObsIds: readonly string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Persisted Feature Set Record
// (the stored entity — wraps any FeatureSet with lifecycle metadata)
// ─────────────────────────────────────────────────────────────────────────────

export type FeatureSetRecord =
  | SessionFeatureSetRecord
  | LoadFeatureSetRecord
  | RecoveryFeatureSetRecord
  | BodyFeatureSetRecord
  | ConditionFeatureSetRecord
  | FuelFeatureSetRecord;

type FeatureSetRecordBase = {
  readonly id: string;
  readonly athleteId: string;
  readonly version: number; // monotonically increasing
  readonly status: FeatureStatus;
  readonly computedAt: Date | null;
  readonly createdAt: Date;
};

export type SessionFeatureSetRecord = FeatureSetRecordBase & {
  readonly category: 'SESSION';
  readonly sessionObsId: string;
  readonly trainingDayId: string;
  readonly data: SessionFeatureSet;
};

export type LoadFeatureSetRecord = FeatureSetRecordBase & {
  readonly category: 'LOAD';
  readonly trainingDayId: string;
  readonly data: LoadFeatureSet;
};

export type RecoveryFeatureSetRecord = FeatureSetRecordBase & {
  readonly category: 'RECOVERY';
  readonly trainingDayId: string;
  readonly data: RecoveryFeatureSet;
};

export type FuelFeatureSetRecord = FeatureSetRecordBase & {
  readonly category: 'FUEL';
  readonly trainingDayId: string;
  readonly data: FuelFeatureSet;
};

export type BodyFeatureSetRecord = FeatureSetRecordBase & {
  readonly category: 'BODY';
  readonly trainingDayId: string;
  readonly sessionObsId: string; // reused for observationId (body obs ID)
  readonly data: BodyFeatureSet;
};

export type ConditionFeatureSetRecord = FeatureSetRecordBase & {
  readonly category: 'CONDITION';
  readonly trainingDayId: string;
  readonly data: ConditionFeatureSet;
};

// ─────────────────────────────────────────────────────────────────────────────
// Day-level aggregated view
// (consumed by Inference Models — the unit they receive from the FeatureEngine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All features available for a given training day.
 * This is what the Inference Orchestrator hands to each inference model.
 *
 * 'PENDING' means the feature set exists but has not been computed yet
 * (e.g., window computation is still in progress).
 * Models must treat PENDING as unknown — never as zero.
 */
export type DayFeatures = {
  readonly athleteId: string;
  readonly trainingDayId: string;
  readonly retrievedAt: Date;
  readonly sessions: readonly SessionFeatureSet[];
  readonly load: LoadFeatureSet | 'PENDING';
  readonly recovery: RecoveryFeatureSet | 'PENDING';
  readonly body: BodyFeatureSet | 'PENDING';
  readonly condition: ConditionFeatureSet | 'PENDING';
  readonly fuel: FuelFeatureSet | 'PENDING';
};

// ─────────────────────────────────────────────────────────────────────────────
// Input bundles (assembled by FeatureEngine before calling extractors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input bundle for the session extractor.
 * Assembled by the FeatureEngine which resolves the cross-observation join
 * (SESSION + linked SUBJECTIVE) before passing to the pure extractor function.
 */
export type SessionExtractorInput = {
  readonly session: import('../observation/types').SessionObservation;
  /** Null when no SUBJECTIVE observation links to this session. */
  readonly linkedSubjective: import('../observation/types').SubjectiveObservation | null;
  /** Null when no activity stream is cached for this session. */
  readonly stream: {
    readonly aerobicLoadFactor: number | null;
    readonly anaerobicLoadFactor: number | null;
    readonly timeInZones: readonly [number, number, number, number, number] | null;
    readonly hrDriftPercent: number | null;
    readonly paceVariabilityIndex: number | null;
    /** TRIMP summed over the heart-rate samples, on the TSS scale. Optional. */
    readonly hrTrimpTss?: number | null;
  } | null;
};

/**
 * Historical context required by the Recovery extractor.
 * The FeatureEngine loads this from the ObservationRepository before calling the extractor.
 */
export type RecoveryHistory = {
  /** Last 14 days of HRV readings, ordered by timestamp descending. */
  readonly hrv14d: readonly { readonly valueMsRmssd: number; readonly timestamp: Date }[];
  /** Last 14 days of resting HR readings, ordered by timestamp descending. */
  readonly rhr14d: readonly { readonly valueBpm: number; readonly timestamp: Date }[];
  /** Last 14 days of sleep observations, ordered by timestamp descending. */
  readonly sleep14d: readonly {
    readonly totalMinutes: number;
    readonly bedtimeMinFromMidnight?: number;
    readonly timestamp: Date;
  }[];
};

/**
 * Historical context required by the Load extractor.
 * The FeatureEngine loads this from the SessionFeatureSetRecord collection.
 */
export type LoadHistory = {
  /**
   * Per-day TSS entries over the last 42 days.
   * Each entry covers one training day and sums all session tssScores for that day.
   * Days with no training should be represented as 0 TSS (not omitted).
   */
  readonly dailyLoad42d: readonly {
    readonly trainingDayId: string;
    readonly tssScore: number;
    readonly sportBreakdown: { run: number; bike: number; other: number };
  }[];
};

/**
 * Historical context for the Body extractor (trend computation).
 */
export type BodyHistory = {
  readonly measurements7d: readonly {
    readonly weightKg: number;
    readonly fatPercent: number | null;
    readonly timestamp: Date;
  }[];
};

/**
 * Historical context for the Condition extractor.
 */
export type ConditionHistory = {
  /** All currently active PhysicalConditionObservations for the athlete. */
  readonly activeConditions: readonly import('../observation/types').PhysicalConditionObservation[];
  /** Check-in severity readings from the last 14 days for trend calculation. */
  readonly severityHistory14d: readonly { readonly severity: number; readonly timestamp: Date }[];
};
