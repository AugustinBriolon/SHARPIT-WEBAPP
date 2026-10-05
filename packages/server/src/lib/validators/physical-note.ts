import { BodySide, FunctionalImpact, PhysicalCategory, PhysicalStatus } from '@prisma/client';
import { z } from 'zod';

const optionalString = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v));

const optionalSeverity = z.coerce.number().int().min(0).max(10).optional().nullable();

const baseSchema = z.object({
  category: z.nativeEnum(PhysicalCategory),
  status: z.nativeEnum(PhysicalStatus).optional(),
  title: z.string().min(1, 'Titre requis'),
  bodyPart: optionalString,
  side: z.nativeEnum(BodySide).optional(),
  severity: optionalSeverity,
  description: optionalString,
  affectsTraining: z.coerce.boolean().optional(),
  /** What the athlete can still do (ADR-068) — drives the training strategy with severity. */
  functionalImpact: z.nativeEnum(FunctionalImpact).optional().nullable(),
  startDate: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional().nullable(),
});

export const createPhysicalNoteSchema = baseSchema;
export const updatePhysicalNoteSchema = baseSchema.partial();

export const createCheckinSchema = z.object({
  severity: optionalSeverity,
  comment: optionalString,
  date: z.coerce.date().optional(),
  /**
   * What the athlete could actually do. Distinct from severity on purpose:
   * pain 2/10 but unable to run is not pain 7/10 with the session completed.
   * Absent → derived from severity, as before.
   */
  functionalImpact: z.nativeEnum(FunctionalImpact).optional().nullable(),
});

export type CreatePhysicalNoteInput = z.infer<typeof createPhysicalNoteSchema>;
export type UpdatePhysicalNoteInput = z.infer<typeof updatePhysicalNoteSchema>;
export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;
