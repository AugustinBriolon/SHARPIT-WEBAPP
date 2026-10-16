import { z } from 'zod';
import {
  JOURNAL_BUILTIN_TRACKABLE_IDS,
  isCustomTrackableId,
} from '@sharpit/app/lib/journal/journal-trackables';

const KNOWN_ENABLED = new Set<string>(JOURNAL_BUILTIN_TRACKABLE_IDS);

const thresholdsSchema = z
  .object({
    steps: z.number().finite().gt(0).max(100_000),
    stressMax: z.number().finite().min(0).max(100),
    cardioMinMinutes: z
      .number()
      .finite()
      .gt(0)
      .max(24 * 60),
    strengthMinMinutes: z
      .number()
      .finite()
      .gt(0)
      .max(24 * 60),
    sleepMinMinutes: z
      .number()
      .finite()
      .gt(0)
      .max(24 * 60),
    bodyBatteryMin: z.number().finite().min(0).max(100),
    hydrationMlMin: z.number().finite().gt(0).max(20_000),
  })
  .strict();

const customItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(64)
      .refine((id) => isCustomTrackableId(id), { message: 'INVALID_CUSTOM_ID' }),
    label: z.string().trim().min(1).max(48),
    enabled: z.boolean(),
  })
  .strict();

const enabledSchema = z.record(z.string(), z.boolean()).superRefine((map, ctx) => {
  for (const key of Object.keys(map)) {
    if (!KNOWN_ENABLED.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'UNKNOWN_ENABLED_KEY',
        path: [key],
      });
    }
  }
});

/**
 * Strict write schema for PUT /journal-prefs — unknown keys / bad types are rejected.
 * `version: 1` remains accepted so already-shipped iOS clients can still save; sanitize
 * migrates to v2 before persist.
 */
export const journalPrefsWriteSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    enabled: enabledSchema.optional(),
    customItems: z.array(customItemSchema).max(50).optional(),
    thresholds: thresholdsSchema.optional(),
    // v1 shape fields (migrated by parseJournalPrefs) — keep optional, never invent new ones.
    diet: z.unknown().optional(),
    checklist: z.unknown().optional(),
    trackables: z.unknown().optional(),
  })
  .strict();

export const journalPrefsPutBodySchema = z
  .object({
    prefs: journalPrefsWriteSchema,
  })
  .strict();

export type JournalPrefsWriteCode =
  'JOURNAL_PREFS_INVALID' | 'JOURNAL_PREFS_UNKNOWN_KEY' | 'JOURNAL_PREFS_INVALID_TYPE';

export function journalPrefsWriteErrorCode(error: z.ZodError): JournalPrefsWriteCode {
  const messages = error.issues.map((issue) => issue.message);
  if (messages.some((message) => message === 'UNKNOWN_ENABLED_KEY')) {
    return 'JOURNAL_PREFS_UNKNOWN_KEY';
  }
  if (error.issues.some((issue) => issue.code === 'unrecognized_keys')) {
    return 'JOURNAL_PREFS_UNKNOWN_KEY';
  }
  if (
    error.issues.some((issue) =>
      ['invalid_type', 'invalid_value', 'invalid_format', 'too_small', 'too_big'].includes(
        issue.code,
      ),
    )
  ) {
    return 'JOURNAL_PREFS_INVALID_TYPE';
  }
  return 'JOURNAL_PREFS_INVALID';
}
