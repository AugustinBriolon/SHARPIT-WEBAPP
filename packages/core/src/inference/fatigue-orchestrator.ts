/**
 * FATIGUE INTELLIGENCE ORCHESTRATOR
 *
 * Connects the Feature Engine, Fatigue Model, Digital Twin, and Decision Records
 * into a single end-to-end inference pipeline for fatigue.
 *
 * Pipeline for one training day:
 *   1. Resolve DayFeatures from the FeatureEngine
 *   2. Read previous FatigueState + RecoveryState from Digital Twin
 *   3. Reconstruct fatigue history (consecutive accumulation days + recent indices)
 *   4. Run the Fatigue Model (pure function → no side effects)
 *   5. Persist the Decision Record (immutable audit trail)
 *   6. Update the Digital Twin with the new FatigueState
 *   7. Return the full result to the caller
 *
 * The orchestrator handles all side effects.
 * The Fatigue Model itself is pure (no database calls, no randomness).
 *
 * Error handling: steps 5-6 failures are non-fatal — inference result is
 * returned regardless of persistence failures.
 */

import { randomUUID } from 'node:crypto';
import { isSet } from '@sharpit/shared/value';

import type { FeatureEngine } from '../features/engine';
import type { DigitalTwinRepository } from '../digital-twin/repository';
import type { DecisionRecordRepository } from './types';

import { runFatigueModel } from './fatigue/model';
import { addTrainingDays } from '../training/training-day';
import type { FatigueModelOutput, FatigueModelContext } from './fatigue/types';
import type { DecisionRecord } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export type FatigueInferenceResult = {
  readonly athleteId: string;
  readonly trainingDayId: string;
  readonly output: FatigueModelOutput;
  readonly decisionRecordId: string | null;
  readonly digitalTwinUpdated: boolean;
  readonly computedAt: Date;
};

// ─────────────────────────────────────────────────────────────────────────────
// Input summary builder
// ─────────────────────────────────────────────────────────────────────────────

