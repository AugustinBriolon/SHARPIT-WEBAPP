import { z } from 'zod';
import { isSet } from '@sharpit/shared/value';
import {
  movementIntentSchema,
  movementPatternSchema,
  type MovementIntent,
  type MovementPattern,
} from '@sharpit/app/lib/exercises/movement-taxonomy';
import { resolveExerciseMedia } from '@sharpit/app/lib/exercises/resolve';
import { resolveMovement } from '@sharpit/app/lib/exercises/movement-taxonomy';

/** Resolved Garmin Connect identity persisted with the prescription set. */
export const strengthPrescriptionGarminSchema = z.object({
  category: z.string().trim().min(1).max(64),
  exerciseName: z.string().trim().min(1).max(96),
  labelFr: z.string().trim().min(1).max(160).optional().nullable(),
  /** 'fallback' = approximate watch name chosen by movement family. */
  confidence: z.enum(['exact', 'alias', 'fuzzy', 'fallback']),
});

export const strengthRestModeSchema = z.enum(['lap', 'time']);
export type StrengthRestMode = z.infer<typeof strengthRestModeSchema>;

/** One planned strength movement (aggregated sets, same shape as realized StrengthSet). */
export const strengthPrescriptionSetSchema = z.object({
  exercise: z.string().trim().min(1).max(120),
  exerciseCatalogId: z.string().trim().min(1).max(32).optional().nullable(),
  /**
   * What this movement does, as declared by whoever prescribed it. Absent on
   * rows written before the coach was asked to declare it — consumers fall back
   * to the curated taxonomy, never to the media catalog's body group.
   */
  intent: movementIntentSchema.optional().nullable(),
  pattern: movementPatternSchema.optional().nullable(),
  sets: z.coerce.number().int().min(1).max(50),
  reps: z.coerce.number().int().min(0).max(500),
  durationSec: z.coerce.number().int().min(0).max(3600).optional().nullable(),
  weightKg: z.coerce.number().min(0).max(1000).optional().nullable(),
  /** Done one side then the other: reps and duration are per side (ADR-121). */
  perSide: z.boolean().optional().nullable(),
  /** Timed rest seconds — only used when restMode === 'time'. */
  restSec: z.coerce.number().int().min(0).max(3600).optional().nullable(),
  /**
   * How rest ends on the watch.
   * - lap (default): athlete presses Lap — open-ended rest
   * - time: countdown in seconds (restSec)
   */
  restMode: strengthRestModeSchema.optional().nullable(),
  notes: z.string().trim().max(240).optional().nullable(),
  order: z.coerce.number().int().min(0).max(200),
  garmin: strengthPrescriptionGarminSchema.optional().nullable(),
});

export const strengthPrescriptionSchema = z.object({
  version: z.literal(1),
  sets: z.array(strengthPrescriptionSetSchema).max(40),
});

export type StrengthPrescriptionSet = z.infer<typeof strengthPrescriptionSetSchema>;
export type StrengthPrescription = z.infer<typeof strengthPrescriptionSchema>;
export type StrengthPrescriptionGarmin = z.infer<typeof strengthPrescriptionGarminSchema>;

/**
 * LLM-facing set shape (no version/order — assigned on normalize).
 * Used by coach plan, adapt, and chat tools.
 */
export const coachStrengthSetSchema = z.object({
  exercise: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      'Nom FR de l’exercice. Préférer un libellé proche du catalogue Garmin Connect (ex. Pompe, Étirement 90/90, Clamshell avec élastique).',
    ),
  // Nullish, not required: a missing enum must cost one unjudged exercise, never
  // the whole generated block. Absent values fall back to the curated taxonomy.
  intent: movementIntentSchema
    .nullish()
    .describe(
      'Ce que l’exercice entraîne. MOBILITY = étirement, auto-massage, mobilité (aucune mise en charge). CORE = gainage. STRENGTH = renforcement contre résistance. PLYOMETRIC = pliométrie. CONDITIONING = cardio. null seulement si tu ne sais vraiment pas.',
    ),
  pattern: movementPatternSchema
    .nullish()
    .describe(
      'Famille biomécanique sollicitée. null OBLIGATOIREMENT si intent=MOBILITY ou CONDITIONING. C’est ce champ qui permet de vérifier qu’un exercice ne charge pas une zone sensible — ne le devine pas, choisis le motif réellement sollicité.',
    ),
  sets: z.number().int().min(1).max(20).describe('Nombre de séries.'),
  reps: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      'Répétitions par série (par côté si perSide). 0 si maintien chronométré : planche, étirement, posture de mobilité.',
    ),
  durationSec: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .nullable()
    .optional()
    .describe(
      'Durée d’une série en secondes (par côté si perSide) pour un maintien : isométrie, étirement. null sinon.',
    ),
  weightKg: z
    .number()
    .min(0)
    .max(500)
    .nullable()
    .optional()
    .describe(
      'Charge cible en kg si pertinente. null sans charge (poids du corps, étirement), jamais 0.',
    ),
  perSide: z
    .boolean()
    .nullable()
    .optional()
    .describe(
      'true si l’exercice se fait un côté puis l’autre (fente, étirement d’une jambe, rotation…) : reps et durée sont alors par côté. null sinon.',
    ),
  restMode: strengthRestModeSchema
    .nullable()
    .optional()
    .describe(
      'Fin de repos montre : "lap" (bouton Lap, défaut recommandé) ou "time" (chronométré).',
    ),
  restSec: z
    .number()
    .int()
    .min(0)
    .max(600)
    .nullable()
    .optional()
    .describe('Repos chronométré en secondes si restMode=time. Ignoré si lap.'),
  notes: z.string().trim().max(240).nullable().optional().describe('Consigne courte optionnelle.'),
});

