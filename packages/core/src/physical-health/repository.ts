/**
 * Physical Health — Condition Repository Port
 *
 * Loads persisted conditions + observations for inference. Every method is scoped to one
 * athlete: an unscoped read once fed every athlete's conditions into every other athlete's
 * physical-health state (ADR-093).
 */

import type { ConditionInferenceInput } from '../inference/physical-health/types';

export interface ConditionRepository {
  /** The athlete's conditions with observations for inference (including resolved history). */
  findAllForInference(
    athleteId: string,
    referenceTrainingDayId: string,
  ): Promise<ConditionInferenceInput[]>;

  /** Feature-engine compatible history from persisted conditions. */
  getConditionHistoryForFeatures(
    athleteId: string,
    referenceTrainingDayId: string,
  ): Promise<{
    activeConditions: Array<{
      id: string;
      severity: number;
      affectsTraining: boolean;
    }>;
    severityHistory14d: Array<{ severity: number; timestamp: Date }>;
  }>;

  /** Persist inferred state back to the athlete's own Condition rows. */
  applyInferredUpdates(
    athleteId: string,
    updates: readonly {
      conditionId: string;
      severity: number;
      status: string;
      confidence: number;
      estimatedRecoveryDays: number | null;
      recurrenceCount: number;
      lastObservationAt: Date | null;
    }[],
  ): Promise<void>;
}