function buildInputSummary(
  features: import('../features/types').DayFeatures,
  context: FatigueModelContext,
): Record<string, unknown> {
  const load = features.load !== 'PENDING' ? features.load : null;
  const recovery = features.recovery !== 'PENDING' ? features.recovery : null;

  return {
    trainingDayId: features.trainingDayId,
    load: load
      ? {
          acwr: load.acwr,
          acuteLoad: load.acuteLoad,
          chronicLoad: load.chronicLoad,
          loadMonotony: load.loadMonotony,
          confidence: load.confidence,
        }
      : null,
    recovery: recovery
      ? {
          sleepDebtMin: recovery.sleepDebtMin,
          subjectiveWellnessIndex: recovery.subjectiveWellnessIndex,
          confidence: recovery.confidence,
        }
      : null,
    sessionCount: features.sessions.length,
    consecutiveAccumulationDays: context.consecutiveAccumulationDays,
    recentHistoryLength: context.recentFatigueHistory.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export type FatigueOrchestratorDeps = {
  featureEngine: FeatureEngine;
  digitalTwinRepo: DigitalTwinRepository;
  decisionRecordRepo: DecisionRecordRepository;
};

export class FatigueInferenceOrchestrator {
  constructor(private readonly deps: FatigueOrchestratorDeps) {}

  /**
   * Run the complete Fatigue Inference pipeline for one training day.
   */
  async run(athleteId: string, trainingDayId: string): Promise<FatigueInferenceResult> {
    const computedAt = new Date();

    // ── Step 1: Get DayFeatures ────────────────────────────────────────────
    const [features, previousFatigueState, environmentalImpact] = await Promise.all([
      this.deps.featureEngine.getDayFeatures(athleteId, trainingDayId),
      this.deps.digitalTwinRepo.getPreviousFatigueState(athleteId),
      this.deps.digitalTwinRepo.getEnvironmentalImpact(athleteId),
    ]);

    // ── Step 2: Get context from Digital Twin ──────────────────────────────
    const recoveryState = (await this.deps.digitalTwinRepo.findOrCreate(athleteId)).state.recovery;

    // ── Step 3: Reconstruct fatigue history from Decision Records ──────────
    const { consecutiveAccumulationDays, recentFatigueHistory } = await this.buildFatigueHistory(
      athleteId,
      previousFatigueState,
    );

    const context: FatigueModelContext = {
      athleteId,
      trainingDayId,
      recoveryState,
      consecutiveAccumulationDays,
      recentFatigueHistory,
      environmentalImpact,
      priorSessions: await this.loadPriorSessions(athleteId, trainingDayId),
    };

    // ── Step 4: Run the Fatigue Model (pure — no side effects) ────────────
    const output = runFatigueModel(features, context);

    // ── Step 5: Persist Decision Record ───────────────────────────────────
    const recordId = randomUUID();
    let decisionRecordId: string | null = recordId;
    let digitalTwinUpdated = false;

    const record: DecisionRecord = {
      id: recordId,
      athleteId,
      trainingDayId,
      modelId: 'fatigue-v1',
      modelVersion: 'v1',
      confidence: output.fatigueState.confidence,
      signals: output.signals as unknown as Record<string, unknown>,
      stateUpdate: {
        ...output.fatigueState,
        computedAt: output.fatigueState.computedAt.toISOString(),
      } as unknown as Record<string, unknown>,
      decision: output.decision as unknown as Record<string, unknown>,
      recommendation: output.recommendation as unknown as Record<string, unknown>,
      inputSummary: buildInputSummary(features, context),
      computedAt,
      createdAt: computedAt,
    };

    try {
      await this.deps.decisionRecordRepo.save(record);
    } catch (err) {
      console.error('[FatigueOrchestrator] Failed to persist DecisionRecord:', err);
      decisionRecordId = null;
    }

    // ── Step 6: Update Digital Twin ────────────────────────────────────────
    try {
      await this.deps.digitalTwinRepo.updateFatigue(athleteId, output.fatigueState);
      digitalTwinUpdated = true;
    } catch (err) {
      console.error('[FatigueOrchestrator] Failed to update Digital Twin:', err);
    }

    return {
      athleteId,
      trainingDayId,
      output,
      decisionRecordId,
      digitalTwinUpdated,
      computedAt,
    };
  }

  /**
   * Retrieve the current fatigue state without re-running inference.
   */
  async getLatest(
    athleteId: string,
    trainingDayId: string,
  ): Promise<FatigueInferenceResult | null> {
    const record = await this.deps.decisionRecordRepo.findLatest(
      athleteId,
      'fatigue-v1',
      trainingDayId,
    );
    if (!record) {
      return null;
    }

    const output: FatigueModelOutput = {
      signals: record.signals as import('./fatigue/types').FatigueSignals,
      fatigueState: {
        ...(record.stateUpdate as Omit<import('./fatigue/types').FatigueState, 'computedAt'>),
        computedAt: new Date(
          (record.stateUpdate as { computedAt: string }).computedAt ?? record.computedAt,
        ),
      } as import('./fatigue/types').FatigueState,
      decision: record.decision as import('./fatigue/types').FatigueDecision,
      recommendation: record.recommendation as import('./fatigue/types').FatigueRecommendation,
    };

    return {
      athleteId,
      trainingDayId,
      output,
      decisionRecordId: record.id,
      digitalTwinUpdated: true,
      computedAt: record.computedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Sessions of the two days before, whose stress the model still carries in part. */
  private async loadPriorSessions(
    athleteId: string,
    trainingDayId: string,
  ): Promise<NonNullable<FatigueModelContext['priorSessions']>> {
    const days = await Promise.all(
      [1, 2].map(async (daysAgo) => {
        const features = await this.deps.featureEngine.getDayFeatures(
          athleteId,
          addTrainingDays(trainingDayId, -daysAgo),
        );
        return features.sessions.map((session) => ({ daysAgo, session }));
      }),
    );
    return days.flat();
  }

  /**
   * Reconstruct fatigue history context from Decision Records.
   * Queries the last 14 fatigue Decision Records to build the context arrays
   * needed by the Fatigue Model's CumulativeTrajectory dimension.
   */
  private async buildFatigueHistory(
    athleteId: string,
    previousFatigueState: import('./fatigue/types').FatigueState | null,
  ): Promise<{
    consecutiveAccumulationDays: number;
    recentFatigueHistory: readonly number[];
  }> {
    const ACCUMULATION_THRESHOLD = 55;
    const records = await this.loadRecentFatigueRecords(athleteId);

    if (records.length === 0) {
      return this.coldStartFatigueHistory(previousFatigueState, ACCUMULATION_THRESHOLD);
    }

    const history = this.extractFatigueHistory(records);
    return {
      consecutiveAccumulationDays: this.countConsecutiveAccumulationDays(
        history,
        ACCUMULATION_THRESHOLD,
      ),
      recentFatigueHistory: history,
    };
  }

  private async loadRecentFatigueRecords(athleteId: string): Promise<
    Array<{
      stateUpdate: Record<string, unknown>;
    }>
  > {
    try {
      return (await this.deps.decisionRecordRepo.findRecent(athleteId, 'fatigue-v1', 14)) as Array<{
        stateUpdate: Record<string, unknown>;
      }>;
    } catch {
      return [];
    }
  }

  private coldStartFatigueHistory(
    previousFatigueState: import('./fatigue/types').FatigueState | null,
    accumulationThreshold: number,
  ): {
    consecutiveAccumulationDays: number;
    recentFatigueHistory: readonly number[];
  } {
    if (!previousFatigueState) {
      return { consecutiveAccumulationDays: 0, recentFatigueHistory: [] };
    }

    const idx = previousFatigueState.fatigueIndex;
    if (idx === undefined || idx === null) {
      return { consecutiveAccumulationDays: 0, recentFatigueHistory: [] };
    }

    return {
      consecutiveAccumulationDays: idx > accumulationThreshold ? 1 : 0,
      recentFatigueHistory: [idx],
    };
  }

  private extractFatigueHistory(
    records: Array<{ stateUpdate: Record<string, unknown> }>,
  ): number[] {
    const history: number[] = [];
    for (const record of records) {
      const idx = (record.stateUpdate as { fatigueIndex?: number | null }).fatigueIndex;
      if (isSet(idx) && idx !== undefined) {
        history.push(idx);
      }
    }
    return history;
  }

  private countConsecutiveAccumulationDays(
    history: readonly number[],
    accumulationThreshold: number,
  ): number {
    let consecutiveAccumulationDays = 0;
    for (const value of history) {
      if (value > accumulationThreshold) {
        consecutiveAccumulationDays++;
      } else {
        break;
      }
    }
    return consecutiveAccumulationDays;
  }
}
