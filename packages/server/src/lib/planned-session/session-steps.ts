/**
 * A planned session's breakdown, resolved for reading.
 *
 * The web resolves endurance targets against the athlete's thresholds before showing
 * them, so the screen promises exactly what a watch push would send. A native client
 * cannot repeat that resolution without repeating the thresholds, the pace maths and the
 * fallback for unstructured sessions — so the server resolves once and sends the result.
 *
 * Endurance and strength collapse into one row shape on purpose: the reader wants an
 * ordered list of what to do, not two vocabularies.
 */

import type { ActivityType, SessionIntensity } from '@prisma/client';
import { enduranceSportFromActivityType } from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { previewEnduranceSteps } from '@sharpit/app/lib/planned-session/endurance/endurance-preview';
import { effectiveEndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/endurance-session';
import type { AthleteThresholds } from '@sharpit/app/lib/planned-session/endurance/endurance-targets';
import { parseStrengthPrescription } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import {
  resolveSessionRoutines,
  type RoutineStatus,
  type SessionRoutines,
} from '@sharpit/app/lib/planned-session/routines/session-routines';
import type { ZoneCondition } from '@sharpit/app/lib/physical-health/sensitive-zones';

export type PlannedSessionStep = {
  /** Stable within one session, so a client can key a list on it. */
  key: string;
  /** "Échauffement", "Bloc", "Récup"… or the exercise's movement, for strength. */
  label: string;
  /** "10 min", "400 m", "3 × 15"… */
  detail: string | null;
  /** The resolved band — a pace, a power range, a load. Null when unguided. */
  target: string | null;
  /**
   * Steps sharing a group are done together, `repeat` times: a 5 × (bloc + récup) is one
   * group of two steps. A client that listed them apart would read five blocks, then five
   * recoveries.
   */
  group: string;
  /** Repetitions of the group this step belongs to. 1 for a plain step. */
  repeat: number;
  notes: string | null;
};

export type PlannedSessionBreakdown = {
  steps: PlannedSessionStep[];
  /** True when the session had no structure and this was derived from duration + intensity. */
  derived: boolean;
  /** Why a target could not be resolved — an athlete-facing reason, not a stack trace. */
  warnings: string[];
  /** Warm-up before and stretches after (ADR-114, ADR-115) — endurance sessions only. */
  routines?: SessionRoutines | null;
};

const NO_THRESHOLDS: AthleteThresholds = {
  runThresholdPaceSecPerKm: null,
  swimCssSecPer100m: null,
  ftpW: null,
  lthr: null,
  maxHr: null,
};

/** The references an endurance target is resolved against. Absent profile → unresolved. */
export function athleteThresholds(
  profile: AthleteThresholds | null | undefined,
): AthleteThresholds {
  if (!profile) {
    return NO_THRESHOLDS;
  }
  const { runThresholdPaceSecPerKm, swimCssSecPer100m, ftpW, lthr, maxHr } = profile;
  return { runThresholdPaceSecPerKm, swimCssSecPer100m, ftpW, lthr, maxHr };
}

const EMPTY: PlannedSessionBreakdown = { steps: [], derived: false, warnings: [] };

export type PlannedSessionForSteps = {
  type: ActivityType;
  durationMin: number | null;
  intensity: SessionIntensity | null;
  endurancePrescription?: unknown;
  strengthPrescription?: unknown;
  routines?: unknown;
  warmupStatus?: RoutineStatus | null;
  cooldownStatus?: RoutineStatus | null;
};

export function buildPlannedSessionSteps(
  session: PlannedSessionForSteps,
  thresholds: AthleteThresholds,
  options?: { defaultPoolLengthM?: number | null; zones?: readonly ZoneCondition[] },
): PlannedSessionBreakdown {
  if (session.type === 'STRENGTH') {
    return strengthBreakdown(session.strengthPrescription);
  }

  const sport = enduranceSportFromActivityType(session.type);
  if (!sport) {
    return EMPTY;
  }

  const { prescription, derived, warnings } = effectiveEndurancePrescription({
    sport,
    durationMin: session.durationMin,
    intensity: session.intensity,
    stored: session.endurancePrescription,
    thresholds,
    defaultPoolLengthM: options?.defaultPoolLengthM,
  });

  const steps = previewEnduranceSteps(prescription, thresholds).map((step) => ({
    key: step.key,
    label: step.strokeLabel ? `${step.kindLabel} · ${step.strokeLabel}` : step.kindLabel,
    detail: step.durationLabel,
    target: step.targetLabel,
    group: step.group,
    repeat: step.repeat,
    notes: step.notes,
  }));

  const routines = resolveSessionRoutines({
    type: session.type,
    intensity: session.intensity,
    routines: session.routines,
    zones: options?.zones,
    warmupStatus: session.warmupStatus,
    cooldownStatus: session.cooldownStatus,
  });
  return { steps, derived, warnings, routines };
}

function strengthBreakdown(raw: unknown): PlannedSessionBreakdown {
  const prescription = parseStrengthPrescription(raw);
  if (!prescription) {
    return EMPTY;
  }

  const steps = [...prescription.sets]
    .sort((left, right) => left.order - right.order)
    .map((set, index) => ({
      key: `strength-${index}`,
      label: set.exercise,
      detail: strengthDetail(set),
      target: set.weightKg ? `${set.weightKg} kg` : null,
      group: `strength-${index}`,
      repeat: 1,
      notes: set.notes?.trim() || null,
    }));

  // Never derived: a strength session without a prescription has no structure to infer,
  // unlike an endurance one where duration and intensity imply a shape.
  return { steps, derived: false, warnings: [] };
}

function strengthDetail(set: { sets: number; reps: number; durationSec?: number | null }): string {
  if (set.reps > 0) {
    return `${set.sets} × ${set.reps}`;
  }
  if (set.durationSec) {
    return `${set.sets} × ${set.durationSec} s`;
  }
  return `${set.sets} séries`;
}