export const coachStrengthPrescriptionSchema = z
  .object({
    sets: z
      .array(coachStrengthSetSchema)
      .min(1)
      .max(20)
      .describe('Liste ordonnée des exercices de la séance muscu.'),
  })
  .describe(
    'Prescription muscu structurée (montre Garmin). OBLIGATOIRE si type=STRENGTH, null sinon.',
  );

export type CoachStrengthPrescription = z.infer<typeof coachStrengthPrescriptionSchema>;

/** A stretch or mobility hold written without its length: the length the routines use. */
export const DEFAULT_MOBILITY_HOLD_SEC = 30;

/**
 * Puts a set in the shape it is done in (ADR-121): no load on a movement that takes none (a 0 kg
 * read as a load), a mobility move written as one rep becomes a timed hold, and a one-sided
 * movement says so — declared by the coach, else known by the movement taxonomy. Applied on
 * write and on read, so sessions written before keep reading right.
 */
export function shapeStrengthSet<T extends StrengthPrescriptionSet>(set: T): T {
  const movement = resolveMovement({
    exercise: set.exercise,
    exerciseCatalogId: set.exerciseCatalogId,
  });
  const intent = set.intent ?? movement?.intent ?? null;
  const loadless = intent === 'MOBILITY' || movement?.modality === 'NONE';
  return {
    ...set,
    weightKg: loadless ? null : prescribedLoad(set.weightKg),
    perSide: set.perSide ?? movement?.unilateral ?? null,
    ...(isUntimedStretch(set, intent) ? { reps: 0, durationSec: DEFAULT_MOBILITY_HOLD_SEC } : {}),
  };
}

/** 0 kg is no load, not a load of zero. */
function prescribedLoad(weightKg: number | null | undefined): number | null {
  return isSet(weightKg) && weightKg > 0 ? weightKg : null;
}

/** A mobility move written as zero or one rep with no length is a hold whose length was left out. */
function isUntimedStretch(set: StrengthPrescriptionSet, intent: MovementIntent | null): boolean {
  const hasHold = isSet(set.durationSec) && set.durationSec > 0;
  return intent === 'MOBILITY' && !hasHold && set.reps <= 1;
}

export function shapeStrengthPrescription(
  prescription: StrengthPrescription,
): StrengthPrescription {
  return { ...prescription, sets: prescription.sets.map(shapeStrengthSet) };
}

/** A stored prescription as clients read it: parsed and shaped, or null. */
export function readStrengthPrescription(raw: unknown): StrengthPrescription | null {
  const parsed = parseStrengthPrescription(raw);
  return parsed ? shapeStrengthPrescription(parsed) : null;
}

/** What a client is sent: the shaped prescription, or the stored value as is when it does not parse. */
export function presentStrengthPrescription(raw: unknown): unknown {
  return readStrengthPrescription(raw) ?? raw ?? null;
}

export function emptyStrengthPrescription(): StrengthPrescription {
  return { version: 1, sets: [] };
}

/** Soft-parse Json from DB — invalid / empty → null. */
export function parseStrengthPrescription(raw: unknown): StrengthPrescription | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  const parsed = strengthPrescriptionSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  if (parsed.data.sets.length === 0) {
    return null;
  }
  return parsed.data;
}

export function attachGarminRefsToPrescription(
  prescription: StrengthPrescription,
): StrengthPrescription {
  return prescription;
}

/**
 * Watch-compat summary for UI — always states the exact label the watch will show.
 * 'unknown' only remains for a set with no resolvable text at all.
 */
export function strengthSetWatchCompat(set: Pick<StrengthPrescriptionSet, 'garmin'>): {
  status: 'ready' | 'approx' | 'unknown';
  label: string;
} {
  if (!set.garmin) {
    return { status: 'unknown', label: 'Hors catalogue montre' };
  }
  const name = set.garmin.labelFr?.trim() || set.garmin.exerciseName;
  if (set.garmin.confidence === 'fallback') {
    return { status: 'approx', label: `Générique · ${name}` };
  }
  if (set.garmin.confidence === 'fuzzy') {
    return { status: 'approx', label: `Approx. · ${name}` };
  }
  return { status: 'ready', label: `Montre · ${name}` };
}

