/**
 * INFERENCE LAYER — Prisma DecisionRecord Repository
 *
 * Implements the DecisionRecordRepository port.
 * One record per (athlete, model, training day): a re-run replaces the day's record
 * (ADR-125). History is the sequence of days, not of runs.
 */

import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  DecisionRecordRepository,
  DecisionRecord,
  ModelId,
} from '@sharpit/core/inference/types';

export class PrismaDecisionRecordRepository implements DecisionRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: DecisionRecord): Promise<void> {
    const data = {
      id: record.id || randomUUID(),
      athleteId: record.athleteId,
      trainingDayId: record.trainingDayId,
      modelId: record.modelId,
      modelVersion: record.modelVersion,
      confidence: record.confidence,
      signals: record.signals as object,
      stateUpdate: record.stateUpdate as object,
      decision: record.decision as object,
      recommendation: record.recommendation as object,
      explanation: record.explanation ?? '',
      inputSummary: record.inputSummary as object,
      computedAt: record.computedAt,
      createdAt: record.createdAt,
    };
    await this.prisma.decisionRecord.upsert({
      where: {
        athleteId_modelId_trainingDayId: {
          athleteId: record.athleteId,
          modelId: record.modelId,
          trainingDayId: record.trainingDayId,
        },
      },
      create: data,
      // The id moves too: callers keep the id of the run they just made.
      update: data,
    });
  }

  async findLatest(
    athleteId: string,
    modelId: ModelId,
    trainingDayId: string,
  ): Promise<DecisionRecord | null> {
    const row = await this.prisma.decisionRecord.findFirst({
      where: { athleteId, modelId, trainingDayId },
      orderBy: { computedAt: 'desc' },
    });

    return row ? this.toDomain(row) : null;
  }

  async findByRange(
    athleteId: string,
    fromTrainingDayId: string,
    toTrainingDayId: string,
  ): Promise<DecisionRecord[]> {
    const rows = await this.prisma.decisionRecord.findMany({
      where: {
        athleteId,
        trainingDayId: {
          gte: fromTrainingDayId,
          lte: toTrainingDayId,
        },
      },
      orderBy: { computedAt: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async findRecent(athleteId: string, modelId: ModelId, limit: number): Promise<DecisionRecord[]> {
    const rows = await this.prisma.decisionRecord.findMany({
      where: { athleteId, modelId },
      orderBy: { computedAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: {
    id: string;
    athleteId: string;
    trainingDayId: string;
    modelId: string;
    modelVersion: string;
    confidence: number;
    // Prisma returns JsonValue for Json columns
    signals: unknown;
    stateUpdate: unknown;
    decision: unknown;
    recommendation: unknown;
    explanation: string | null;
    inputSummary: unknown;
    computedAt: Date;
    createdAt: Date;
  }): DecisionRecord {
    return {
      id: row.id,
      athleteId: row.athleteId,
      trainingDayId: row.trainingDayId,
      modelId: row.modelId as ModelId,
      modelVersion: row.modelVersion,
      confidence: row.confidence,
      signals: (row.signals ?? {}) as Record<string, unknown>,
      stateUpdate: (row.stateUpdate ?? {}) as Record<string, unknown>,
      decision: (row.decision ?? {}) as Record<string, unknown>,
      recommendation: (row.recommendation ?? {}) as Record<string, unknown>,
      explanation: row.explanation ?? undefined,
      inputSummary: (row.inputSummary ?? {}) as Record<string, unknown>,
      computedAt: row.computedAt,
      createdAt: row.createdAt,
    };
  }
}
