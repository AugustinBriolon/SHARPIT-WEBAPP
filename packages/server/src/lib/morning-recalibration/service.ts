/**
 * Morning recalibration service — ensure / accept / reject.
 * Presentation + Decision Memory only (Core frozen).
 */

import { Prisma } from '@prisma/client';
import { endOfDay, startOfDay } from 'date-fns';
import type { GateProposal, GateSessionResult } from '@sharpit/app/lib/plan-gate/types';
import { buildDecisionSnapshotContext } from '@sharpit/server/lib/decision-memory/build-snapshot-context';
import {
  createCoachingDecision,
  expireDecision,
  findCoachingDecisionById,
  findMorningRecalibrationDecision,
  recordDecisionAction,
} from '@sharpit/server/lib/decision-memory/repository';
import type { DecisionSnapshotContext } from '@sharpit/app/lib/decision-memory/types';
import {
  evaluateMorningSessionRecalibration,
  isStrengthLikeMorningSport,
  type MorningRecalibrationProposal,
} from '@sharpit/server/lib/morning-recalibration/evaluate';
import { getOrBuildAthleteSnapshot } from '@sharpit/server/lib/athlete-state/snapshot-service';
import { hasMorningWellnessCheckin } from '@sharpit/server/lib/journal/wellness-checkin';
import { prisma } from '@sharpit/db/client';
import { updatePlannedSession } from '@sharpit/server/lib/queries';
import { recalibratedStructure } from '@sharpit/server/lib/morning-recalibration/recalibrated-structure';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { nightEvidenceReady } from '@sharpit/app/lib/today/rich/morning-orientation';

export type MorningRecalibrationPresentation = {
  decisionId: string;
  sessionId: string;
  sessionType: string;
  direction: 'DOWN' | 'UP';
  changeSummary: string;
  why: string;
  status: 'PRESENTED' | 'ACCEPTED' | 'REJECTED' | 'MODIFIED' | 'EXPIRED';
  fromIntensity: string | null;
  toIntensity: string | null;
  fromDurationMin: number | null;
  toDurationMin: number | null;
  fromLoad: number | null;
  toLoad: number | null;
  fromDescription: string | null;
  toDescription: string | null;
};

export type EnsureMorningRecalibrationResult = {
  presentation: MorningRecalibrationPresentation | null;
  /** True when a new PRESENTED decision was written on this call. */
  created: boolean;
};

function toGateProposal(
  proposal: MorningRecalibrationProposal,
  session: {
    type: GateProposal['type'];
    title: string | null;
    date: Date;
    goalId?: string | null;
  },
): GateProposal {
  return {
    sessionId: proposal.sessionId,
    action: 'MODIFY',
    date: dayKeyFromDate(session.date),
    startTime: null,
    type: session.type,
    intensity: proposal.toIntensity,
    durationMin: proposal.toDurationMin,
    load: proposal.toLoad,
    title: session.title,
    rationale: proposal.why,
    goalId: session.goalId ?? null,
  };
}

function toGateResult(proposal: GateProposal, direction: 'DOWN' | 'UP'): GateSessionResult {
  return {
    proposal,
    status: 'REQUIRES_CONFIRMATION',
    findings: [
      {
        ruleCode: direction === 'DOWN' ? 'MORNING_RECALIBRATION_DOWN' : 'MORNING_RECALIBRATION_UP',
        severity: 'REQUIRES_CONFIRMATION',
        rationale: proposal.rationale ?? 'Ajustement matin proposé',
        evidenceRefs: ['decision.overallVerdict', 'wellness.checkin'],
      },
    ],
    requiredAssumptions: [],
    saferAlternative: null,
  };
}

type ToPresentationInput = {
  decisionId: string;
  sessionId: string;
  sessionType: string;
  mr: NonNullable<DecisionSnapshotContext['morningRecalibration']>;
  status: MorningRecalibrationPresentation['status'];
};

