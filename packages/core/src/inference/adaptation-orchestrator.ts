/**
 * ADAPTATION INTELLIGENCE ORCHESTRATOR
 *
 * Connects the Feature Engine, Adaptation Model, Digital Twin, and Decision Records
 * into a single end-to-end inference pipeline for adaptation.
 *
 * Pipeline for one training day:
 *   1. Resolve DayFeatures from the FeatureEngine
 *   2. Read RecoveryState + FatigueState from Digital Twin
 *   3. Reconstruct adaptation history from last 28 Decision Records
 *   4. Run the Adaptation Model (pure function → no side effects)
 *   5. Persist the Decision Record (immutable audit trail)
 *   6. Update the Digital Twin with the new AdaptationState
 *   7. Return the full result to the caller
 *
 * The orchestrator handles all side effects.
 * The Adaptation Model itself is pure (no database calls, no randomness).
 *
 * Error handling: steps 5-6 failures are non-fatal — inference result is
 * returned regardless of persistence failures.
 */

import { randomUUID } from 'node:crypto';
import { isSet } from '@sharpit/shared/value';

import type { FeatureEngine } from '../features/engine';
import type { DigitalTwinRepository } from '../digital-twin/repository';
import type { DecisionRecordRepository } from './types';

import { runAdaptationModel } from './adaptation/model';
import type { AdaptationModelOutput, AdaptationModelContext } from './adaptation/types';
import type { DecisionRecord } from './types';
import { NEUROMUSCULAR_EFFICIENCY_LOOKBACK_DAYS } from './adaptation/constants';
import { efficiencyTrendPercent } from './adaptation/scoring';

/** Two four-week windows of sessions for the efficiency trend. */
const EFFICIENCY_TREND_LOOKBACK_DAYS = 56;

