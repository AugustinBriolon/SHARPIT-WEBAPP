import { GoalHorizon, GoalKind, GoalPriority, RaceDiscipline, type Goal } from '@prisma/client';
import { z } from 'zod';
import {
  legacyRaceFormat,
  legacyTargetPerformance,
  missingLegs,
  raceTargetBounds,
  resolveStructuredRace,
} from '@sharpit/app/lib/goals/race-formats';

const optionalNumber = z.coerce.number().optional().nullable();
const optionalString = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v));

export const goalKindSchema = z.nativeEnum(GoalKind);
export const goalHorizonSchema = z.nativeEnum(GoalHorizon);
export const goalPrioritySchema = z.nativeEnum(GoalPriority);

/** Whole number in [min, max]; sanity limits only — the catalog bounds the target (422). */
const optionalInt = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).optional().nullable();

const optionalPriority = z.preprocess(
  (v) => (v === '' || v === 'none' ? null : v),
  goalPrioritySchema.nullable().optional(),
);

/** Structured race fields (ADR-082), shared by goal writes and the projection preview. */
const structuredRaceShape = {
  discipline: z.nativeEnum(RaceDiscipline).optional().nullable(),
  formatKey: optionalString,
  swimM: optionalInt(25, 100_000),
  bikeM: optionalInt(1000, 2_000_000),
  runM: optionalInt(100, 500_000),
  run2M: optionalInt(100, 500_000),
  segments: optionalInt(1, 200),
  bikeElevationM: optionalInt(0, 50_000),
  runElevationM: optionalInt(0, 50_000),
  openWater: z.boolean().optional().nullable(),
  targetSeconds: optionalInt(1, 30 * 86_400),
};

const baseGoalSchema = z.object({
  title: z.string().min(1, 'Le titre est requis'),
  kind: goalKindSchema,
  horizon: goalHorizonSchema.optional().nullable(),
  metricKey: optionalString,
  startValue: optionalNumber,
  currentValue: optionalNumber,
  targetValue: optionalNumber,
  unit: optionalString,
  lowerIsBetter: z.coerce.boolean().optional(),
  targetDate: z.coerce.date().optional().nullable(),
  location: optionalString,
  achieved: z.coerce.boolean().optional(),
  notes: optionalString,
  // Détails course (optionnels)
  priority: optionalPriority,
  raceFormat: optionalString,
  targetPerformance: optionalString,
  ...structuredRaceShape,
});

export const createGoalSchema = baseGoalSchema.refine(
  (data) => data.kind !== GoalKind.RACE || Boolean(data.targetDate),
  { message: 'Une course doit avoir une date', path: ['targetDate'] },
);

export const updateGoalSchema = baseGoalSchema.partial();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

const STRUCTURED_FIELDS = [
  'discipline',
  'formatKey',
  'swimM',
  'bikeM',
  'runM',
  'run2M',
  'segments',
  'bikeElevationM',
  'runElevationM',
  'openWater',
  'targetSeconds',
] as const;
type StructuredField = (typeof STRUCTURED_FIELDS)[number];
type StoredRace = Pick<Goal, StructuredField | 'raceFormat' | 'targetPerformance'>;
type StructuredWrite = Partial<Pick<Goal, StructuredField | 'raceFormat' | 'targetPerformance'>>;

export type SettledRaceWrite =
  | { ok: true; data: StructuredWrite }
  | { ok: false; body: { error: string; minSec?: number; maxSec?: number } };

/** Climbing the form must ask for: a trail or a cyclosportive is read through its D+. */
const REQUIRED_CLIMB: Partial<Record<RaceDiscipline, 'bikeElevationM' | 'runElevationM'>> = {
  TRAIL: 'runElevationM',
  BIKE: 'bikeElevationM',
};

function cleared(): StructuredWrite {
  return Object.fromEntries(STRUCTURED_FIELDS.map((field) => [field, null]));
}

/**
 * An edit of the free text alone (older clients) drops what it contradicts: a new `raceFormat`
 * the structured race, a new `targetPerformance` the structured target.
 */
function legacyEdit(input: UpdateGoalInput, existing: StoredRace | null): StructuredWrite {
  if (!existing || (!existing.discipline && existing.targetSeconds === null)) {
    return {};
  }
  if (input.raceFormat !== undefined && input.raceFormat !== existing.raceFormat) {
    return cleared();
  }
  const newTarget =
    input.targetPerformance !== undefined && input.targetPerformance !== existing.targetPerformance;
  return newTarget ? { targetSeconds: null } : {};
}

function invalid(error: string): SettledRaceWrite {
  return { ok: false, body: { error } };
}

/** The legacy target follows the structured one; clearing the latter clears the former. */
function legacyTarget(input: UpdateGoalInput, targetSeconds: number | null): StructuredWrite {
  if (targetSeconds !== null) {
    return { targetPerformance: legacyTargetPerformance(targetSeconds) };
  }
  return input.targetSeconds === null && input.targetPerformance === undefined
    ? { targetPerformance: null }
    : {};
}

/**
 * Settles a goal write's structured race (ADR-082) over the stored goal: catalog distances,
 * the required legs and climbing, the target within the format's bounds (else 422 with them),
 * and the legacy `raceFormat` / `targetPerformance` derived for older clients and the coach.
 */
export function settleStructuredRace(
  input: UpdateGoalInput,
  existing: StoredRace | null,
): SettledRaceWrite {
  const touched = STRUCTURED_FIELDS.filter((field) => input[field] !== undefined);
  if (touched.length === 0) {
    return { ok: true, data: legacyEdit(input, existing) };
  }
  const merged = {
    ...Object.fromEntries(STRUCTURED_FIELDS.map((field) => [field, existing?.[field] ?? null])),
    ...Object.fromEntries(touched.map((field) => [field, input[field]])),
  } as StructuredWrite;
  const targetSeconds = merged.targetSeconds ?? null;
  if (!merged.discipline && !merged.formatKey) {
    return { ok: true, data: { ...merged, ...legacyTarget(input, targetSeconds) } };
  }
  if (!merged.discipline || !merged.formatKey) {
    return invalid('Une course structurée a une discipline et un format');
  }
  const race = resolveStructuredRace({
    ...merged,
    discipline: merged.discipline,
    formatKey: merged.formatKey,
  });
  if (!race) {
    return invalid('Format inconnu pour cette discipline');
  }
  if (missingLegs(race).length > 0) {
    return invalid('Distance manquante pour ce format');
  }
  const climb = REQUIRED_CLIMB[race.discipline];
  if (climb && (race[climb] ?? null) === null) {
    return invalid('Le dénivelé positif est requis pour ce format');
  }
  const { minSec, maxSec } = raceTargetBounds(race);
  if (targetSeconds !== null && (targetSeconds < minSec || targetSeconds > maxSec)) {
    return {
      ok: false,
      body: { error: 'Objectif de temps irréaliste pour ce format', minSec, maxSec },
    };
  }
  const settled = Object.fromEntries(
    STRUCTURED_FIELDS.map((field) => [field, (race as StructuredWrite)[field] ?? null]),
  );
  return {
    ok: true,
    data: {
      ...settled,
      targetSeconds,
      raceFormat: legacyRaceFormat(race),
      ...legacyTarget(input, targetSeconds),
    },
  };
}

/** `POST /api/v1/goals/projection-preview`: a race not saved yet, as the goal form holds it. */
export const projectionPreviewSchema = z.object({
  ...structuredRaceShape,
  discipline: z.nativeEnum(RaceDiscipline),
  formatKey: z.string().min(1),
  targetDate: z.coerce.date().optional().nullable(),
});
