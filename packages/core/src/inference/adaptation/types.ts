/**
 * ADAPTATION MODEL v1 — Domain Types
 *
 * Types specific to the Adaptation Intelligence Model.
 * Implements the type contracts defined in docs/models/ADAPTATION_MODEL.md §5–6.
 *
 * Key design: adaptation ≠ fatigue ≠ recovery.
 * See ADAPTATION_MODEL.md §2 for the conceptual distinction.
 */

import type {
  DataCompleteness,
  DimensionResult,
  RecoveryState,
  FatigueState,
} from '../../digital-twin/types';
import type { I18nItem, AdaptationDimensionScore as DimensionScore } from '../shared/types';

export type { DimensionScore };

// ─────────────────────────────────────────────────────────────────────────────
// Re-export digital twin types for convenience
// ─────────────────────────────────────────────────────────────────────────────

export type { DataCompleteness, DimensionResult, RecoveryState, FatigueState };
export type { AdaptationStatus, AdaptationTrend, AdaptationState } from '../../digital-twin/types';

// ─────────────────────────────────────────────────────────────────────────────
// Ephemeral signals (per ADAPTATION_MODEL.md §5, ADR-004)
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationSignals = {
  readonly adaptationIndex: number | null;
  readonly adaptationStatus: import('../../digital-twin/types').AdaptationStatus;
  readonly adaptationTrend: import('../../digital-twin/types').AdaptationTrend;
  readonly dimensionScores: {
    readonly loadProgression: number | null;
    readonly neuromuscularEfficiency: number | null;
    readonly autonomicAdaptation: number | null;
    readonly recoveryQuality: number | null;
  };
  readonly plateauRisk: boolean;
  readonly overreachingWithoutAdaptationDetected: boolean;
  readonly availableDimensionCount: number;
  readonly totalAvailableWeight: number;
  readonly confidence: number;
  readonly historyLength: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Decision and Recommendation
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationVerdict =
  | 'INCREASE_LOAD'
  | 'SUSTAIN'
  | 'CONSOLIDATE'
  | 'REDUCE_LOAD'
  | 'RECOVERY_PRIORITY'
  | 'INSUFFICIENT_DATA';

export type AdaptationDecision = {
  readonly verdict: AdaptationVerdict;
  readonly loadMultiplier: number;
  readonly rationale: readonly I18nItem[];
};

export type AdaptationRecommendation = {
  readonly type: AdaptationVerdict;
  readonly keyEvidence: readonly I18nItem[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Model output
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationModelOutput = {
  readonly signals: AdaptationSignals;
  readonly adaptationState: import('../../digital-twin/types').AdaptationState;
  readonly decision: AdaptationDecision;
  readonly recommendation: AdaptationRecommendation;
};

// ─────────────────────────────────────────────────────────────────────────────
// Model context (non-feature inputs — from Digital Twin + history)
// ─────────────────────────────────────────────────────────────────────────────

import type { EnvironmentalImpact } from '../../environment';

export type AdaptationModelContext = {
  readonly trainingDayId: string;
  readonly athleteId: string;

  /**
   * Current RecoveryState from the Digital Twin (Recovery Intelligence output).
   * Used for recoveryQuality dimension.
   * Null on cold start before Recovery Model has run.
   */
  readonly recoveryState: RecoveryState | null;

  /**
   * Current FatigueState from the Digital Twin (Fatigue Intelligence output).
   * Used for recoveryQuality dimension and overreaching detection.
   * Null on cold start before Fatigue Model has run.
   */
  readonly fatigueState: FatigueState | null;

  /**
   * AdaptationIndex values for the last 28 days (most recent first), excluding today.
   * Used to compute adaptationTrend and detect plateau patterns.
   * Empty array on cold start.
   */
  readonly recentAdaptationHistory: readonly number[];

  /**
   * Change of the efficiency factor over the last four weeks against the four before,
   * in percent. Null or absent when there are too few like sessions to compare.
   */
  readonly efficiencyTrendPercent?: number | null;

  /** Optional overlay from Environmental Context Engine. */
  readonly environmentalImpact?: EnvironmentalImpact | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal scoring types (used within scoring.ts only)
// ─────────────────────────────────────────────────────────────────────────────

export type ScoredAdaptationDimensions = {
  readonly loadProgression: DimensionScore;
  readonly neuromuscularEfficiency: DimensionScore;
  readonly autonomicAdaptation: DimensionScore;
  readonly recoveryQuality: DimensionScore;
};
