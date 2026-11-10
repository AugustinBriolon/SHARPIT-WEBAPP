/**
 * INFRASTRUCTURE — Prisma Observation Repository
 *
 * Concrete implementation of the ObservationRepository port.
 * Maps between the domain's Observation types and the Prisma `Observation` table.
 *
 * Storage strategy:
 *   - Indexed columns: id, athleteId, type, source, timestamp, receivedAt,
 *     trainingDayId, quality, externalId
 *   - JSONB `data` column: all type-specific fields (non-indexed)
 *   - Date fields inside `data` are stored as ISO-8601 strings and rehydrated on read
 *
 * This class is the ONLY place in the codebase that knows about the DB schema for
 * observations. Domain code never imports from @prisma/client directly.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  Observation,
  ObservationFilter,
  ObservationType,
  ObservationQuality,
  ObservationSource,
  QualityFlag,
} from '@sharpit/core/observation';
import type { ObservationRepository } from '@sharpit/core/observation/repository';

// ─────────────────────────────────────────────────────────────────────────────
// Quality ordering (for qualityMin filtering)
// ─────────────────────────────────────────────────────────────────────────────

const QUALITY_RANK: Record<ObservationQuality, number> = {
  MEASURED_DIRECT: 5,
  MEASURED_OPTICAL: 4,
  MANUAL: 3,
  ESTIMATED: 2,
  PROPRIETARY_MODEL: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Prisma row type (reflects schema.prisma Observation model)
// ─────────────────────────────────────────────────────────────────────────────

type PrismaObservationRow = {
  id: string;
  athleteId: string;
  type: string;
  source: string;
  timestamp: Date;
  receivedAt: Date;
  trainingDayId: string;
  quality: string;
  qualityFlags: unknown;
  normalizedAt: Date;
  externalId: string | null;
  data: unknown;
  createdAt: Date;
};

// ─────────────────────────────────────────────────────────────────────────────
// Serialization helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The set of fields stored as indexed columns rather than inside `data`.
 * These are never duplicated in the JSONB blob.
 */
const TOP_LEVEL_FIELDS = new Set([
  'id',
  'athleteId',
  'type',
  'source',
  'timestamp',
  'receivedAt',
  'trainingDayId',
  'quality',
  'qualityFlags',
  'normalizedAt',
]);

/**
 * Extracts type-specific fields into the `data` JSONB column.
 * Dates are converted to ISO-8601 strings for safe JSONB storage.
 */
function toData(obs: Observation): Prisma.InputJsonValue {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obs)) {
    if (TOP_LEVEL_FIELDS.has(key)) {
      continue;
    }
    raw[key] = value instanceof Date ? value.toISOString() : value;
  }
  // JSON round-trip ensures JSONB-safe output with predictable typing
  return JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue;
}

/**
 * Rehydrates Date fields that are stored as ISO strings inside `data`.
 * Only SLEEP has a nested Date in its type-specific payload (wakeTimestamp).
 */
function rehydrateDates(
  type: ObservationType,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (type === 'SLEEP' && typeof data.wakeTimestamp === 'string') {
    return { ...data, wakeTimestamp: new Date(data.wakeTimestamp) };
  }
  return data;
}

/**
 * Rebuilds a domain Observation from a Prisma row.
 */
function toDomain(row: PrismaObservationRow): Observation {
  const type = row.type as ObservationType;
  const data = row.data as Record<string, unknown>;
  const rehydrated = rehydrateDates(type, data);

  return {
    id: row.id,
    athleteId: row.athleteId,
    type,
    source: row.source as ObservationSource,
    timestamp: row.timestamp,
    receivedAt: row.receivedAt,
    trainingDayId: row.trainingDayId,
    quality: row.quality as ObservationQuality,
    qualityFlags: (row.qualityFlags as QualityFlag[]) ?? [],
    normalizedAt: row.normalizedAt,
    ...rehydrated,
  } as Observation;
}

function buildTimestampFilter(
  filter: ObservationFilter,
): Prisma.ObservationWhereInput['timestamp'] {
  if (!filter.since && !filter.until) {
    return undefined;
  }
  return {
    ...(filter.since && { gte: filter.since }),
    ...(filter.until && { lte: filter.until }),
  };
}