function toPresentation(input: ToPresentationInput): MorningRecalibrationPresentation {
  const { decisionId, sessionId, sessionType, mr, status } = input;
  return {
    decisionId,
    sessionId,
    sessionType,
    direction: mr.direction,
    changeSummary: mr.changeSummary,
    why: mr.why,
    status,
    fromIntensity: mr.fromIntensity,
    toIntensity: mr.toIntensity,
    fromDurationMin: mr.fromDurationMin,
    toDurationMin: mr.toDurationMin,
    fromLoad: mr.fromLoad,
    toLoad: mr.toLoad,
    fromDescription: mr.fromDescription ?? null,
    toDescription: mr.toDescription ?? null,
  };
}

/** Old STRENGTH proposals used endurance copy (“tempo”) and had no structure rewrite. */
function isStaleSportProposal(
  mr: NonNullable<DecisionSnapshotContext['morningRecalibration']>,
  sessionType: string | undefined,
): boolean {
  if (!sessionType || !isStrengthLikeMorningSport(sessionType)) {
    return false;
  }
  if (mr.fromDescription === undefined && mr.toDescription === undefined) {
    return true;
  }
  if (/tempo/i.test(mr.why) || /tempo/i.test(mr.changeSummary)) {
    return true;
  }
  return false;
}

async function loadPrimaryPlannedSession(athleteId: string, trainingDayId: string) {
  const [y, m, d] = trainingDayId.split('-').map(Number);
  const day = startOfDay(new Date(y, m - 1, d, 12, 0, 0));
  const sessions = await prisma.plannedSession.findMany({
    where: {
      athleteId,
      date: { gte: day, lte: endOfDay(day) },
      completed: false,
      activityId: null,
    },
    orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
  });
  return sessions[0] ?? null;
}

async function loadExistingSessionType(
  athleteId: string,
  sessionId: string,
): Promise<string | undefined> {
  const existingSession = await prisma.plannedSession.findFirst({
    where: { id: sessionId, athleteId },
    select: { type: true },
  });
  return existingSession?.type;
}

function isSettledMorningRecalibrationStatus(
  status: string,
): status is 'PRESENTED' | 'ACCEPTED' | 'REJECTED' {
  return status === 'PRESENTED' || status === 'ACCEPTED' || status === 'REJECTED';
}

async function resolveExistingPresentation(
  athleteId: string,
  existing: NonNullable<Awaited<ReturnType<typeof findMorningRecalibrationDecision>>>,
): Promise<EnsureMorningRecalibrationResult | null> {
  const mr = existing.snapshotContext.morningRecalibration;
  const { sessionId } = existing.proposal;
  if (!mr || !sessionId) {
    return { presentation: null, created: false };
  }

  // An expired proposal — replaced after the check-in, or stale — leaves room for a new one.
  if (existing.status === 'EXPIRED') {
    return null;
  }

  const sessionType = await loadExistingSessionType(athleteId, sessionId);
  if (existing.status === 'PRESENTED' && isStaleSportProposal(mr, sessionType)) {
    await expireDecision(existing.id);
    return null;
  }

  if (!isSettledMorningRecalibrationStatus(existing.status)) {
    return { presentation: null, created: false };
  }

  return {
    presentation: toPresentation({
      decisionId: existing.id,
      sessionId,
      sessionType: sessionType ?? existing.proposal.type,
      mr,
      status: existing.status,
    }),
    created: false,
  };
}

/**
 * Read-only projection of today's morning recalibration proposal.
 * Never creates or expires decisions — safe for GET presentation routes.
 * Creation stays on ensureMorningRecalibration (refresh, wellness, POST).
 */
export async function getMorningRecalibrationPresentation(
  athleteId: string,
  trainingDayId: string,
): Promise<MorningRecalibrationPresentation | null> {
  const existing = await findMorningRecalibrationDecision(athleteId, trainingDayId);
  if (!existing) {
    return null;
  }

  const mr = existing.snapshotContext.morningRecalibration;
  const { sessionId } = existing.proposal;
  if (!mr || !sessionId) {
    return null;
  }

  const sessionType = await loadExistingSessionType(athleteId, sessionId);
  if (existing.status === 'PRESENTED' && isStaleSportProposal(mr, sessionType)) {
    return null;
  }

  if (!isSettledMorningRecalibrationStatus(existing.status)) {
    return null;
  }

  return toPresentation({
    decisionId: existing.id,
    sessionId,
    sessionType: sessionType ?? existing.proposal.type,
    mr,
    status: existing.status,
  });
}

