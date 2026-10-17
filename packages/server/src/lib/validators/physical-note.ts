import { BodySide, FunctionalImpact, PhysicalCategory, PhysicalStatus } from '@prisma/client';
import { z } from 'zod';

/**
 * Every field reaches the coach's prompt: caps keep one note from inflating each coach call.
 * Native forms mirror them (SHARPIT-APP sensitive-zone sheet).
 */
export const PHYSICAL_NOTE_LIMITS = {
  title: 120,
  bodyPart: 80,
  description: 2000,
  checkinComment: 1000,
} as const;

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

const optionalSeverity = z.coerce.number().int().min(0).max(10).optional().nullable();

const baseSchema = z.object({
  category: z.nativeEnum(PhysicalCategory),
  status: z.nativeEnum(PhysicalStatus).optional(),
  title: z.string().min(1, 'Titre requis').max(PHYSICAL_NOTE_LIMITS.title),
  bodyPart: optionalString(PHYSICAL_NOTE_LIMITS.bodyPart),
  side: z.nativeEnum(BodySide).optional(),
  severity: optionalSeverity,
  description: optionalString(PHYSICAL_NOTE_LIMITS.description),
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
  comment: optionalString(PHYSICAL_NOTE_LIMITS.checkinComment),
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