/** Normalize coach/LLM payload → persisted StrengthPrescription (+ Garmin refs). */
/**
 * A set on its way to persistence: freshly declared by the coach, or re-read
 * from a row written before the declaration existed.
 */
type NormalizableSet = Omit<CoachStrengthPrescription['sets'][number], 'intent' | 'pattern'> & {
  intent?: MovementIntent | null;
  pattern?: MovementPattern | null;
};

function restModeFromCoachSet(set: NormalizableSet): StrengthRestMode {
  if (set.restMode === 'lap') {
    return 'lap';
  }
  if (set.restMode === 'time' || (isSet(set.restSec) && set.restSec > 0)) {
    return 'time';
  }
  return 'lap';
}

function coachSetDetails(set: NormalizableSet, restMode: StrengthRestMode) {
  return {
    intent: set.intent ?? null,
    pattern: set.pattern ?? null,
    durationSec: set.durationSec ?? null,
    weightKg: set.weightKg ?? null,
    perSide: set.perSide ?? null,
    restMode,
    restSec: restMode === 'time' ? (set.restSec ?? 90) : null,
    notes: set.notes ?? null,
  };
}

function coachSetToNormalized(set: NormalizableSet, order: number) {
  const exercise = set.exercise?.trim();
  if (!exercise) {
    return null;
  }
  return {
    exercise,
    // Resolved at write time: the persisted id is the only stable handle later
    // consumers have, and matching a French label gets harder, never easier.
    exerciseCatalogId: resolveExerciseMedia(exercise)?.catalogId ?? null,
    sets: set.sets,
    reps: set.reps,
    order,
    garmin: null,
    ...coachSetDetails(set, restModeFromCoachSet(set)),
  };
}

export function normalizeCoachStrengthPrescription(
  raw: CoachStrengthPrescription | StrengthPrescription | null | undefined,
): StrengthPrescription | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  if ('version' in raw && raw.version === 1) {
    return readStrengthPrescription(raw);
  }

  const sets = raw.sets
    .map((set, order) => coachSetToNormalized(set, order))
    .filter((s): s is NonNullable<typeof s> => isSet(s));

  return readStrengthPrescription({ version: 1, sets });
}

function isNumberedExerciseDump(trimmed: string): boolean {
  return /^1[.)\-–—:]\s+\S/.test(trimmed);
}

function isDerivedSummary(trimmed: string): boolean {
  return trimmed.includes('·') && /×/.test(trimmed);
}

function intentBeforeNumberedList(trimmed: string): string | null {
  const numbered = trimmed.match(/^([\s\S]*?)(?=(?:\n|\s)1[.)\-–—:]\s+\S)/);
  if (!numbered) {
    return null;
  }
  const intent = numbered[1]?.trim() ?? '';
  return intent.length > 0 ? intent : null;
}

/**
 * Coach free-text often embeds a numbered exercise dump that contradicts
 * `strengthPrescription` (the watch / UI source of truth). Keep only the intent
 * clause before the first "1. …" item; drop auto-summaries that merely restate sets.
 */
export function extractStrengthSessionIntent(
  description: string | null | undefined,
): string | null {
  const trimmed = description?.trim();
  if (!trimmed) {
    return null;
  }

  const preamble = intentBeforeNumberedList(trimmed);
  if (isSet(preamble)) {
    return preamble;
  }

  if (isNumberedExerciseDump(trimmed) || isDerivedSummary(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * For STRENGTH sessions: keep/normalize prescription.
 * Description stores coach intent only when a structured prescription exists
 * (aligned with ADR-017: structure is authoritative for the exercise list).
 * For other sports: clear prescription.
 */
export function resolveStrengthFieldsForPersist(input: {
  type: string;
  description?: string | null;
  strengthPrescription?: CoachStrengthPrescription | StrengthPrescription | null;
}): {
  strengthPrescription: StrengthPrescription | null;
  description: string | null;
} {
  if (input.type !== 'STRENGTH') {
    return {
      strengthPrescription: null,
      description: input.description?.trim() || null,
    };
  }

  const prescription = normalizeCoachStrengthPrescription(input.strengthPrescription);
  if (!prescription) {
    return {
      strengthPrescription: null,
      description: input.description?.trim() || null,
    };
  }

  const description =
    extractStrengthSessionIntent(input.description) ??
    formatStrengthPrescriptionSummary(prescription);

  return { strengthPrescription: prescription, description };
}

/** Human summary for description / Google Calendar when athlete left description empty. */
export function formatStrengthPrescriptionSummary(prescription: StrengthPrescription): string {
  return prescription.sets
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((set) => {
      const volume =
        set.durationSec && set.durationSec > 0 && set.reps <= 0
          ? `${set.sets}×${set.durationSec}s`
          : `${set.sets}×${set.reps}`;
      const weight = isSet(set.weightKg) && set.weightKg > 0 ? ` @ ${set.weightKg}kg` : '';
      const side = set.perSide ? ' par côté' : '';
      return `${set.exercise} ${volume}${side}${weight}`;
    })
    .join(' · ');
}
