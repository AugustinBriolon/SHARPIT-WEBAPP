import type {
  GateContext,
  GateProposal,
  PlanGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';
import { isSet } from '@sharpit/shared/value';
import { PLAN_GATE_HIGH_INTENSITY } from '@sharpit/server/lib/plan-gate/high-intensity';

const HIGH_INTENSITY = PLAN_GATE_HIGH_INTENSITY;

/**
 * Without a reliable reading of the body (a new account, no synced nights yet) the Gate only
 * withholds the hard sessions, offering an endurance version, and lets the rest through with a
 * warning: rejecting everything left a new athlete with no first week at all (ADR-091).
 */
function unreliableDecisionFinding(
  proposal: GateProposal,
  isHighIntensity: boolean,
  ruleCode: 'DECISION_INSUFFICIENT_DATA' | 'DECISION_LOW_CONFIDENCE',
): RuleFinding {
  const evidenceRefs =
    ruleCode === 'DECISION_LOW_CONFIDENCE'
      ? ['decision.confidenceTier', 'decision.confidence']
      : ['decision.confidenceTier'];
  if (!isHighIntensity) {
    return {
      ruleCode,
      severity: 'WARNING',
      rationale:
        "Peu de données sur ta forme pour l'instant : la séance reste modérée. Synchronise tes nuits pour que le coach ajuste mieux.",
      evidenceRefs,
    };
  }
  return {
    ruleCode,
    severity: 'REJECTED',
    rationale:
      'Pas assez de données sur ta forme pour prescrire une séance intense. Une version en endurance est proposée en attendant que tes signaux soient fiables.',
    evidenceRefs,
    saferAlternative: {
      ...proposal,
      intensity: 'ENDURANCE',
      load: isSet(proposal.load) ? Math.round(proposal.load * 0.6) : null,
    },
  };
}

function intensityConflictFinding(proposal: GateProposal, overallVerdict: string): RuleFinding {
  return {
    ruleCode: 'DECISION_INTENSITY_CONFLICT',
    severity: 'REJECTED',
    rationale: `Le verdict du jour est "${overallVerdict}" — une séance ${proposal.intensity} n'est pas cohérente avec l'état de récupération actuel.`,
    evidenceRefs: ['decision.overallVerdict', 'decision.limitingFactor'],
    saferAlternative: {
      ...proposal,
      intensity: 'ENDURANCE',
      load: isSet(proposal.load) ? Math.round(proposal.load * 0.6) : null,
    },
  };
}

function fatigueCapacityFindings(
  proposal: GateProposal,
  fatigueTrainingCapacity: GateContext['fatigueTrainingCapacity'],
  isHighIntensity: boolean,
): RuleFinding[] {
  if (
    fatigueTrainingCapacity === 'REST_ONLY' &&
    isSet(proposal.intensity) &&
    proposal.intensity !== 'RECOVERY'
  ) {
    return [
      {
        ruleCode: 'FATIGUE_REST_ONLY',
        severity: 'REJECTED',
        rationale:
          'Le modèle de fatigue indique une capacité "repos uniquement" ce jour — toute séance autre que récupération est incompatible.',
        evidenceRefs: ['fatigueTrainingCapacity'],
        saferAlternative: {
          ...proposal,
          intensity: 'RECOVERY',
          durationMin: isSet(proposal.durationMin) ? Math.min(proposal.durationMin, 30) : null,
          load: null,
        },
      },
    ];
  }

  if (fatigueTrainingCapacity === 'LIGHT_ONLY' && isHighIntensity) {
    return [
      {
        ruleCode: 'FATIGUE_LIGHT_ONLY',
        severity: 'REJECTED',
        rationale:
          'Le modèle de fatigue limite la capacité à "léger uniquement" — une séance haute intensité n\'est pas sûre aujourd\'hui.',
        evidenceRefs: ['fatigueTrainingCapacity'],
        saferAlternative: {
          ...proposal,
          intensity: 'ENDURANCE',
          load: isSet(proposal.load) ? Math.round(proposal.load * 0.6) : null,
        },
      },
    ];
  }

  return [];
}

export const decisionCompatibilityRule: PlanGateRule = (
  context: GateContext,
  proposal: GateProposal,
): RuleFinding[] => {
  const { decision, fatigueTrainingCapacity } = context;
  const isHighIntensity = isSet(proposal.intensity) && HIGH_INTENSITY.has(proposal.intensity);

  if (!decision || decision.confidenceTier === 'INSUFFICIENT') {
    return [unreliableDecisionFinding(proposal, isHighIntensity, 'DECISION_INSUFFICIENT_DATA')];
  }

  if (decision.confidenceTier === 'LOW') {
    return [unreliableDecisionFinding(proposal, isHighIntensity, 'DECISION_LOW_CONFIDENCE')];
  }

  const findings: RuleFinding[] = [];
  if (
    isHighIntensity &&
    (decision.overallVerdict === 'RECOVER' || decision.overallVerdict === 'CAUTION')
  ) {
    findings.push(intensityConflictFinding(proposal, decision.overallVerdict));
  }

  findings.push(...fatigueCapacityFindings(proposal, fatigueTrainingCapacity, isHighIntensity));
  return findings;
};
