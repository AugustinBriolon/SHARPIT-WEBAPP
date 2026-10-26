/**
 * Coerce a loose LLM plan object into the persist shape before Gate / decisions.
 *
 * Generation uses a permissive schema (floats, unknown strength enums as strings,
 * startTime without regex). One invented pattern must not discard a whole week.
 */
import { coachSessionRoutinesSchema } from '@sharpit/app/lib/planned-session/routines/session-routines';
import {
  movementIntentSchema,
  movementPatternSchema,
  type MovementIntent,
  type MovementPattern,
} from '@sharpit/app/lib/exercises/movement-taxonomy';
import {
  swimStrokeSchema,
  type SwimStroke,
} from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { strengthRestModeSchema } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import { coachPlanSchema, type CoachPlan } from '@sharpit/app/lib/validators/coach';

function roundInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, roundInt(value, fallback)));
}

function asNullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === '' || value === 'null') {
    return null;
  }
  return typeof value === 'string' ? value : String(value);
}

/** Pad `9:00` → `09:00`; drop garbage that cannot be a clock time. */
export function normalizePlanStartTime(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(raw.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

function parseKnownEnum<T extends string>(
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  value: unknown,
): T | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function truncateNotes(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) {
    return null;
  }
  return raw.trim().slice(0, 240) || null;
}

function optionalClampedInt(value: unknown, max: number): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  return clampInt(value, 0, max, 0);
}

type LooseStrengthSet = {
  exercise?: unknown;
  intent?: unknown;
  pattern?: unknown;
  sets?: unknown;
  reps?: unknown;
  durationSec?: unknown;
  weightKg?: unknown;
  restMode?: unknown;
  restSec?: unknown;
  notes?: unknown;
};

function normalizeWeightKg(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(500, Math.max(0, n)) : null;
}

function normalizeStrengthSet(set: LooseStrengthSet) {
  return {
    exercise: asNullableString(set.exercise)?.trim() ?? '',
    intent: parseKnownEnum<MovementIntent>(movementIntentSchema, set.intent),
    pattern: parseKnownEnum<MovementPattern>(movementPatternSchema, set.pattern),
    sets: clampInt(set.sets, 1, 20, 1),
    reps: clampInt(set.reps, 0, 100, 0),
    durationSec: optionalClampedInt(set.durationSec, 3600),
    weightKg: normalizeWeightKg(set.weightKg),
    restMode: parseKnownEnum(strengthRestModeSchema, set.restMode),
    restSec: optionalClampedInt(set.restSec, 600),
    notes: truncateNotes(set.notes),
  };
}

function normalizeStrengthPrescription(raw: unknown) {
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return null;
  }
  const { sets } = raw as { sets?: unknown };
  if (!Array.isArray(sets) || sets.length === 0) {
    return null;
  }
  const normalized = sets
    .map((set) => normalizeStrengthSet((set ?? {}) as LooseStrengthSet))
    .filter((set) => set.exercise.length > 0)
    .slice(0, 20);
  return normalized.length > 0 ? { sets: normalized } : null;
}

const ENDURANCE_KINDS = new Set(['warmup', 'interval', 'recovery', 'rest', 'cooldown']);
const ENDURANCE_EFFORTS = new Set([
  'RECOVERY',
  'ENDURANCE',
  'TEMPO',
  'THRESHOLD',
  'VO2MAX',
  'RACE',
]);

function pickEnduranceKind(value: unknown): string {
  const kindRaw = asNullableString(value);
  return kindRaw && ENDURANCE_KINDS.has(kindRaw) ? kindRaw : 'interval';
}

function pickEnduranceEffort(value: unknown, kind: string): string | undefined {
  if (kind === 'rest') {
    return undefined;
  }
  const effortRaw = asNullableString(value);
  return effortRaw && ENDURANCE_EFFORTS.has(effortRaw) ? effortRaw : undefined;
}

function setIfPresent(
  next: Record<string, unknown>,
  key: string,
  value: unknown,
  present: boolean,
): void {
  if (present) {
    next[key] = value;
  }
}

function assignOptionalStepFields(
  next: Record<string, unknown>,
  step: Record<string, unknown>,
  kind: string,
): void {
  setIfPresent(
    next,
    'minutes',
    typeof step.minutes === 'number' ? Math.min(360, Math.max(0.5, step.minutes)) : null,
    typeof step.minutes === 'number' && Number.isFinite(step.minutes),
  );
  setIfPresent(
    next,
    'meters',
    clampInt(step.meters, 25, 200_000, 25),
    step.meters !== undefined && step.meters !== null,
  );
  setIfPresent(next, 'lap', step.lap, typeof step.lap === 'boolean');
  const effort = pickEnduranceEffort(step.effort, kind);
  setIfPresent(next, 'effort', effort, Boolean(effort));
  const stroke = parseKnownEnum<SwimStroke>(swimStrokeSchema, step.stroke);
  setIfPresent(next, 'stroke', stroke, stroke !== null);
  const notes = truncateNotes(step.notes);
  setIfPresent(next, 'notes', notes, Boolean(notes));
}