function buildMorningRecalibrationSnapshotContext(
  snapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
  proposal: MorningRecalibrationProposal,
  sessionType: string,
): DecisionSnapshotContext {
  const baseCtx = buildDecisionSnapshotContext(snapshot);
  return {
    ...baseCtx,
    morningRecalibration: {
      direction: proposal.direction,
      changeSummary: proposal.changeSummary,
      why: proposal.why,
      fromIntensity: proposal.fromIntensity,
      toIntensity: proposal.toIntensity,
      fromDurationMin: proposal.fromDurationMin,
      toDurationMin: proposal.toDurationMin,
      fromLoad: proposal.fromLoad,
      toLoad: proposal.toLoad,
      fromDescription: proposal.fromDescription,
      toDescription: proposal.toDescription,
      sessionType,
    },
  };
}

async function createMorningRecalibrationDecision(
  athleteId: string,
  trainingDayId: string,
  session: NonNullable<Awaited<ReturnType<typeof loadPrimaryPlannedSession>>>,
  snapshot: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>>,
): Promise<EnsureMorningRecalibrationResult | null> {
  const proposal = evaluateMorningSessionRecalibration({
    session: {
      id: session.id,
      type: session.type,
      intensity: session.intensity,
      durationMin: session.durationMin,
      load: session.load,
      title: session.title,
      description: session.description,
      completed: session.completed,
      activityId: session.activityId,
    },
    decision: {
      overallVerdict: snapshot.decision?.overallVerdict ?? null,
      confidenceTier: snapshot.decision?.confidenceTier ?? null,
      fatigueTrainingCapacity: snapshot.fatigue?.trainingCapacity ?? null,
    },
  });

  if (!proposal) {
    return null;
  }

  const gateProposal = toGateProposal(proposal, session);
  const gateResult = toGateResult(gateProposal, proposal.direction);
  const snapshotContext = buildMorningRecalibrationSnapshotContext(
    snapshot,
    proposal,
    session.type,
  );

  const decision = await createCoachingDecision(athleteId, {
    trainingDayId,
    source: 'PLAN_ADAPTER',
    proposal: gateProposal,
    gateResult,
    snapshotContext,
    snapshotIdAtRecommendation: null,
  });

  return {
    presentation: toPresentation({
      decisionId: decision.id,
      sessionId: proposal.sessionId,
      sessionType: session.type,
      mr: snapshotContext.morningRecalibration!,
      status: 'PRESENTED',
    }),
    created: true,
  };
}

/**
 * Idempotent: evaluate today's primary planned session and create a PRESENTED
 * decision when a meaningful adjustment exists and none is open/settled yet.
 * The night is enough: once sleep and recovery are read, a verdict that says « ease » comes
 * with its proposal; the check-in, when it arrives, refines it (refreshMorningRecalibrationAfterCheckIn).
 */
export async function ensureMorningRecalibration(
  athleteId: string,
  trainingDayId: string,
  options?: { athleteSnapshot?: Awaited<ReturnType<typeof getOrBuildAthleteSnapshot>> },
): Promise<EnsureMorningRecalibrationResult> {
  const existing = await findMorningRecalibrationDecision(athleteId, trainingDayId);
  if (existing) {
    const resolved = await resolveExistingPresentation(athleteId, existing);
    if (resolved) {
      return resolved;
    }
  }

  const session = await loadPrimaryPlannedSession(athleteId, trainingDayId);
  if (!session) {
    return { presentation: null, created: false };
  }

  const snapshot =
    options?.athleteSnapshot ?? (await getOrBuildAthleteSnapshot(athleteId, trainingDayId));
  if (!nightEvidenceReady(snapshot)) {
    return { presentation: null, created: false };
  }
  const created = await createMorningRecalibrationDecision(
    athleteId,
    trainingDayId,
    session,
    snapshot,
  );
  return created ?? { presentation: null, created: false };
}

