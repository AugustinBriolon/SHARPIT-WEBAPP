/**
 * Decision Memory — Prisma persistence.
 *
 * The only place in this module that touches the database. `CoachingDecision.proposal`,
 * `.gateResult`, and `.snapshotContext` are set once at creation and never updated —
 * there is no update path for them here, matching DecisionRecordRepository's own
 * save-only shape (see ADR-006).
 */

import { addHours } from 'date-fns';
import { prisma } from '@sharpit/db/client';
import type { GateProposal, GateSessionResult } from '@sharpit/app/lib/plan-gate/types';
import { canRecordAction } from './lifecycle';
import type {
  CoachingDecisionActionRecord,
  CoachingDecisionActionSource,
  CoachingDecisionActionType,
  CoachingDecisionRecord,
  CoachingDecisionSource,
  CoachingDecisionWithHistory,
  DecisionSnapshotContext,
  ExecutionMatch,
  OutcomeEvaluation,
  SafetySignal,
  ShortTermRecoveryResponse,
  SubjectiveResponse,
} from '@sharpit/app/lib/decision-memory/types';
import { mapPurposesFromActions, purposeFromProposal } from './session-purpose';

/** A PRESENTED decision with no athlete action after this many hours is treated as EXPIRED. */
export const PRESENTED_EXPIRY_HOURS = 48;
/** Outcomes are only evaluated once this many hours have passed since the session date. */
export const OUTCOME_EVALUATION_DELAY_HOURS = 72;

type CoachingDecisionRow = {
  id: string;
  athleteId: string;
  trainingDayId: string;
  source: CoachingDecisionSource;
  status: string;
  proposal: unknown;
  gateResult: unknown;
  snapshotContext: unknown;
  snapshotIdAtRecommendation: string | null;
  createdAt: Date;
};

function toDomain(row: CoachingDecisionRow): CoachingDecisionRecord {
  return {
    id: row.id,
    athleteId: row.athleteId,
    trainingDayId: row.trainingDayId,
    source: row.source,
    status: row.status as CoachingDecisionRecord['status'],
    proposal: row.proposal as GateProposal,
    gateResult: row.gateResult as GateSessionResult,
    snapshotContext: row.snapshotContext as DecisionSnapshotContext,
    snapshotIdAtRecommendation: row.snapshotIdAtRecommendation,
    createdAt: row.createdAt,
  };
}

export async function createCoachingDecision(
  athleteId: string,
  input: {
    trainingDayId: string;
    source: CoachingDecisionSource;
    proposal: GateProposal;
    gateResult: GateSessionResult;
    snapshotContext: DecisionSnapshotContext;
    snapshotIdAtRecommendation: string | null;
  },
): Promise<CoachingDecisionRecord> {
  const row = await prisma.coachingDecision.create({
    data: {
      athleteId,
      trainingDayId: input.trainingDayId,
      source: input.source,
      proposal: input.proposal as object,
      gateResult: input.gateResult as object,
      snapshotContext: input.snapshotContext as object,
      snapshotIdAtRecommendation: input.snapshotIdAtRecommendation,
    },
  });
  return toDomain(row);
}

export async function findCoachingDecisionById(
  athleteId: string,
  id: string,
): Promise<CoachingDecisionRecord | null> {
  const row = await prisma.coachingDecision.findFirst({ where: { id, athleteId } });
  return row ? toDomain(row) : null;
}

/**
 * Latest morning-recalibration decision for a training day (any status).
 * Identified via snapshotContext.morningRecalibration (PLAN_ADAPTER source).
 */
