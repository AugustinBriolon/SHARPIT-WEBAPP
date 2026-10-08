import type { Prisma } from '@prisma/client';

/** True when a stored value is absent or empty — a secondary source may fill it. */
export function isBlankActivityValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (typeof value === 'number') {
    return !Number.isFinite(value);
  }
  return false;
}

/**
 * Keep the primary row's value when set; take the incoming one only to fill a blank.
 * Ids / source flags that must always land should be listed in `always`.
 */
export function fillMissingScalar<T>(
  existing: T | null | undefined,
  incoming: T | null | undefined,
): T | undefined {
  if (!isBlankActivityValue(existing)) {
    return undefined;
  }
  if (isBlankActivityValue(incoming)) {
    return undefined;
  }
  return incoming as T;
}

type MetricRow = Record<string, unknown> | null | undefined;

/**
 * For a Prisma metrics `update` object: drop keys the row already holds.
 * `create` is left intact (first write of that sport metrics row).
 */
export function fillMissingMetricUpdate(
  existing: MetricRow,
  update: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!update) {
    return undefined;
  }
  if (!existing) {
    return update;
  }
  const filled: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (value === undefined || isBlankActivityValue(value)) {
      continue;
    }
    if (isBlankActivityValue(existing[key])) {
      filled[key] = value;
    }
  }
  return Object.keys(filled).length > 0 ? filled : undefined;
}

export type ActivityFillSnapshot = {
  title?: string | null;
  duration?: number | null;
  load?: number | null;
  rpe?: number | null;
  feeling?: string | null;
  notes?: string | null;
  runMetrics?: MetricRow;
  bikeMetrics?: MetricRow;
  swimMetrics?: MetricRow;
  hikeMetrics?: MetricRow;
};

const ACTIVITY_SCALAR_KEYS = ['title', 'duration', 'load', 'rpe', 'feeling', 'notes'] as const;

type UpsertRelation = {
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
};

function asUpsert(value: unknown): UpsertRelation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const nested =
    record.upsert && typeof record.upsert === 'object'
      ? (record.upsert as Record<string, unknown>)
      : record;
  if (!('create' in nested) && !('update' in nested)) {
    return null;
  }
  return {
    create: nested.create as Record<string, unknown> | undefined,
    update: nested.update as Record<string, unknown> | undefined,
  };
}

/**
 * Turn a provider enrichment `ActivityUpdateInput` into fill-missing-only patches.
 * Keys in `always` (e.g. `stravaId`, `garminId`, `source`) are kept as the provider sent them.
 */
export function fillMissingActivityUpdate(
  existing: ActivityFillSnapshot,
  incoming: Prisma.ActivityUpdateInput,
  options?: { always?: readonly string[] },
): Prisma.ActivityUpdateInput {
  const always = new Set(options?.always ?? []);
  const out: Prisma.ActivityUpdateInput = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) {
      continue;
    }
    if (always.has(key)) {
      (out as Record<string, unknown>)[key] = value;
      continue;
    }

    if ((ACTIVITY_SCALAR_KEYS as readonly string[]).includes(key)) {
      const filled = fillMissingScalar(
        existing[key as keyof ActivityFillSnapshot] as string | number | null | undefined,
        value as string | number | null | undefined,
      );
      if (filled !== undefined) {
        (out as Record<string, unknown>)[key] = filled;
      }
      continue;
    }

    if (
      key === 'runMetrics' ||
      key === 'bikeMetrics' ||
      key === 'swimMetrics' ||
      key === 'hikeMetrics'
    ) {
      const upsert = asUpsert(value);
      if (!upsert) {
        continue;
      }
      const existingMetrics = existing[key] as MetricRow;
      const update = fillMissingMetricUpdate(existingMetrics, upsert.update);
      if (!existingMetrics && upsert.create) {
        (out as Record<string, unknown>)[key] = {
          upsert: { create: upsert.create, update: update ?? {} },
        };
      } else if (update) {
        (out as Record<string, unknown>)[key] = {
          upsert: {
            create: upsert.create ?? update,
            update,
          },
        };
      }
      continue;
    }

    // Unknown relation / field: do not invent overwrite behaviour — require `always`.
  }

  return out;
}
