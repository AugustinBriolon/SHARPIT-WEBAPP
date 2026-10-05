/**
 * Plan Safety & Coherence Gate — domain types.
 *
 * A deterministic validation layer between LLM-generated coaching proposals
 * (coach/plan, coach/adapt) and persistence/presentation. Not a physiological
 * engine — it only reads already-computed AthleteSnapshot/DecisionState and
 * history, never infers new physiological state.
 *
 * @see docs/adr/ADR-005-plan-safety-gate-placement.md
 */

import type { ZoneCondition } from '@sharpit/app/lib/physical-health/sensitive-zones';
import type { ActivityType, GoalHorizon, PlanPhase, SessionIntensity } from '@prisma/client';
import type { CoachEndurancePrescription } from '@sharpit/app/lib/planned-session/endurance/coach-endurance-prescription';
import type { CoachStrengthPrescription } from '@sharpit/app/lib/planned-session/strength/strength-prescription';
import type { SerializedDecisionState } from '@sharpit/core/decision/adapters';
import type { PhysicalHealthData, TrainingCapacity } from '@sharpit/app/athlete-state/today-state';
import type { PracticedSportId } from '@sharpit/app/lib/practiced-sports';

/** Minimal, deterministic input the Gate needs — built once at the API boundary, never fetched by the Gate itself. */
export type GateContext = {
  readonly trainingDayId: string;
  readonly decision: SerializedDecisionState | null;
  readonly physicalHealth: PhysicalHealthData | null;
  /**
   * The zones the athlete declared (ADR-068) — what `SENSITIVE_ZONE_LOADED` reads. Absent:
   * the rule falls back to the snapshot's inferred conditions.
   */
  readonly trainingZones?: readonly ZoneCondition[];
  readonly fatigueTrainingCapacity: TrainingCapacity | null;
  /**
   * One entry per training day, carrying the Core's Training Stress, for
   * computeTrainingLoad (ACWR, rolling weekly load).
   *
   * Not raw activities: reading `Activity.load` here evaluated the Gate's load
   * ceiling against a column that mixed Garmin's TSS with its EPOC training load,
   * landing about 15% below what the dashboard reports. See ADR-011.
   */
  readonly dailyTrainingStress: readonly { load: number | null; date: Date }[];
  /** Existing PlannedSession rows covering the proposal window (± lookback for spacing rules). */
  readonly existingSessions: readonly GateExistingSession[];
  readonly goal: { horizon: GoalHorizon | null; targetDate: Date | null } | null;
  /** Weeks of the active TrainingPlan overlapping the proposal window, if any. */
  readonly planWeeks: readonly { weekStart: Date; phase: PlanPhase; targetLoad: number }[];
  /** null when no calendar is connected — calendar-conflict rule is skipped, not warned. */
  readonly busyBlocks: readonly { dayKey: string; start: string; end: string }[] | null;
  readonly athleteProfile: { hasThresholds: boolean } | null;
  /**
   * Normalized practiced sports (null → all core). Used to reject ADD of non-practiced types.
   * Empty skips the rule (legacy fixtures).
   */
  readonly practicedSports: readonly PracticedSportId[];
  /** Reference "now" for past-date / spacing checks — injected, not read from Date.now() inside rules. */
  readonly now: Date;
};

export type GateExistingSession = {
  readonly id: string;
  readonly date: Date;
  readonly type: ActivityType;
  readonly intensity: SessionIntensity | null;
  readonly completed: boolean;
  readonly load: number | null;
};

/** A normalized LLM-proposed session, mapped from coachPlanSchema or adaptPlanSchema. */
export type GateProposal = {
  /** Existing PlannedSession id for MODIFY, null for ADD. */
  readonly sessionId: string | null;
  readonly action: 'ADD' | 'MODIFY';
  /** yyyy-MM-dd — already resolved from dayOffset by the caller. */
  readonly date: string;
  readonly startTime: string | null;
  readonly type: ActivityType;
  readonly intensity: SessionIntensity | null;
  readonly durationMin: number | null;
  readonly load: number | null;
  readonly title: string | null;
  /** Structured exercises for STRENGTH proposals — null for other sports. */
  readonly strengthPrescription?: CoachStrengthPrescription | null;
  readonly endurancePrescription?: CoachEndurancePrescription | null;
  /** LLM's own explanation for this proposal — carried through unused by Gate rules, consumed by presentation. */
  readonly rationale: string | null;
  /**
   * Option B — which race/goal this proposed session serves (presentation / Decision Memory).
   * Gate rules may read it; Core engines do not.
   */
  readonly goalId?: string | null;
};

export type GateStatus = 'ACCEPTED' | 'WARNING' | 'REQUIRES_CONFIRMATION' | 'REJECTED';

/** Severity ranking, worst first — used to fold findings into a single session status. */
export const GATE_STATUS_SEVERITY_ORDER: readonly GateStatus[] = [
  'REJECTED',
  'REQUIRES_CONFIRMATION',
  'WARNING',
  'ACCEPTED',
];

export type RuleFinding = {
  readonly ruleCode: string;
  /** Never 'ACCEPTED' — a rule that finds nothing wrong returns no finding at all. */
  readonly severity: Exclude<GateStatus, 'ACCEPTED'>;
  readonly rationale: string;
  readonly evidenceRefs: readonly string[];
  readonly requiredAssumption?: string;
  readonly saferAlternative?: GateProposal;
};

export type GateSessionResult = {
  readonly proposal: GateProposal;
  readonly status: GateStatus;
  readonly findings: readonly RuleFinding[];
  readonly requiredAssumptions: readonly string[];
  readonly saferAlternative: GateProposal | null;
};

export type GateResult = {
  readonly sessions: readonly GateSessionResult[];
  /** Findings that apply to the whole batch, not one session (weekly load, intensity distribution). */
  readonly planLevelFindings: readonly RuleFinding[];
};

/** One rule = one pure function. No I/O, no Date.now() — everything comes from GateContext. */
export type PlanGateRule = (context: GateContext, proposal: GateProposal) => RuleFinding[];

/** A plan-level rule evaluates the whole batch of proposals together. */
export type PlanLevelGateRule = (
  context: GateContext,
  proposals: readonly GateProposal[],
) => RuleFinding[];
