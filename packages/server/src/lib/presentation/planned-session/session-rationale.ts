/**
 * Session Rationale — presentation mapping.
 *
 * Pure: takes an already-fetched PlannedSession and (if it originated from the coach)
 * its full CoachingDecisionWithHistory, and maps to the four-bucket ViewModel. All I/O
 * (fetching the session, its origin decision, action history, outcome) happens in the
 * API route — this function does none.
 */

import type { ActivityType, SessionIntensity } from '@prisma/client';
import { isSet } from '@sharpit/shared/value';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { formatDate } from '@sharpit/app/lib/format';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import { deriveSessionExecutionState } from '@sharpit/server/lib/decision-memory/session-execution';
import { describeOutcome } from '@sharpit/server/lib/decision-memory/describe-outcome';
import { describeSnapshotContext } from '@sharpit/server/lib/presentation/coaching/snapshot-context-labels';
import { labelEvidenceRefs } from '@sharpit/server/lib/presentation/coaching/evidence-ref-labels';
import type {
  SessionRationaleActionEntry,
  SessionRationaleChosen,
  SessionRationaleGate,
  SessionRationaleInferred,
  SessionRationaleOutcome,
  SessionRationaleSuggested,
  SessionRationaleViewModel,
} from '@sharpit/app/presentation/session-rationale-view-model';
import type { CoachingDecisionWithHistory } from '@sharpit/app/lib/decision-memory/types';

const EXECUTION_STATE_LABEL: Record<string, string> = {
  NOT_SCHEDULED: 'Pas encore planifiée',
  SCHEDULED: 'Planifiée',
  COMPLETED: 'Réalisée',
  SKIPPED: 'Non réalisée',
  SUPERSEDED: 'Remplacée depuis',
};

const ACTION_TYPE_LABEL: Record<string, string> = {
  ACCEPTED: 'Acceptée',
  MODIFIED: 'Modifiée avant ajout',
  REJECTED: 'Refusée',
  OVERRIDDEN: 'Modifiée après coup',
};

/** Weekly-objective relation is only stated when the Gate itself already found something to say about it. */
const WEEKLY_OBJECTIVE_RULE_CODES = new Set([
  'WEEKLY_LOAD_EXCEEDED',
  'INTENSITY_DISTRIBUTION_EXCEEDED',
]);

function buildInferred(decision: CoachingDecisionWithHistory): SessionRationaleInferred {
  return describeSnapshotContext(decision.snapshotContext);
}

function buildGate(decision: CoachingDecisionWithHistory): SessionRationaleGate {
  const { gateResult } = decision;
  return {
    status: gateResult.status,
    findings: gateResult.findings.map((f) => ({
      rationale: f.rationale,
      severity: f.severity,
      evidenceLabels: labelEvidenceRefs(f.evidenceRefs),
    })),
    requiredAssumptions: gateResult.requiredAssumptions,
    saferAlternativeLabel: gateResult.saferAlternative
      ? [
          gateResult.saferAlternative.intensity
            ? intensityLabels[gateResult.saferAlternative.intensity]
            : null,
          isSet(gateResult.saferAlternative.load)
            ? `~${gateResult.saferAlternative.load} TSS`
            : null,
        ]
          .filter(Boolean)
          .join(', ') || null
      : null,
  };
}

function buildSuggested(decision: CoachingDecisionWithHistory): SessionRationaleSuggested {
  const weeklyFinding = decision.gateResult.findings.find((f) =>
    WEEKLY_OBJECTIVE_RULE_CODES.has(f.ruleCode),
  );
  return {
    purpose: decision.proposal.rationale,
    weeklyObjectiveRelation: weeklyFinding?.rationale ?? null,
    gate: buildGate(decision),
  };
}

function buildChosen(
  decision: CoachingDecisionWithHistory,
  executionState: SessionRationaleChosen['executionState'],
): SessionRationaleChosen {
  const actionHistory: SessionRationaleActionEntry[] = decision.actions.map((action) => ({
    actionType: action.actionType,
    label: ACTION_TYPE_LABEL[action.actionType] ?? action.actionType,
    occurredAt: action.occurredAt.toISOString(),
    source: action.source,
    rationale: action.rationale,
  }));

  return {
    actionHistory,
    executionState,
    executionStateLabel: EXECUTION_STATE_LABEL[executionState] ?? executionState,
  };
}

function buildOutcome(decision: CoachingDecisionWithHistory): SessionRationaleOutcome | null {
  if (!decision.outcome) {
    return null;
  }
  return {
    status: decision.outcome.outcomeStatus,
    wording: describeOutcome(decision.outcome),
  };
}

export function buildSessionRationaleViewModel(input: {
  session: {
    id: string;
    type: ActivityType;
    intensity: SessionIntensity | null;
    durationMin: number | null;
    load: number | null;
    date: Date;
    completed: boolean;
    activityId: string | null;
  };
  decision: CoachingDecisionWithHistory | null;
  now: Date;
}): SessionRationaleViewModel {
  const { session, decision, now } = input;

  const observed = {
    type: activityTypeLabels[session.type],
    intensityLabel: session.intensity ? intensityLabels[session.intensity] : null,
    durationMin: session.durationMin,
    load: session.load,
    dateLabel: formatDate(session.date),
  };

  if (!decision) {
    return {
      sessionId: session.id,
      origin: 'MANUAL',
      observed,
      inferred: null,
      suggested: null,
      chosen: null,
      outcome: null,
      emptyState: {
        title: 'Séance ajoutée manuellement',
        description: "Cette séance n'a pas été proposée par le coach — pas d'analyse à afficher.",
      },
    };
  }

  const executionState = deriveSessionExecutionState(
    { completed: session.completed, activityId: session.activityId, date: session.date },
    now,
    true,
  );

  return {
    sessionId: session.id,
    origin: 'COACH',
    observed,
    inferred: buildInferred(decision),
    suggested: buildSuggested(decision),
    chosen: buildChosen(decision, executionState),
    outcome: buildOutcome(decision),
    emptyState: null,
  };
}
