import { ActivityType } from '@prisma/client';
import { z } from 'zod';

const optionalNumber = z.coerce.number().optional().nullable();
const optionalInt = z.coerce.number().int().optional().nullable();
// 2000 chars is far beyond any real activity note/title — closes an
// unbounded-payload vector without ever touching real use.
const optionalString = z.string().max(2000).optional().nullable();

export const activityTypeSchema = z.nativeEnum(ActivityType);

const baseActivitySchema = z.object({
  type: activityTypeSchema,
  date: z.coerce.date(),
  title: optionalString,
  duration: optionalInt,
  rpe: z.coerce.number().int().min(1).max(10).optional().nullable(),
  feeling: optionalString,
  notes: optionalString,
  weather: optionalString,
  load: optionalNumber,
  observedLocationLabel: optionalString,
  observedLocationLat: optionalNumber,
  observedLocationLng: optionalNumber,
});

export const runMetricsSchema = z.object({
  distanceM: optionalNumber,
  elevationM: optionalNumber,
  paceSecPerKm: optionalNumber,
  avgHr: optionalInt,
  avgPower: optionalNumber,
  cadence: optionalInt,
  shoes: optionalString,
});

export const bikeMetricsSchema = z.object({
  distanceM: optionalNumber,
  ftpPercent: optionalNumber,
  normalizedPower: optionalNumber,
  intensityFactor: optionalNumber,
  tss: optionalNumber,
  avgCadence: optionalInt,
  avgPower: optionalNumber,
  elevationM: optionalNumber,
  calories: optionalInt,
  bikeName: optionalString,
});

export const swimMetricsSchema = z.object({
  distanceM: optionalNumber,
  sets: optionalInt,
  cssSecPer100m: optionalNumber,
  avgPaceSecPer100m: optionalNumber,
  swolf: optionalNumber,
  drills: optionalString,
});

export const hikeMetricsSchema = z.object({
  distanceM: optionalNumber,
  elevationM: optionalNumber,
  elevationLossM: optionalNumber,
  avgHr: optionalInt,
  calories: optionalInt,
  avgSpeedMps: optionalNumber,
});

export const strengthSetSchema = z.object({
  exercise: z.string().min(1).max(200),
  sets: z.coerce.number().int().min(1),
  reps: z.coerce.number().int().min(1),
  weightKg: optionalNumber,
  rpe: z.coerce.number().int().min(1).max(10).optional().nullable(),
  restSec: optionalInt,
  durationSec: optionalInt,
  videoUrl: optionalString,
  notes: optionalString,
  order: z.coerce.number().int().optional(),
});

export const createActivitySchema = baseActivitySchema.extend({
  runMetrics: runMetricsSchema.optional(),
  bikeMetrics: bikeMetricsSchema.optional(),
  swimMetrics: swimMetricsSchema.optional(),
  hikeMetrics: hikeMetricsSchema.optional(),
  strengthSets: z.array(strengthSetSchema).max(50).optional(),
});

export const updateActivitySchema = createActivitySchema.partial().extend({
  type: activityTypeSchema.optional(),
  date: z.coerce.date().optional(),
  /** Link to the goal the activity was done for; null unlinks. Ownership is checked by the route. */
  goalId: z.string().min(1).max(64).nullable().optional(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const activityInclude = {
  runMetrics: true,
  bikeMetrics: true,
  swimMetrics: true,
  hikeMetrics: true,
  strengthSets: { orderBy: { order: 'asc' as const } },
} as const;
