/**
 * FATIGUE MODEL v1 — Domain Types
 *
 * Types specific to the Fatigue Intelligence Model.
 * Implements the type contracts defined in docs/models/FATIGUE_MODEL.md §5–7.
 *
 * Key design: fatigue ≠ recovery. These are complementary dimensions.
 * See FATIGUE_MODEL.md §2.1 for the four-state matrix.
 */

import type { SessionFeatureSet } from '../../features/types';
import type {
  OverreachingRisk,
  DataCompleteness,
  DimensionResult,
  FatigueLevel,
  FatigueType,
  FatigueTrajectory,
  TrainingCapacity,
  FatigueDominantDimension,
  FatigueState,
} from '../../digital-twin/types';
import type { RecoveryState } from '../../digital-twin/types';
import type { I18nItem, DimensionScore } from '../shared/types';

export type { DimensionScore };

// ─────────────────────────────────────────────────────────────────────────────
// Re-export digital twin types for convenience
// ─────────────────────────────────────────────────────────────────────────────

export type {
  OverreachingRisk,
  DataCompleteness,
  DimensionResult,
  RecoveryState,
  FatigueLevel,
  FatigueType,
  FatigueTrajectory,
  TrainingCapacity,
  FatigueDominantDimension,
  FatigueState,
};

// ─────────────────────────────────────────────────────────────────────────────
// Ephemeral signals (per FATIGUE_MODEL.md §5, ADR-004)
// ─────────────────────────────────────────────────────────────────────────────

export type FatigueSignals = {
  readonly fatigueLevel: FatigueLevel;
  readonly fatigueType: FatigueType;
  readonly fatigueTrajectory: FatigueTrajectory;

  readonly dominantFatigueDimension: FatigueDominantDimension;
  readonly primaryLimitingFactor: string;

  readonly functionalOverreachingRisk: OverreachingRisk;
  readonly estimatedTimeToFresh: number | null;
  readonly performanceImpairmentEstimate: number;
  readonly trainingCapacity: TrainingCapacity;

  readonly isAccumulating: boolean;
  readonly consecutiveAccumulationDays: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Decision and Recommendation
// ─────────────────────────────────────────────────────────────────────────────

export type FatigueVerdict =
  | 'BUILD' // increase training load safely
  | 'MAINTAIN' // sustain current load
  | 'REDUCE' // reduce intensity or volume
  | 'REST_WEEK' // full deload week recommended
  | 'TAPER' // race-preparation reduction
  | 'INSUFFICIENT_DATA';

export type FatigueDecision = {
  readonly verdict: FatigueVerdict;
  readonly trainingCapacity: TrainingCapacity;
  /** Localizable evidence points driving this decision (max 3). */
  readonly rationale: readonly I18nItem[];
};

export type FatigueRecommendation = {
  readonly type: FatigueVerdict;
  /** 2–3 localizable evidence items surfaced to the athlete. */
  readonly keyEvidence: readonly I18nItem[];
  readonly confidence: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Model output
// ─────────────────────────────────────────────────────────────────────────────

export type FatigueModelOutput = {
  readonly signals: FatigueSignals;
  readonly fatigueState: FatigueState;
  readonly decision: FatigueDecision;
  readonly recommendation: FatigueRecommendation;
};

// ─────────────────────────────────────────────────────────────────────────────
// Model context (non-feature inputs — from Digital Twin)
// ─────────────────────────────────────────────────────────────────────────────

import type { EnvironmentalImpact } from '../../environment';

export type FatigueModelContext = {
  readonly trainingDayId: string;
  readonly athleteId: string;

  /**
   * Recovery state from the Digital Twin (from the last Recovery Model run).
   * Used for the Neuromuscular dimension (autonomic score) and Cumulative
   * dimension (sleepDebt, dissonance).
   * Null on cold start before the Recovery Model has run.
   */
  readonly recoveryState: RecoveryState | null;

  /**
   * Number of consecutive days with FatigueIndex > 55 ending with yesterday.
   * Drives the CumulativeTrajectory dimension's accumulation pressure.
   * 0 on cold start (no history).
   */
  readonly consecutiveAccumulationDays: number;

  /**
   * FatigueIndex values for the last 14 days (most recent first), excluding today.
   * Used to compute trajectory direction (RESOLVING / STABLE / ACCUMULATING).
   * Empty array on cold start.
   */
  readonly recentFatigueHistory: readonly number[];

  /** Optional overlay from Environmental Context Engine. */
  readonly environmentalImpact?: EnvironmentalImpact | null;

  /** Sessions of the two days before this one, whose stress is still partly carried. */
  readonly priorSessions?: ReadonlyArray<{
    readonly daysAgo: number;
    readonly session: SessionFeatureSet;
  }>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal scoring types (used within scoring.ts only)
// ─────────────────────────────────────────────────────────────────────────────

export type ScoredFatigueDimensions = {
  readonly load: DimensionScore;
  readonly neuromuscular: DimensionScore;
  readonly metabolic: DimensionScore;
  readonly cumulative: DimensionScore;
  readonly psychological: DimensionScore;
};