function normalizeEnduranceStep(step: Record<string, unknown>) {
  const kind = pickEnduranceKind(step.kind);
  const next: Record<string, unknown> = { kind };
  assignOptionalStepFields(next, step, kind);
  return next;
}

function normalizeEndurancePrescription(raw: unknown) {
  if (raw === undefined || raw === null || typeof raw !== 'object') {
    return null;
  }
  const { blocks, poolLengthM } = raw as { blocks?: unknown; poolLengthM?: unknown };
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return null;
  }
  const normalizedBlocks = blocks.slice(0, 30).map((block) => {
    const b = (block ?? {}) as { times?: unknown; steps?: unknown };
    const steps = Array.isArray(b.steps)
      ? b.steps
          .slice(0, 6)
          .map((step) => normalizeEnduranceStep((step ?? {}) as Record<string, unknown>))
      : [];
    const next: Record<string, unknown> = { steps };
    if (b.times !== undefined && b.times !== null) {
      next.times = clampInt(b.times, 1, 30, 1);
    }
    return next;
  });
  const result: Record<string, unknown> = { blocks: normalizedBlocks };
  if (poolLengthM !== undefined && poolLengthM !== null) {
    result.poolLengthM = Math.min(100, Math.max(10, Number(poolLengthM)));
  }
  return result;
}

/**
 * The coach's prescriptions on any proposal, coerced as a week's are: an invented step kind
 * becomes an interval rather than failing the whole answer. A prescription left out stays out
 * — on an adjustment it means « leave it as it is ».
 */
export function normalizeCoachPrescriptions<T extends Record<string, unknown>>(proposal: T): T {
  const next: Record<string, unknown> = { ...proposal };
  if (proposal.endurancePrescription !== null && proposal.endurancePrescription !== undefined) {
    next.endurancePrescription = normalizeEndurancePrescription(proposal.endurancePrescription);
  }
  if (proposal.strengthPrescription !== null && proposal.strengthPrescription !== undefined) {
    next.strengthPrescription = normalizeStrengthPrescription(proposal.strengthPrescription);
  }
  return next as T;
}

const SESSION_TYPES = new Set(['RUN', 'BIKE', 'SWIM', 'STRENGTH']);
const INTENSITIES = new Set(['RECOVERY', 'ENDURANCE', 'TEMPO', 'THRESHOLD', 'VO2MAX', 'RACE']);

function sessionTypeAndIntensity(raw: Record<string, unknown>): {
  type: string;
  intensity: string;
} | null {
  const type = asNullableString(raw.type);
  const intensity = asNullableString(raw.intensity);
  if (!type || !SESSION_TYPES.has(type) || !intensity || !INTENSITIES.has(intensity)) {
    return null;
  }
  return { type, intensity };
}

/** A malformed custom routine falls back to the library rather than sinking the session. */
function normalizeRoutines(raw: unknown) {
  const parsed = coachSessionRoutinesSchema.safeParse(raw);
  return parsed.success && (parsed.data.warmup || parsed.data.cooldown) ? parsed.data : null;
}

function normalizeSession(raw: Record<string, unknown>) {
  const typed = sessionTypeAndIntensity(raw);
  if (!typed) {
    return null;
  }
  return {
    dayOffset: clampInt(raw.dayOffset, 0, 27, 0),
    startTime: normalizePlanStartTime(raw.startTime),
    type: typed.type,
    intensity: typed.intensity,
    title: asNullableString(raw.title)?.trim() || 'Séance',
    description: asNullableString(raw.description)?.trim() || '',
    strengthPrescription: normalizeStrengthPrescription(raw.strengthPrescription),
    endurancePrescription: normalizeEndurancePrescription(raw.endurancePrescription),
    routines: normalizeRoutines(raw.routines),
    durationMin: clampInt(raw.durationMin, 10, 420, 45),
    load: clampInt(raw.load, 0, 400, 0),
    rationale: asNullableString(raw.rationale)?.trim() || '',
  };
}

export type NormalizeCoachPlanResult =
  { ok: true; plan: CoachPlan } | { ok: false; issues: string[] };

/**
 * Turn raw structured-generation output into a Gate-ready CoachPlan.
 * Unknown strength enums → null (taxonomy fallback). Invalid sessions dropped.
 */
export function normalizeCoachPlanGeneration(raw: unknown): NormalizeCoachPlanResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, issues: ['Réponse coach vide ou illisible.'] };
  }
  const root = raw as { summary?: unknown; sessions?: unknown };
  const sessionsRaw = Array.isArray(root.sessions) ? root.sessions : [];
  const sessions = sessionsRaw
    .map((s) => normalizeSession((s ?? {}) as Record<string, unknown>))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .slice(0, 14);

  if (sessions.length === 0) {
    return { ok: false, issues: ['Aucune séance exploitable dans la proposition.'] };
  }

  const candidate = {
    summary: asNullableString(root.summary)?.trim() || 'Proposition de semaine.',
    sessions,
  };

  const parsed = coachPlanSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`,
      ),
    };
  }
  return { ok: true, plan: parsed.data };
}
