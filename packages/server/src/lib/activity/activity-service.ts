import { ActivityType } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { resolveExerciseCatalogId } from '@sharpit/app/lib/exercises';
import type {
  CreateActivityInput,
  UpdateActivityInput,
} from '@sharpit/app/lib/validators/activity';

function cleanMetrics<T extends Record<string, unknown>>(metrics?: T | null) {
  if (!metrics) {
    return undefined;
  }
  const entries = Object.entries(metrics).filter(
    ([, value]) => isSet(value) && value !== undefined && value !== '',
  );
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
}

type MetricRelation = { create?: unknown; upsert?: unknown };

const CREATE_METRIC_HANDLERS: Partial<
  Record<ActivityType, (metrics: unknown) => MetricRelation | undefined>
> = {
  [ActivityType.RUN]: (metrics) =>
    metrics ? { create: cleanMetrics(metrics as Record<string, unknown>) } : undefined,
  [ActivityType.BIKE]: (metrics) =>
    metrics ? { create: cleanMetrics(metrics as Record<string, unknown>) } : undefined,
  [ActivityType.SWIM]: (metrics) =>
    metrics ? { create: cleanMetrics(metrics as Record<string, unknown>) } : undefined,
  [ActivityType.HIKE]: (metrics) =>
    metrics ? { create: cleanMetrics(metrics as Record<string, unknown>) } : undefined,
};

function createMetricRelation(type: ActivityType, metrics: unknown): MetricRelation | undefined {
  return CREATE_METRIC_HANDLERS[type]?.(metrics);
}

function upsertMetricRelation(metrics: unknown): MetricRelation | undefined {
  const cleaned = cleanMetrics(metrics as Record<string, unknown>);
  // Empty `{}` after cleaning means the client sent no real metric fields —
  // do not invent an empty nested upsert (prod symptom: create:{}, update:{}).
  if (!cleaned) {
    return undefined;
  }
  return { upsert: { create: cleaned, update: cleaned } };
}

const UPDATE_METRIC_FIELDS = [
  'runMetrics',
  'bikeMetrics',
  'swimMetrics',
  'hikeMetrics',
] as const satisfies ReadonlyArray<keyof UpdateActivityInput>;

function applyMetricUpdates(
  data: Record<string, unknown>,
  metrics: Pick<UpdateActivityInput, 'runMetrics' | 'bikeMetrics' | 'swimMetrics' | 'hikeMetrics'>,
) {
  for (const field of UPDATE_METRIC_FIELDS) {
    const value = metrics[field];
    if (value === undefined) {
      continue;
    }
    const relation = upsertMetricRelation(value);
    if (relation) {
      data[field] = relation;
    }
  }
}

export function buildActivityCreateData(input: CreateActivityInput) {
  const { runMetrics, bikeMetrics, swimMetrics, hikeMetrics, strengthSets, ...base } = input;

  return {
    ...base,
    runMetrics:
      input.type === ActivityType.RUN ? createMetricRelation(input.type, runMetrics) : undefined,
    bikeMetrics:
      input.type === ActivityType.BIKE ? createMetricRelation(input.type, bikeMetrics) : undefined,
    swimMetrics:
      input.type === ActivityType.SWIM ? createMetricRelation(input.type, swimMetrics) : undefined,
    hikeMetrics:
      input.type === ActivityType.HIKE ? createMetricRelation(input.type, hikeMetrics) : undefined,
    strengthSets:
      input.type === ActivityType.STRENGTH && strengthSets?.length
        ? {
            create: strengthSets.map((set, index) => ({
              ...set,
              exerciseCatalogId: resolveExerciseCatalogId(set.exercise),
              order: set.order ?? index,
            })),
          }
        : undefined,
  };
}

export function buildActivityUpdateData(input: UpdateActivityInput) {
  const { runMetrics, bikeMetrics, swimMetrics, hikeMetrics, strengthSets, type, goalId, ...base } =
    input;

  const data: Record<string, unknown> = { ...base };
  if (type) {
    data.type = type;
  }
  // Relation form: Prisma rejects a raw foreign key next to nested metric writes.
  if (goalId !== undefined) {
    data.goal = goalId ? { connect: { id: goalId } } : { disconnect: true };
  }

  applyMetricUpdates(data, { runMetrics, bikeMetrics, swimMetrics, hikeMetrics });

  if (type === ActivityType.STRENGTH && strengthSets) {
    data.strengthSets = {
      deleteMany: {},
      create: strengthSets.map((set, index) => ({
        ...set,
        exerciseCatalogId: resolveExerciseCatalogId(set.exercise),
        order: set.order ?? index,
      })),
    };
  }

  return data;
}
