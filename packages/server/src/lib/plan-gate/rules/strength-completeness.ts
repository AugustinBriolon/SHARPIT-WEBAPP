import { exerciseKey } from '@sharpit/server/lib/strength/exercise-history';
import { auditStrengthPrescription } from '@sharpit/server/lib/planned-session/strength/strength-session-template';
import type {
  GateContext,
  GateProposal,
  PlanGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';

/**
 * A strength session must carry a prescription that fills its slot.
 *
 * Generated weeks used to propose 45-minute prehab sessions holding three to
 * five exercises — about twenty minutes of work — because nothing checked the
 * prescription against the duration it was meant to cover.
 */
export const strengthCompletenessRule: PlanGateRule = (
  _context: GateContext,
  proposal: GateProposal,
): RuleFinding[] => {
  if (proposal.type !== 'STRENGTH') {
    return [];
  }

  if (!proposal.strengthPrescription || proposal.strengthPrescription.sets.length === 0) {
    return [
      {
        ruleCode: 'STRENGTH_PRESCRIPTION_MISSING',
        severity: 'WARNING',
        rationale:
          "Séance de renfo sans exercices prescrits — elle ne pourra pas être envoyée à la montre et n'est pas évaluable.",
        evidenceRefs: ['proposal.strengthPrescription'],
      },
    ];
  }

  const audit = auditStrengthPrescription({
    durationMin: proposal.durationMin,
    prescription: proposal.strengthPrescription,
  });
  if (!audit || audit.verdict === 'ok') {
    return [];
  }

  return [
    {
      ruleCode:
        audit.verdict === 'too_short'
          ? 'STRENGTH_SESSION_UNDERFILLED'
          : 'STRENGTH_SESSION_OVERFILLED',
      severity: 'WARNING',
      rationale: audit.message,
      evidenceRefs: ['proposal.durationMin', 'proposal.strengthPrescription'],
    },
  ];
};

// The landing counts one guardrail per file here: a load within reach is part of a
// complete strength session, so it is checked beside it.

/** How far above the athlete's best a prescribed load may go, the generator's own rule. */
export const MAX_LOAD_ABOVE_BEST = 1.05;

/**
 * A prescribed load stays within reach of what the athlete has lifted.
 *
 * The generator is told to progress from the last session and never past the best by more
 * than 5 %; nothing checked that it did, and a language model writes round numbers.
 */
export const strengthLoadRule: PlanGateRule = (
  context: GateContext,
  proposal: GateProposal,
): RuleFinding[] => {
  const bests = context.strengthBestKg;
  if (proposal.type !== 'STRENGTH' || !bests || !proposal.strengthPrescription) {
    return [];
  }

  const above = proposal.strengthPrescription.sets.flatMap((set) => {
    const best = bests[exerciseKey(set.exercise)];
    return best && set.weightKg && set.weightKg > best * MAX_LOAD_ABOVE_BEST
      ? [`${set.exercise} à ${set.weightKg} kg (meilleur ${best} kg)`]
      : [];
  });
  if (above.length === 0) {
    return [];
  }

  return [
    {
      ruleCode: 'STRENGTH_LOAD_ABOVE_BEST',
      severity: 'WARNING',
      rationale: `Charge prescrite au-delà du meilleur de l'athlète de plus de 5 % : ${above.join(', ')}.`,
      evidenceRefs: ['proposal.strengthPrescription', 'context.strengthBestKg'],
    },
  ];
};
