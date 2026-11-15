import { activityTypeLabels } from '@sharpit/app/lib/format';
import type {
  GateContext,
  GateProposal,
  GateResult,
  GateSessionResult,
} from '@sharpit/app/lib/plan-gate/types';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import { evaluatePlan } from '@sharpit/server/lib/plan-gate/evaluate-plan';

/**
 * The lighter session a rejected one becomes, or null when the Gate has none to offer. Only the
 * same sport at another intensity counts: an alternative that turns the session into rest or
 * mobility is not a version of it. Its reason is the rejecting rule's own words, so the athlete
 * reads why the session changed instead of finding it gone.
 */
export function lighterProposal(result: GateSessionResult): GateProposal | null {
  const { proposal, saferAlternative: lighter } = result;
  if (
    result.status !== 'REJECTED' ||
    !lighter?.intensity ||
    lighter.type !== proposal.type ||
    lighter.intensity === proposal.intensity
  ) {
    return null;
  }
  const reason = result.findings.find((finding) => finding.saferAlternative)?.rationale;
  return {
    ...proposal,
    intensity: lighter.intensity,
    load: lighter.load ?? proposal.load,
    title: `${activityTypeLabels[proposal.type]} · ${intensityLabels[lighter.intensity]}`,
    // The written steps belonged to the session as it was asked.
    endurancePrescription: null,
    rationale: reason ?? proposal.rationale,
  };
}

export type OfferedSession = {
  /** Position of the session in the generated plan. */
  index: number;
  proposal: GateProposal;
  /** True when the proposal stands in for a rejected session. */
  lightened: boolean;
};

/**
 * What the athlete is offered from a gated plan: sessions that passed as they are, rejected ones
 * as their lighter version, and nothing for a rejection with no lighter version. The lighter
 * sessions go through the Gate again; `gate` matches `offered` one to one.
 */
export function offerSessions(
  context: GateContext,
  gate: GateResult,
): { offered: OfferedSession[]; gate: GateResult } {
  const candidates = gate.sessions.flatMap((result, index): OfferedSession[] => {
    if (result.status !== 'REJECTED') {
      return [{ index, proposal: result.proposal, lightened: false }];
    }
    const lighter = lighterProposal(result);
    return lighter ? [{ index, proposal: lighter, lightened: true }] : [];
  });
  if (candidates.length === gate.sessions.length && candidates.every((c) => !c.lightened)) {
    return { offered: candidates, gate };
  }

  const regated = evaluatePlan(
    context,
    candidates.map((candidate) => candidate.proposal),
  );
  const offered = candidates.filter(
    (_, position) => regated.sessions[position]?.status !== 'REJECTED',
  );
  return {
    offered,
    gate:
      offered.length === candidates.length
        ? regated
        : evaluatePlan(
            context,
            offered.map((session) => session.proposal),
          ),
  };
}