/**
 * The check-in changes what the morning knows: a proposal still waiting for an answer is
 * replaced by one read with it. An answered one stays — the athlete already decided.
 */
export async function refreshMorningRecalibrationAfterCheckIn(
  athleteId: string,
  trainingDayId: string,
): Promise<EnsureMorningRecalibrationResult> {
  const existing = await findMorningRecalibrationDecision(athleteId, trainingDayId);
  if (existing?.status === 'PRESENTED') {
    await expireDecision(existing.id);
  }
  return ensureMorningRecalibration(athleteId, trainingDayId);
}

/** Whether the morning check-in is done — the proposal card invites to it until then. */
export function isMorningCheckInDone(athleteId: string, trainingDayId: string): Promise<boolean> {
  return hasMorningWellnessCheckin(athleteId, trainingDayId);
}

function validateAcceptableDecision(
  decision: Awaited<ReturnType<typeof findCoachingDecisionById>>,
): { ok: false; error: string } | { ok: true; decision: NonNullable<typeof decision> } {
  if (!decision?.snapshotContext.morningRecalibration) {
    return { ok: false, error: 'Proposition introuvable' };
  }
  if (decision.status !== 'PRESENTED') {
    return { ok: false, error: 'Cette proposition n’est plus en attente' };
  }
  if (!decision.proposal.sessionId) {
    return { ok: false, error: 'Proposition invalide' };
  }
  return { ok: true, decision };
}

export async function acceptMorningRecalibration(
  athleteId: string,
  decisionId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const decision = await findCoachingDecisionById(athleteId, decisionId);
  const validated = validateAcceptableDecision(decision);
  if (!validated.ok) {
    return validated;
  }

  const { sessionId, intensity, durationMin, load } = validated.decision.proposal;
  const mr = validated.decision.snapshotContext.morningRecalibration!;
  const session = await prisma.plannedSession.findFirst({
    where: { id: sessionId!, athleteId },
    select: { type: true, endurancePrescription: true, durationMin: true, intensity: true },
  });
  const structure = recalibratedStructure({
    type: session?.type ?? '',
    endurancePrescription: session?.endurancePrescription ?? null,
    durationMin: durationMin ?? session?.durationMin ?? null,
    intensity: intensity ?? session?.intensity ?? null,
    toDescription: mr.toDescription,
  });

  await updatePlannedSession(athleteId, sessionId!, {
    intensity: intensity ?? undefined,
    durationMin: durationMin ?? undefined,
    load: load ?? undefined,
    description: structure.description,
    ...(structure.endurancePrescription === undefined
      ? {}
      : {
          endurancePrescription:
            structure.endurancePrescription === null
              ? Prisma.DbNull
              : (structure.endurancePrescription as Prisma.InputJsonValue),
        }),
  });

  await recordDecisionAction(athleteId, {
    decisionId,
    actionType: 'ACCEPTED',
    source: 'PLAN_REVIEW_UI',
    resultingPlannedSessionId: sessionId!,
    rationale: mr.why,
  });

  return { ok: true, sessionId: sessionId! };
}

export async function rejectMorningRecalibration(
  athleteId: string,
  decisionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const decision = await findCoachingDecisionById(athleteId, decisionId);
  if (!decision?.snapshotContext.morningRecalibration) {
    return { ok: false, error: 'Proposition introuvable' };
  }
  if (decision.status !== 'PRESENTED') {
    return { ok: false, error: 'Cette proposition n’est plus en attente' };
  }

  await recordDecisionAction(athleteId, {
    decisionId,
    actionType: 'REJECTED',
    source: 'PLAN_REVIEW_UI',
    rationale: 'Athlete declined morning recalibration',
  });

  return { ok: true };
}
