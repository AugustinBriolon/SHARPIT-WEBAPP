import { ActivityType, SessionIntensity } from '@prisma/client';
import { z } from 'zod';
import { isSet } from '@sharpit/shared/value';
import { isEquipmentItemId } from '@sharpit/app/lib/equipment/catalog';
import { endurancePrescriptionSchema } from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { strengthPrescriptionSchema } from '@sharpit/app/lib/planned-session/strength/strength-prescription';

const optionalNumber = z.coerce.number().optional().nullable();
const optionalString = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v));

export const plannedSessionExposureSchema = z.enum(['INDOOR', 'OUTDOOR', 'UNKNOWN']);
export const plannedSessionLocationTypeSchema = z.enum([
  'TRACK',
  'ROAD',
  'TRAIL',
  'POOL',
  'GYM',
  'TRAINER',
  'UNKNOWN',
]);

export const activityTypeSchema = z.nativeEnum(ActivityType);
export const sessionIntensitySchema = z.nativeEnum(SessionIntensity);

const contextualFields = {
  exposureSetting: plannedSessionExposureSchema.optional().nullable(),
  locationLabel: optionalString,
  locationLat: optionalNumber,
  locationLng: optionalNumber,
  locationType: plannedSessionLocationTypeSchema.optional().nullable(),
};

const optionalStrengthPrescription = strengthPrescriptionSchema
  .nullable()
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) {
      return null;
    }
    if (v.sets.length === 0) {
      return null;
    }
    return v;
  });

const optionalEndurancePrescription = endurancePrescriptionSchema
  .nullable()
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) {
      return null;
    }
    if (v.blocks.length === 0) {
      return null;
    }
    return v;
  });

const optionalAccessories = z
  .array(z.string())
  .max(20)
  .nullable()
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) {
      return null;
    }
    const ids = v.filter(isEquipmentItemId);
    return ids.length > 0 ? ids : null;
  });

const basePlannedSessionSchema = z.object({
  type: activityTypeSchema,
  date: z.coerce.date(),
  startTime: optionalString,
  title: optionalString,
  description: optionalString,
  strengthPrescription: optionalStrengthPrescription,
  endurancePrescription: optionalEndurancePrescription,
  accessories: optionalAccessories,
  durationMin: optionalNumber,
  load: optionalNumber,
  intensity: sessionIntensitySchema.optional().nullable(),
  completed: z.coerce.boolean().optional(),
  isKey: z.boolean().optional(),
  goalId: optionalString,
  ...contextualFields,
});

/**
 * The prescription carries its own sport and the payload sent to Garmin is built
 * from it, so a mismatch would put a run workout on a ride. Reject it at the door.
 */
function requireMatchingEnduranceSport(data: {
  type: ActivityType;
  endurancePrescription?: { sport: string } | null;
}) {
  const sport = data.endurancePrescription?.sport;
  // Strength sessions drop the endurance prescription in the transform below.
  if (!sport || data.type === ActivityType.STRENGTH) {
    return null;
  }
  if (sport === data.type) {
    return null;
  }
  return {
    message: `Le déroulé structuré est en ${sport} mais la séance est en ${data.type}.`,
    path: ['endurancePrescription', 'sport'] as const,
  };
}

function requireSessionDetails(data: {
  type: ActivityType;
  description?: string | null;
  strengthPrescription?: { sets: unknown[] } | null;
}) {
  if (data.type === ActivityType.STRENGTH) {
    if (!data.strengthPrescription?.sets?.length) {
      return {
        message: 'Au moins un exercice est requis pour une séance de musculation.',
        path: ['strengthPrescription'] as const,
      };
    }
    return null;
  }
  if (!(data.description ?? '').trim()) {
    return {
      message: 'Le déroulé de la séance est requis (description).',
      path: ['description'] as const,
    };
  }
  return null;
}

export const createPlannedSessionSchema = basePlannedSessionSchema
  .superRefine((data, ctx) => {
    for (const issue of [requireSessionDetails(data), requireMatchingEnduranceSport(data)]) {
      if (!issue) {
        continue;
      }
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: [...issue.path] });
    }
  })
  .transform((data) => ({
    ...data,
    strengthPrescription: data.type === ActivityType.STRENGTH ? data.strengthPrescription : null,
    endurancePrescription: data.type === ActivityType.STRENGTH ? null : data.endurancePrescription,
  }));

function shouldSkipSessionPatchRefine(data: {
  type?: ActivityType | null;
  description?: string | null;
  strengthPrescription?: unknown;
}): boolean {
  return (
    !isSet(data.type) && data.description === undefined && data.strengthPrescription === undefined
  );
}

export const updatePlannedSessionSchema = basePlannedSessionSchema
  .partial()
  .superRefine((data, ctx) => {
    if (shouldSkipSessionPatchRefine(data)) {
      return;
    }
    const { type } = data;
    if (!isSet(type)) {
      return;
    }
    const sessionType = type;
    const issues = [
      requireSessionDetails({
        type: sessionType,
        description: data.description,
        strengthPrescription: data.strengthPrescription,
      }),
      requireMatchingEnduranceSport({
        type: sessionType,
        endurancePrescription: data.endurancePrescription,
      }),
    ];
    for (const issue of issues) {
      if (!issue) {
        continue;
      }
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: [...issue.path] });
    }
  })
  .transform((data) => {
    if (data.type === undefined || data.type === null) {
      return data;
    }
    return data.type === ActivityType.STRENGTH
      ? { ...data, endurancePrescription: null }
      : { ...data, strengthPrescription: null };
  });

export type CreatePlannedSessionInput = z.infer<typeof createPlannedSessionSchema>;
export type UpdatePlannedSessionInput = z.infer<typeof updatePlannedSessionSchema>;

const brickLegSchema = z.object({
  type: activityTypeSchema,
  title: optionalString,
  description: optionalString,
  durationMin: optionalNumber,
  load: optionalNumber,
  intensity: sessionIntensitySchema.optional().nullable(),
});

export const createBrickSchema = z.object({
  date: z.coerce.date(),
  startTime: optionalString,
  /** Option B — stamps the same goal on every brick leg. */
  goalId: optionalString,
  legs: z.array(brickLegSchema).min(2, 'Un brick nécessite au moins 2 jambes'),
});

export type CreateBrickInput = z.infer<typeof createBrickSchema>;
