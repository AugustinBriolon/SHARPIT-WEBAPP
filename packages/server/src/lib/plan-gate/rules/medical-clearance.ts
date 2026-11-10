import type {
  GateContext,
  GateProposal,
  PlanGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';
import { isSet } from '@sharpit/shared/value';
import { PLAN_GATE_HIGH_INTENSITY } from '@sharpit/server/lib/plan-gate/high-intensity';

/**
 * ADR-124: while a declared health ground owes a medical go-ahead, nothing above easy endurance
 * is planned. The coach is told so in its prompt; this is what holds when it does not listen.
 */
export const medicalClearanceRule: PlanGateRule = (
  context: GateContext,
  proposal: GateProposal,
): RuleFinding[] => {
  if (!context.medicalClearanceOwed) {
    return [];
  }
  if (!isSet(proposal.intensity) || !PLAN_GATE_HIGH_INTENSITY.has(proposal.intensity)) {
    return [];
  }
  return [
    {
      ruleCode: 'MEDICAL_CLEARANCE_OWED',
      severity: 'REJECTED',
      rationale:
        'Un terrain de santé déclaré demande un avis médical : pas de séance au-delà de l’endurance tant que ce stade est déclaré.',
      evidenceRefs: ['healthGrounds[*].stage.needsClearance'],
      saferAlternative: {
        ...proposal,
        intensity: 'ENDURANCE',
        load: isSet(proposal.load) ? Math.round(proposal.load * 0.6) : null,
      },
    },
  ];
};
