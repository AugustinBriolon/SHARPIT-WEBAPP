/**
 * PHYSICAL HEALTH ORCHESTRATOR
 *
 * Pipeline:
 *   1. Load conditions + observations from ConditionRepository
 *   2. Run Physical Health Model (pure)
 *   3. Persist DecisionRecord
 *   4. Update Digital Twin physicalHealthState
 *   5. Apply inferred updates to Condition rows
 */

import { randomUUID } from 'node:crypto';

import type { DigitalTwinRepository } from '../digital-twin/repository';
import type { ConditionRepository } from '../physical-health/repository';
import type { DecisionRecordRepository } from './types';
import type { DecisionRecord } from './types';

import { runPhysicalHealthModel } from './physical-health/model';
import type {
  PhysicalHealthModelContext,
  PhysicalHealthModelOutput,
} from './physical-health/types';

export type PhysicalHealthInferenceResult = {
  readonly athleteId: string;
  readonly trainingDayId: string;
  readonly output: PhysicalHealthModelOutput;
  readonly decisionRecordId: string | null;
  readonly digitalTwinUpdated: boolean;
  readonly conditionsUpdated: boolean;
  readonly computedAt: Date;
};

export type PhysicalHealthOrchestratorDeps = {
  conditionRepo: ConditionRepository;
  digitalTwinRepo: DigitalTwinRepository;
  decisionRecordRepo: DecisionRecordRepository;
};

function buildInputSummary(context: PhysicalHealthModelContext): Record<string, unknown> {
  return {
    trainingDayId: context.trainingDayId,
    conditionCount: context.conditions.length,
    totalObservations: context.conditions.reduce((n, c) => n + c.observations.length, 0),
    referenceAt: context.referenceAt.toISOString(),
  };
}

function latestObservationAt(
  conditions: PhysicalHealthModelContext['conditions'],
  conditionId: string,
): Date | null {
  const condition = conditions.find((c) => c.id === conditionId);
  if (!condition || condition.observations.length === 0) {
    return null;
  }
  return condition.observations.reduce(
    (latest, o) => (o.observedAt > latest ? o.observedAt : latest),
    condition.observations[0].observedAt,
  );
}

export class PhysicalHealthInferenceOrchestrator {
  constructor(private readonly deps: PhysicalHealthOrchestratorDeps) {}

  async run(athleteId: string, trainingDayId: string): Promise<PhysicalHealthInferenceResult> {
    const computedAt = new Date();
    const referenceAt = new Date(`${trainingDayId}T23:59:59.999Z`);

    const conditions = await this.deps.conditionRepo.findAllForInference(athleteId, trainingDayId);

    const context: PhysicalHealthModelContext = {
      athleteId,
      trainingDayId,
      referenceAt,
      conditions,
    };

    const output = runPhysicalHealthModel(context);

    const recordId = randomUUID();
    let decisionRecordId: string | null = recordId;
    let digitalTwinUpdated = false;
    let conditionsUpdated = false;

    const record: DecisionRecord = {
      id: recordId,
      athleteId,
      trainingDayId,
      modelId: 'physical-health-v1',
      modelVersion: 'v1',
      confidence: output.physicalHealthState.confidence,
      signals: output.signals as unknown as Record<string, unknown>,
      stateUpdate: {
        ...output.physicalHealthState,
        computedAt: output.physicalHealthState.computedAt.toISOString(),
      } as unknown as Record<string, unknown>,
      decision: output.decision as unknown as Record<string, unknown>,
      recommendation: output.recommendation as unknown as Record<string, unknown>,
      inputSummary: buildInputSummary(context),
      computedAt,
      createdAt: computedAt,
    };

    try {
      await this.deps.decisionRecordRepo.save(record);
    } catch (err) {
      console.error('[PhysicalHealthOrchestrator] Failed to persist DecisionRecord:', err);
      decisionRecordId = null;
    }

    try {
      await this.deps.digitalTwinRepo.updatePhysicalHealth(athleteId, output.physicalHealthState);
      digitalTwinUpdated = true;
    } catch (err) {
      console.error('[PhysicalHealthOrchestrator] Failed to update Digital Twin:', err);
    }

    try {
      await this.deps.conditionRepo.applyInferredUpdates(
        athleteId,
        output.conditionUpdates.map((u) => ({
          ...u,
          lastObservationAt: latestObservationAt(conditions, u.conditionId),
        })),
      );
      conditionsUpdated = true;
    } catch (err) {
      console.error('[PhysicalHealthOrchestrator] Failed to update Condition rows:', err);
    }

    return {
      athleteId,
      trainingDayId,
      output,
      decisionRecordId,
      digitalTwinUpdated,
      conditionsUpdated,
      computedAt,
    };
  }

  async getLatest(
    athleteId: string,
    trainingDayId: string,
  ): Promise<PhysicalHealthInferenceResult | null> {
    const record = await this.deps.decisionRecordRepo.findLatest(
      athleteId,
      'physical-health-v1',
      trainingDayId,
    );
    if (!record) {
      return null;
    }

    const output: PhysicalHealthModelOutput = {
      signals: record.signals as PhysicalHealthModelOutput['signals'],
      physicalHealthState: {
        ...(record.stateUpdate as Omit<
          PhysicalHealthModelOutput['physicalHealthState'],
          'computedAt'
        >),
        computedAt: new Date(
          (record.stateUpdate as { computedAt: string }).computedAt ?? record.computedAt,
        ),
      },
      decision: record.decision as PhysicalHealthModelOutput['decision'],
      recommendation: record.recommendation as PhysicalHealthModelOutput['recommendation'],
      conditionUpdates: [],
    };

    return {
      athleteId,
      trainingDayId,
      output,
      decisionRecordId: record.id,
      digitalTwinUpdated: true,
      conditionsUpdated: false,
      computedAt: record.computedAt,
    };
  }
}
