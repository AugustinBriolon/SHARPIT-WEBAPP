/**
 * Session Rationale — presentation ViewModel contract.
 *
 * Separates what SHARPIT observed (raw facts), inferred (DecisionState interpretation),
 * suggested (LLM purpose + Gate verdict), and what the athlete chose (action history).
 */

import type { PresentationEmptyState } from '@sharpit/app/presentation/types';
import type { GateStatus, RuleFinding } from '@sharpit/app/lib/plan-gate/types';
import type {
  CoachingDecisionActionType,
  CoachingDecisionActionSource,
  SessionExecutionState,
} from '@sharpit/app/lib/decision-memory/types';

export type SessionRationaleObserved = {
  readonly type: string;
  readonly intensityLabel: string | null;
  readonly durationMin: number | null;
  readonly load: number | null;
  readonly dateLabel: string;
};

export type SessionRationaleInferred = {
  readonly overallVerdictLabel: string | null;
  readonly confidenceTierLabel: string | null;
  readonly limitingFactorLabel: string | null;
  readonly physicalHealthCapacityLabel: string | null;
  readonly fatigueTrainingCapacityLabel: string | null;
};

export type SessionRationaleGate = {
  readonly status: GateStatus;
  readonly findings: readonly {
    readonly rationale: string;
    readonly severity: RuleFinding['severity'];
    readonly evidenceLabels: readonly string[];
  }[];
  readonly requiredAssumptions: readonly string[];
  readonly saferAlternativeLabel: string | null;
};

export type SessionRationaleSuggested = {
  readonly purpose: string | null;
  readonly weeklyObjectiveRelation: string | null;
  readonly gate: SessionRationaleGate;
};

export type SessionRationaleActionEntry = {
  readonly actionType: CoachingDecisionActionType;
  readonly label: string;
  readonly occurredAt: string;
  readonly source: CoachingDecisionActionSource;
  readonly rationale: string | null;
};

export type SessionRationaleChosen = {
  readonly actionHistory: readonly SessionRationaleActionEntry[];
  readonly executionState: SessionExecutionState;
  readonly executionStateLabel: string;
};

export type SessionRationaleOutcome = {
  readonly status: 'EVALUATED' | 'INCONCLUSIVE';
  readonly wording: readonly string[];
};

export type SessionRationaleViewModel = {
  readonly sessionId: string;
  /** MANUAL sessions were never proposed by the coach — only `observed` is populated. */
  readonly origin: 'COACH' | 'MANUAL';
  readonly observed: SessionRationaleObserved;
  readonly inferred: SessionRationaleInferred | null;
  readonly suggested: SessionRationaleSuggested | null;
  readonly chosen: SessionRationaleChosen | null;
  readonly outcome: SessionRationaleOutcome | null;
  readonly emptyState: PresentationEmptyState | null;
};