function buildFindWhere(
  athleteId: string,
  filter: ObservationFilter,
): Prisma.ObservationWhereInput {
  return {
    athleteId,
    ...(filter.types && { type: { in: filter.types } }),
    ...(filter.sources && { source: { in: filter.sources } }),
    ...(filter.trainingDayId && { trainingDayId: filter.trainingDayId }),
    ...(filter.trainingDayIds && { trainingDayId: { in: filter.trainingDayIds } }),
    ...(buildTimestampFilter(filter) && { timestamp: buildTimestampFilter(filter) }),
  };
}

function filterByQualityMin(
  observations: Observation[],
  qualityMin: ObservationQuality | undefined,
): Observation[] {
  if (!qualityMin) {
    return observations;
  }
  const minRank = QUALITY_RANK[qualityMin];
  return observations.filter((obs) => QUALITY_RANK[obs.quality] >= minRank);
}

// ─────────────────────────────────────────────────────────────────────────────
// Repository implementation
// ─────────────────────────────────────────────────────────────────────────────

export class PrismaObservationRepository implements ObservationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(observation: Observation): Promise<void> {
    const externalId =
      observation.type === 'SESSION' || observation.type === 'BODY_COMPOSITION'
        ? (observation.externalId ?? null)
        : null;

    const write = this.prisma.observation.upsert({
      where: { id: observation.id },
      create: {
        id: observation.id,
        athleteId: observation.athleteId,
        type: observation.type,
        source: observation.source,
        timestamp: observation.timestamp,
        receivedAt: observation.receivedAt,
        trainingDayId: observation.trainingDayId,
        quality: observation.quality,
        qualityFlags: [...observation.qualityFlags],
        normalizedAt: observation.normalizedAt,
        externalId,
        data: toData(observation),
      },
      update: {
        // Accepted observations are immutable — we only update the data field
        // in the rare case of a re-normalization (quality reassignment, etc.)
        qualityFlags: [...observation.qualityFlags],
        data: toData(observation),
      },
    });
    if (externalId) {
      await write;
      return;
    }
    // No source id to dedup on: the same source re-reading the same instant is the same
    // measurement, so the new reading replaces the old ones (ADR-125).
    // shortcut: no unique constraint, two concurrent syncs can leave a pair; the next sync collapses it.
    await this.prisma.$transaction([
      this.prisma.observation.deleteMany({
        where: {
          athleteId: observation.athleteId,
          type: observation.type,
          source: observation.source,
          timestamp: observation.timestamp,
          externalId: null,
          id: { not: observation.id },
        },
      }),
      write,
    ]);
  }

  async findById(id: string): Promise<Observation | null> {
    const row = await this.prisma.observation.findUnique({ where: { id } });
    return row ? toDomain(row as PrismaObservationRow) : null;
  }

  async find(athleteId: string, filter: ObservationFilter): Promise<Observation[]> {
    const rows = await this.prisma.observation.findMany({
      where: buildFindWhere(athleteId, filter),
      orderBy: { timestamp: 'desc' },
    });

    const observations = rows.map((r) => toDomain(r as PrismaObservationRow));
    return filterByQualityMin(observations, filter.qualityMin);
  }

  async findByExternalId(
    athleteId: string,
    type: ObservationType,
    externalId: string,
  ): Promise<Observation | null> {
    const row = await this.prisma.observation.findFirst({
      where: { athleteId, type, externalId },
    });
    return row ? toDomain(row as PrismaObservationRow) : null;
  }

  async findByTimeRange(params: {
    athleteId: string;
    type: ObservationType;
    from: Date;
    to: Date;
  }): Promise<Observation[]> {
    const rows = await this.prisma.observation.findMany({
      where: {
        athleteId: params.athleteId,
        type: params.type,
        timestamp: { gte: params.from, lte: params.to },
      },
      orderBy: { timestamp: 'asc' },
    });
    return rows.map((r) => toDomain(r as PrismaObservationRow));
  }
}
