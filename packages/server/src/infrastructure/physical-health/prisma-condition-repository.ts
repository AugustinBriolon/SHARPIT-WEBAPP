/**
 * Physical Health — Prisma Condition Repository
 */

import type { PrismaClient } from '@prisma/client';
import type { ConditionRepository } from '@sharpit/core/physical-health/repository';
import type { ConditionInferenceInput } from '@sharpit/core/inference/physical-health/types';
import type { FunctionalImpact } from '@sharpit/core/physical-health/types';

function subtractDays(trainingDayId: string, days: number): string {
  const [year, month, day] = trainingDayId.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function trainingDayEnd(trainingDayId: string): Date {
  return new Date(`${trainingDayId}T23:59:59.999Z`);
}

export class PrismaConditionRepository implements ConditionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAllForInference(
    athleteId: string,
    referenceTrainingDayId: string,
  ): Promise<ConditionInferenceInput[]> {
    const referenceAt = trainingDayEnd(referenceTrainingDayId);

    const rows = await this.prisma.condition.findMany({
      where: { athleteId },
      include: {
        observations: {
          where: { observedAt: { lte: referenceAt } },
          orderBy: { observedAt: 'asc' },
        },
        functionalCapacities: {
          where: { assessedAt: { lte: referenceAt } },
          orderBy: { assessedAt: 'asc' },
        },
        episodes: { orderBy: { episodeNumber: 'asc' } },
      },
      orderBy: { startedAt: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      bodyRegion: row.bodyRegion,
      side: row.side,
      type: row.type,
      affectsTraining: row.affectsTraining,
      startedAt: row.startedAt,
      resolvedAt: row.resolvedAt,
      recurrenceCount: row.recurrenceCount,
      observations: row.observations.map((o) => ({
        id: o.id,
        observedAt: o.observedAt,
        symptomPresent: o.symptomPresent,
        severityReported: o.severityReported,
        functionalImpact: o.functionalImpact as FunctionalImpact | null,
        context: o.context,
      })),
      functionalCapacities: row.functionalCapacities.map((fc) => ({
        id: fc.id,
        observationId: fc.observationId,
        assessedAt: fc.assessedAt,
        painSeverity: fc.painSeverity,
        trainingCapacity: fc.trainingCapacity,
      })),
      episodes: row.episodes.map((ep) => ({
        id: ep.id,
        episodeNumber: ep.episodeNumber,
        status: ep.status,
        startedAt: ep.startedAt,
        resolvedAt: ep.resolvedAt,
      })),
    }));
  }

  async getConditionHistoryForFeatures(
    athleteId: string,
    referenceTrainingDayId: string,
  ): Promise<{
    activeConditions: Array<{ id: string; severity: number; affectsTraining: boolean }>;
    severityHistory14d: Array<{ severity: number; timestamp: Date }>;
  }> {
    const referenceAt = trainingDayEnd(referenceTrainingDayId);
    const from14d = subtractDays(referenceTrainingDayId, 14);
    const fromAt = new Date(`${from14d}T00:00:00Z`);

    const rows = await this.prisma.condition.findMany({
      where: { athleteId, status: { not: 'RESOLVED' } },
      include: {
        observations: {
          where: {
            observedAt: { gte: fromAt, lte: referenceAt },
            symptomPresent: true,
            severityReported: { not: null },
          },
          orderBy: { observedAt: 'asc' },
        },
      },
    });

    const activeConditions = rows
      .filter((r) => r.severity > 0 || r.observations.length > 0)
      .map((r) => ({
        id: r.id,
        severity: r.severity,
        affectsTraining: r.affectsTraining,
      }));

    const severityHistory14d = rows.flatMap((r) =>
      r.observations.map((o) => ({
        severity: o.severityReported as number,
        timestamp: o.observedAt,
      })),
    );

    return { activeConditions, severityHistory14d };
  }

  async applyInferredUpdates(
    athleteId: string,
    updates: Parameters<ConditionRepository['applyInferredUpdates']>[1],
  ): Promise<void> {
    for (const u of updates) {
      // updateMany so the athlete scope is part of the match: another athlete's row is untouched.
      await this.prisma.condition.updateMany({
        where: { id: u.conditionId, athleteId },
        data: {
          severity: u.severity,
          status: u.status as import('@prisma/client').ConditionStatus,
          confidence: u.confidence,
          estimatedRecoveryDays: u.estimatedRecoveryDays,
          recurrenceCount: u.recurrenceCount,
          lastObservationAt: u.lastObservationAt,
        },
      });
    }
  }
}