function subtractTrainingDays(trainingDayId: string, days: number): string {
  const [year, month, day] = trainingDayId.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationInferenceResult = {
  readonly athleteId: string;
  readonly trainingDayId: string;
  readonly output: AdaptationModelOutput;
  readonly decisionRecordId: string | null;
  readonly digitalTwinUpdated: boolean;
  readonly computedAt: Date;
};

// ─────────────────────────────────────────────────────────────────────────────
// Input summary builder
// ─────────────────────────────────────────────────────────────────────────────

function buildInputSummary(
  features: import('../features/types').DayFeatures,
  context: AdaptationModelContext,
): Record<string, unknown> {
  const load = features.load !== 'PENDING' ? features.load : null;
  const recovery = features.recovery !== 'PENDING' ? features.recovery : null;

  return {
    trainingDayId: features.trainingDayId,
    load: load
      ? {
          acwr: load.acwr,
          chronicLoad: load.chronicLoad,
          acuteChronicLoadTrend: load.acuteChronicLoadTrend,
          confidence: load.confidence,
        }
      : null,
    recovery: recovery
      ? {
          hrvDeltaFromBaseline: recovery.hrvDeltaFromBaseline,
          rhrDeltaFromBaseline: recovery.rhrDeltaFromBaseline,
          confidence: recovery.confidence,
        }
      : null,
    sessionCount: features.sessions.length,
    recentAdaptationHistoryLength: context.recentAdaptationHistory.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export type AdaptationOrchestratorDeps = {
  featureEngine: FeatureEngine;
  digitalTwinRepo: DigitalTwinRepository;
  decisionRecordRepo: DecisionRecordRepository;
};

export class AdaptationInferenceOrchestrator {
  constructor(private readonly deps: AdaptationOrchestratorDeps) {}

  /**
   * Run the complete Adaptation Inference pipeline for one training day.
   */
  async run(athleteId: string, trainingDayId: string): Promise<AdaptationInferenceResult> {
    const computedAt = new Date();

    // ── Step 1: Get DayFeatures ────────────────────────────────────────────
    const [features, twin, environmentalImpact] = await Promise.all([
      this.deps.featureEngine.getDayFeatures(athleteId, trainingDayId),
      this.deps.digitalTwinRepo.findOrCreate(athleteId),
      this.deps.digitalTwinRepo.getEnvironmentalImpact(athleteId),
    ]);

    // Neuromuscular efficiency is a multi-day mean (not "today's sessions only").
    const fromDayId = subtractTrainingDays(
      trainingDayId,
      NEUROMUSCULAR_EFFICIENCY_LOOKBACK_DAYS - 1,
    );
    const recentSessions = await this.deps.featureEngine.getSessionFeaturesInRange(
      athleteId,
      fromDayId,
      trainingDayId,
    );
    const featuresForModel = { ...features, sessions: recentSessions };

    // Efficiency is compared over two four-week windows, far beyond the drift's lookback.
    const efficiencySessions = await this.deps.featureEngine.getSessionFeaturesInRange(
      athleteId,
      subtractTrainingDays(trainingDayId, EFFICIENCY_TREND_LOOKBACK_DAYS - 1),
      trainingDayId,
    );

    // ── Step 2: Get context from Digital Twin ──────────────────────────────
    const recoveryState = twin.state.recovery;
    const fatigueState = twin.state.fatigue;

    // ── Step 3: Reconstruct adaptation history from Decision Records ───────
    const { recentAdaptationHistory } = await this.buildAdaptationHistory(athleteId);

    const context: AdaptationModelContext = {
      athleteId,
      trainingDayId,
      recoveryState,
      fatigueState,
      recentAdaptationHistory,
      environmentalImpact,
      efficiencyTrendPercent: efficiencyTrendPercent(efficiencySessions, trainingDayId),
    };

    // ── Step 4: Run the Adaptation Model (pure — no side effects) ─────────
    const output = runAdaptationModel(featuresForModel, context);

    // ── Step 5: Persist Decision Record ───────────────────────────────────
    const recordId = randomUUID();
    let decisionRecordId: string | null = recordId;
    let digitalTwinUpdated = false;

    const record: DecisionRecord = {
      id: recordId,
      athleteId,
      trainingDayId,
      modelId: 'adaptation-v1',
      modelVersion: 'v1',
      confidence: output.adaptationState.confidence,
      signals: output.signals as unknown as Record<string, unknown>,
      stateUpdate: {
        ...output.adaptationState,
        computedAt: output.adaptationState.computedAt.toISOString(),
      } as unknown as Record<string, unknown>,
      decision: output.decision as unknown as Record<string, unknown>,
      recommendation: output.recommendation as unknown as Record<string, unknown>,
      inputSummary: buildInputSummary(featuresForModel, context),
      computedAt,
      createdAt: computedAt,
    };

    try {
      await this.deps.decisionRecordRepo.save(record);
    } catch (err) {
      console.error('[AdaptationOrchestrator] Failed to persist DecisionRecord:', err);
      decisionRecordId = null;
    }

    // ── Step 6: Update Digital Twin ────────────────────────────────────────
    try {
      await this.deps.digitalTwinRepo.updateAdaptation(athleteId, output.adaptationState);
      digitalTwinUpdated = true;
    } catch (err) {
      console.error('[AdaptationOrchestrator] Failed to update Digital Twin:', err);
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
   * Retrieve the current adaptation state without re-running inference.
   */
  async getLatest(
    athleteId: string,
    trainingDayId: string,
  ): Promise<AdaptationInferenceResult | null> {
    const record = await this.deps.decisionRecordRepo.findLatest(
      athleteId,
      'adaptation-v1',
      trainingDayId,
    );
    if (!record) {
      return null;
    }

    const output: AdaptationModelOutput = {
      signals: record.signals as import('./adaptation/types').AdaptationSignals,
      adaptationState: {
        ...(record.stateUpdate as Omit<
          import('../digital-twin/types').AdaptationState,
          'computedAt'
        >),
        computedAt: new Date(
          (record.stateUpdate as { computedAt: string }).computedAt ?? record.computedAt,
        ),
      } as import('../digital-twin/types').AdaptationState,
      decision: record.decision as import('./adaptation/types').AdaptationDecision,
      recommendation:
        record.recommendation as import('./adaptation/types').AdaptationRecommendation,
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

  /**
   * Reconstruct adaptation history from Decision Records.
   * Queries the last 28 adaptation Decision Records to build the context array
   * needed by the Adaptation Model's trend and plateau detection.
   */
  private async buildAdaptationHistory(athleteId: string): Promise<{
    recentAdaptationHistory: readonly number[];
  }> {
    let records: Array<{
      stateUpdate: Record<string, unknown>;
    }> = [];

    try {
      records = (await this.deps.decisionRecordRepo.findRecent(
        athleteId,
        'adaptation-v1',
        28,
      )) as typeof records;
    } catch {
      // findRecent might not be available — return empty history (cold start)
    }

    const history: number[] = [];
    for (const r of records) {
      const idx = (r.stateUpdate as { adaptationIndex?: number | null }).adaptationIndex;
      if (isSet(idx) && idx !== undefined) {
        history.push(idx);
      }
    }

    return { recentAdaptationHistory: history };
  }
}