export async function findMorningRecalibrationDecision(
  athleteId: string,
  trainingDayId: string,
  sessionId?: string,
): Promise<CoachingDecisionRecord | null> {
  const rows = await prisma.coachingDecision.findMany({
    where: { athleteId, trainingDayId, source: 'PLAN_ADAPTER' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  for (const row of rows) {
    const ctx = row.snapshotContext as DecisionSnapshotContext | null;
    if (!ctx?.morningRecalibration) {
      continue;
    }
    const decision = toDomain(row);
    if (sessionId && decision.proposal.sessionId !== sessionId) {
      continue;
    }
    return decision;
  }
  return null;
}

/**
 * Finds the decision behind a persisted PlannedSession, via the action that created it.
 * Used by the override-detection hook on the manual planned-session edit route.
 */
export async function findDecisionForPlannedSession(
  athleteId: string,
  plannedSessionId: string,
): Promise<CoachingDecisionRecord | null> {
  const action = await prisma.coachingDecisionAction.findFirst({
    where: {
      resultingPlannedSessionId: plannedSessionId,
      decision: { athleteId },
    },
    orderBy: { occurredAt: 'desc' },
  });
  if (!action) {
    return null;
  }
  return findCoachingDecisionById(athleteId, action.decisionId);
}

/**
 * Athlete-facing "why" for each planned session, from the newest Decision Memory
 * action that created or accepted it. Empty when the session was never linked to a
 * decision or the proposal carried no rationale.
 */
export async function findSessionPurposesByPlannedSessionIds(
  athleteId: string,
  plannedSessionIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(plannedSessionIds.filter(Boolean))];
  if (ids.length === 0) {
    return new Map();
  }
  const actions = await prisma.coachingDecisionAction.findMany({
    where: {
      resultingPlannedSessionId: { in: ids },
      decision: { athleteId },
    },
    orderBy: { occurredAt: 'desc' },
    select: {
      resultingPlannedSessionId: true,
      decision: { select: { proposal: true } },
    },
  });
  return mapPurposesFromActions(
    actions.map((action) => ({
      resultingPlannedSessionId: action.resultingPlannedSessionId,
      proposal: action.decision.proposal,
    })),
  );
}

/** Single-session twin of {@link findSessionPurposesByPlannedSessionIds}. */
export async function findSessionPurposeForPlannedSession(
  athleteId: string,
  plannedSessionId: string,
): Promise<string | null> {
  const decision = await findDecisionForPlannedSession(athleteId, plannedSessionId);
  return decision ? purposeFromProposal(decision.proposal) : null;
}

/**
 * A decision with its full append-only action log and outcome (if evaluated) — the
 * read shape presentation builders need. Read-only: no write path added here.
 */
export async function findDecisionWithHistory(
  athleteId: string,
  decisionId: string,
): Promise<CoachingDecisionWithHistory | null> {
  const row = await prisma.coachingDecision.findFirst({
    where: { id: decisionId, athleteId },
    include: {
      actions: { orderBy: { occurredAt: 'asc' } },
      outcome: true,
    },
  });
  if (!row) {
    return null;
  }

  const { actions, outcome, ...decisionRow } = row;
  return {
    ...toDomain(decisionRow),
    actions: actions.map((action) => ({
      id: action.id,
      decisionId: action.decisionId,
      actionType: action.actionType,
      occurredAt: action.occurredAt,
      source: action.source,
      rationale: action.rationale,
      resultingPlannedSessionId: action.resultingPlannedSessionId,
    })),
    outcome: outcome
      ? {
          outcomeStatus: outcome.outcomeStatus,
          executionMatch: outcome.executionMatch as ExecutionMatch | null,
          subjectiveResponse: outcome.subjectiveResponse as SubjectiveResponse | null,
          shortTermRecoveryResponse:
            outcome.shortTermRecoveryResponse as ShortTermRecoveryResponse | null,
          safetySignal: outcome.safetySignal as SafetySignal | null,
          limitations: outcome.limitations,
          confidence: outcome.confidence,
        }
      : null,
  };
}

/**
 * Records an athlete action. Returns null (no-op) when the transition is invalid for the
 * decision's current status — callers should treat null as "nothing recorded," not throw,
 * since this is typically called from best-effort hooks (e.g. a calendar edit) that must
 * not fail the primary operation.
 */
export async function recordDecisionAction(
  athleteId: string,
  input: {
    decisionId: string;
    actionType: CoachingDecisionActionType;
    source: CoachingDecisionActionSource;
    rationale?: string | null;
    resultingPlannedSessionId?: string | null;
  },
): Promise<CoachingDecisionActionRecord | null> {
  const decision = await prisma.coachingDecision.findFirst({
    where: { id: input.decisionId, athleteId },
  });
  if (!decision) {
    return null;
  }
  if (!canRecordAction(decision.status, input.actionType)) {
    return null;
  }

  const action = await prisma.coachingDecisionAction.create({
    data: {
      decisionId: input.decisionId,
      actionType: input.actionType,
      source: input.source,
      rationale: input.rationale ?? null,
      resultingPlannedSessionId: input.resultingPlannedSessionId ?? null,
    },
  });

  if (input.actionType !== 'OVERRIDDEN') {
    await prisma.coachingDecision.update({
      where: { id: input.decisionId },
      data: { status: input.actionType },
    });
  }

  return {
    id: action.id,
    decisionId: action.decisionId,
    actionType: action.actionType,
    occurredAt: action.occurredAt,
    source: action.source,
    rationale: action.rationale,
    resultingPlannedSessionId: action.resultingPlannedSessionId,
  };
}

/** PRESENTED decisions old enough to be considered abandoned by the athlete. */
export async function findStalePresentedDecisions(
  now: Date = new Date(),
): Promise<CoachingDecisionRecord[]> {
  const threshold = addHours(now, -PRESENTED_EXPIRY_HOURS);
  const rows = await prisma.coachingDecision.findMany({
    where: { status: 'PRESENTED', createdAt: { lt: threshold } },
  });
  return rows.map(toDomain);
}

/** Same as {@link findStalePresentedDecisions}, scoped to one athlete. */
export async function findStalePresentedDecisionsForAthlete(
  athleteId: string,
  now: Date = new Date(),
): Promise<CoachingDecisionRecord[]> {
  const threshold = addHours(now, -PRESENTED_EXPIRY_HOURS);
  const rows = await prisma.coachingDecision.findMany({
    where: { athleteId, status: 'PRESENTED', createdAt: { lt: threshold } },
  });
  return rows.map(toDomain);
}

export async function expireDecision(decisionId: string, now: Date = new Date()): Promise<void> {
  await prisma.$transaction([
    prisma.coachingDecision.update({ where: { id: decisionId }, data: { status: 'EXPIRED' } }),
    prisma.coachingDecisionAction.create({
      data: {
        decisionId,
        actionType: 'REJECTED',
        source: 'BATCH_EXPIRY',
        occurredAt: now,
        rationale: `No athlete action within ${PRESENTED_EXPIRY_HOURS}h of being presented.`,
      },
    }),
  ]);
}

/**
 * Decisions ready for outcome evaluation: an ACCEPTED/MODIFIED decision with a resulting
 * PlannedSession whose date is far enough in the past, and no outcome recorded yet.
 */
export async function findDecisionsPendingOutcomeEvaluation(
  now: Date = new Date(),
): Promise<{ decision: CoachingDecisionRecord; plannedSessionId: string }[]> {
  const cutoff = addHours(now, -OUTCOME_EVALUATION_DELAY_HOURS);

  const actions = await prisma.coachingDecisionAction.findMany({
    where: {
      actionType: { in: ['ACCEPTED', 'MODIFIED'] },
      resultingPlannedSessionId: { not: null },
      decision: {
        status: { in: ['ACCEPTED', 'MODIFIED'] },
        outcome: null,
      },
    },
    // Cron-wide sweep across all athletes — this one intentionally stays global.
    include: { decision: true },
    orderBy: { occurredAt: 'desc' },
  });

  const seen = new Set<string>();
  const pending: { decision: CoachingDecisionRecord; plannedSessionId: string }[] = [];
  for (const action of actions) {
    if (!action.resultingPlannedSessionId || seen.has(action.decisionId)) {
      continue;
    }
    const session = await prisma.plannedSession.findUnique({
      where: { id: action.resultingPlannedSessionId },
      select: { date: true },
    });
    if (!session || session.date >= cutoff) {
      continue;
    }
    seen.add(action.decisionId);
    pending.push({
      decision: toDomain(action.decision),
      plannedSessionId: action.resultingPlannedSessionId,
    });
  }
  return pending;
}

export async function saveOutcome(
  decisionId: string,
  evaluation: OutcomeEvaluation,
): Promise<void> {
  await prisma.coachingDecisionOutcome.create({
    data: {
      decisionId,
      outcomeStatus: evaluation.outcomeStatus,
      executionMatch: evaluation.executionMatch as object | undefined,
      subjectiveResponse: evaluation.subjectiveResponse as object | undefined,
      shortTermRecoveryResponse: evaluation.shortTermRecoveryResponse as object | undefined,
      safetySignal: evaluation.safetySignal as object | undefined,
      limitations: [...evaluation.limitations],
      confidence: evaluation.confidence,
    },
  });
}

/**
 * Evaluated outcomes since a given date, each paired with its proposal's (type, intensity)
 * — the sole read the on-demand Learning Feedback aggregate needs. No aggregation happens
 * here; that's `buildLearningFeedback` (pure, src/lib/decision-memory/learning-feedback.ts).
 */
export async function findRecentEvaluatedOutcomes(
  athleteId: string,
  sinceDate: Date,
): Promise<
  { outcome: OutcomeEvaluation; type: GateProposal['type']; intensity: GateProposal['intensity'] }[]
> {
  const rows = await prisma.coachingDecisionOutcome.findMany({
    where: {
      evaluatedAt: { gte: sinceDate },
      outcomeStatus: 'EVALUATED',
      decision: { athleteId },
    },
    include: { decision: true },
  });

  return rows.map((row) => {
    const proposal = row.decision.proposal as unknown as GateProposal;
    return {
      outcome: {
        outcomeStatus: row.outcomeStatus,
        executionMatch: row.executionMatch as ExecutionMatch | null,
        subjectiveResponse: row.subjectiveResponse as SubjectiveResponse | null,
        shortTermRecoveryResponse:
          row.shortTermRecoveryResponse as ShortTermRecoveryResponse | null,
        safetySignal: row.safetySignal as SafetySignal | null,
        limitations: row.limitations,
        confidence: row.confidence,
      },
      type: proposal.type,
      intensity: proposal.intensity,
    };
  });
}
