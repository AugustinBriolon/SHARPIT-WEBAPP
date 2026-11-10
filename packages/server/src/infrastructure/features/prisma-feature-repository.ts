/**
 * FEATURE REPOSITORY — Prisma Implementation
 *
 * Concrete implementation of the FeatureRepository port using Prisma.
 * Translates between the domain's FeatureSetRecord types and Prisma's
 * FeatureSet model rows.
 *
 * Invariants enforced here:
 *   - Only the latest version with status COMPUTED is returned by query methods.
 *   - Versions are monotonically increasing — never reused.
 *   - invalidateForTrainingDay performs a bulk status update (COMPUTED → INVALIDATED).
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import { FUEL_BODY_WEIGHT_LOOKBACK_DAYS } from '@sharpit/core/features/extractors/fuel-extractor';
import type { FeatureRepository } from '@sharpit/core/features/repository';
import type {
  BodyFeatureSet,
  BodyFeatureSetRecord,
  FuelFeatureSet,
  FuelFeatureSetRecord,
  ConditionFeatureSet,
  ConditionFeatureSetRecord,
  FeatureCategory,
  FeatureSetRecord,
  FeatureStatus,
  LoadFeatureSet,
  LoadFeatureSetRecord,
  RecoveryFeatureSet,
  RecoveryFeatureSetRecord,
  SessionFeatureSet,
  SessionFeatureSetRecord,
} from '@sharpit/core/features/types';

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row → Domain type mapping
// ─────────────────────────────────────────────────────────────────────────────

type PrismaFeatureSetRow = {
  id: string;
  athleteId: string;
  category: string;
  trainingDayId: string | null;
  sessionObsId: string | null;
  version: number;
  status: string;
  confidence: number;
  algorithmId: string;
  data: unknown;
  sourceObsIds: string[];
  computedAt: Date | null;
  createdAt: Date;
};

function toSessionRecord(row: PrismaFeatureSetRow): SessionFeatureSetRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    category: 'SESSION',
    sessionObsId: row.sessionObsId!,
    trainingDayId: row.trainingDayId!,
    version: row.version,
    status: row.status as FeatureStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    data: row.data as SessionFeatureSet,
  };
}

function toLoadRecord(row: PrismaFeatureSetRow): LoadFeatureSetRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    category: 'LOAD',
    trainingDayId: row.trainingDayId!,
    version: row.version,
    status: row.status as FeatureStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    data: row.data as LoadFeatureSet,
  };
}

function toRecoveryRecord(row: PrismaFeatureSetRow): RecoveryFeatureSetRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    category: 'RECOVERY',
    trainingDayId: row.trainingDayId!,
    version: row.version,
    status: row.status as FeatureStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    data: row.data as RecoveryFeatureSet,
  };
}

function toFuelRecord(row: PrismaFeatureSetRow): FuelFeatureSetRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    category: 'FUEL',
    trainingDayId: row.trainingDayId!,
    version: row.version,
    status: row.status as FeatureStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    data: row.data as FuelFeatureSet,
  };
}

function toBodyRecord(row: PrismaFeatureSetRow): BodyFeatureSetRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    category: 'BODY',
    trainingDayId: row.trainingDayId!,
    sessionObsId: row.sessionObsId!,
    version: row.version,
    status: row.status as FeatureStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    data: row.data as BodyFeatureSet,
  };
}

function toConditionRecord(row: PrismaFeatureSetRow): ConditionFeatureSetRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    category: 'CONDITION',
    trainingDayId: row.trainingDayId!,
    version: row.version,
    status: row.status as FeatureStatus,
    computedAt: row.computedAt,
    createdAt: row.createdAt,
    data: row.data as ConditionFeatureSet,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 42-day window bound helper
// ─────────────────────────────────────────────────────────────────────────────

/** Return a YYYY-MM-DD string N days before the given day ID. */
function subtractDays(trainingDayId: string, days: number): string {
  const [year, month, day] = trainingDayId.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function addDays(trainingDayId: string, days: number): string {
  const [year, month, day] = trainingDayId.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository implementation
// ─────────────────────────────────────────────────────────────────────────────

export class PrismaFeatureRepository implements FeatureRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(record: FeatureSetRecord): Promise<void> {
    const base = {
      athleteId: record.athleteId,
      category: record.category,
      version: record.version,
      status: record.status,
      confidence: record.data.confidence,
      algorithmId: record.data.algorithmId,
      data: record.data as unknown as Prisma.InputJsonValue,
      sourceObsIds: [...record.data.sourceObsIds],
      computedAt: record.computedAt ?? null,
    };

    const trainingDayId = 'trainingDayId' in record ? record.trainingDayId : null;

    const sessionObsId = 'sessionObsId' in record ? record.sessionObsId : null;

    await this.prisma.featureSet.upsert({
      where: { id: record.id },
      create: { id: record.id, trainingDayId, sessionObsId, ...base },
      update: { status: record.status, computedAt: record.computedAt },
    });
    if (record.status === 'COMPUTED') {
      // Readers only take the latest COMPUTED version; older ones, and the twin a concurrent
      // run wrote under the same version, are dead weight (ADR-125).
      await this.prisma.featureSet.deleteMany({
        where: {
          athleteId: record.athleteId,
          category: record.category,
          trainingDayId,
          sessionObsId,
          version: { lte: record.version },
          id: { not: record.id },
        },
      });
    }
  }

  async findSessionFeatures(
    athleteId: string,
    sessionObsId: string,
  ): Promise<SessionFeatureSetRecord | null> {
    const row = await this.prisma.featureSet.findFirst({
      where: { athleteId, category: 'SESSION', sessionObsId, status: 'COMPUTED' },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }
    return toSessionRecord(row as PrismaFeatureSetRow);
  }

  async findSessionFeaturesByRange(
    athleteId: string,
    fromTrainingDayId: string,
    toTrainingDayId: string,
  ): Promise<SessionFeatureSetRecord[]> {
    const rows = await this.prisma.featureSet.findMany({
      where: {
        athleteId,
        category: 'SESSION',
        status: 'COMPUTED',
        trainingDayId: { gte: fromTrainingDayId, lte: toTrainingDayId },
      },
      orderBy: [{ trainingDayId: 'asc' }, { version: 'desc' }],
    });

    // Deduplicate: keep only latest version per sessionObsId
    const bySession = new Map<string, PrismaFeatureSetRow>();
    for (const row of rows as PrismaFeatureSetRow[]) {
      if (row.sessionObsId && !bySession.has(row.sessionObsId)) {
        bySession.set(row.sessionObsId, row);
      }
    }

    return Array.from(bySession.values()).map(toSessionRecord);
  }

  async findLoadFeatures(
    athleteId: string,
    trainingDayId: string,
  ): Promise<LoadFeatureSetRecord | null> {
    const row = await this.prisma.featureSet.findFirst({
      where: { athleteId, category: 'LOAD', trainingDayId, status: 'COMPUTED' },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }
    return toLoadRecord(row as PrismaFeatureSetRow);
  }

  async findRecoveryFeatures(
    athleteId: string,
    trainingDayId: string,
  ): Promise<RecoveryFeatureSetRecord | null> {
    const row = await this.prisma.featureSet.findFirst({
      where: { athleteId, category: 'RECOVERY', trainingDayId, status: 'COMPUTED' },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }
    return toRecoveryRecord(row as PrismaFeatureSetRow);
  }

  async findFuelFeatures(
    athleteId: string,
    trainingDayId: string,
  ): Promise<FuelFeatureSetRecord | null> {
    const row = await this.prisma.featureSet.findFirst({
      where: { athleteId, category: 'FUEL', trainingDayId, status: 'COMPUTED' },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }
    return toFuelRecord(row as PrismaFeatureSetRow);
  }

  async findBodyFeatures(
    athleteId: string,
    trainingDayId: string,
  ): Promise<BodyFeatureSetRecord | null> {
    const row = await this.prisma.featureSet.findFirst({
      where: { athleteId, category: 'BODY', trainingDayId, status: 'COMPUTED' },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }
    return toBodyRecord(row as PrismaFeatureSetRow);
  }

  async findConditionFeatures(
    athleteId: string,
    trainingDayId: string,
  ): Promise<ConditionFeatureSetRecord | null> {
    const row = await this.prisma.featureSet.findFirst({
      where: { athleteId, category: 'CONDITION', trainingDayId, status: 'COMPUTED' },
      orderBy: { version: 'desc' },
    });
    if (!row) {
      return null;
    }
    return toConditionRecord(row as PrismaFeatureSetRow);
  }

  async invalidateForTrainingDay(
    athleteId: string,
    trainingDayId: string,
    categories: FeatureCategory[],
  ): Promise<void> {
    await this.prisma.featureSet.updateMany({
      where: {
        athleteId,
        trainingDayId,
        category: { in: categories },
        status: 'COMPUTED',
      },
      data: { status: 'INVALIDATED' },
    });
  }

  async invalidateLoadWindow(athleteId: string, fromTrainingDayId: string): Promise<void> {
    // Invalidate load features for all days in the 42-day window following the anchor
    // (a new session affects ACWR for 42 subsequent days)
    const windowEnd = fromTrainingDayId;
    const windowStart = subtractDays(fromTrainingDayId, 42);

    await this.prisma.featureSet.updateMany({
      where: {
        athleteId,
        category: 'LOAD',
        status: 'COMPUTED',
        trainingDayId: { gte: windowStart, lte: windowEnd },
      },
      data: { status: 'INVALIDATED' },
    });
  }

  async invalidateFuelWindow(athleteId: string, weighInTrainingDayId: string): Promise<void> {
    const windowEnd = addDays(weighInTrainingDayId, FUEL_BODY_WEIGHT_LOOKBACK_DAYS);

    await this.prisma.featureSet.updateMany({
      where: {
        athleteId,
        category: 'FUEL',
        status: 'COMPUTED',
        trainingDayId: { gte: weighInTrainingDayId, lte: windowEnd },
      },
      data: { status: 'INVALIDATED' },
    });
  }

  async updateStatus(id: string, status: FeatureStatus): Promise<void> {
    await this.prisma.featureSet.update({
      where: { id },
      data: { status, computedAt: status === 'COMPUTED' ? new Date() : undefined },
    });
  }

  async nextVersion(
    athleteId: string,
    category: FeatureCategory,
    trainingDayId?: string,
    sessionObsId?: string,
  ): Promise<number> {
    const latest = await this.prisma.featureSet.findFirst({
      where: { athleteId, category, trainingDayId, sessionObsId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    return (latest?.version ?? 0) + 1;
  }
}
