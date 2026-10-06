import type {
  GateContext,
  GateProposal,
  PlanGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';
import { isSet } from '@sharpit/shared/value';
import { PLAN_GATE_HIGH_INTENSITY } from '@sharpit/server/lib/plan-gate/high-intensity';

const HIGH_INTENSITY = PLAN_GATE_HIGH_INTENSITY;

function insufficientDecisionFinding(): RuleFinding {
  return {
    ruleCode: 'DECISION_INSUFFICIENT_DATA',
    severity: 'REJECTED',
    rationale:
      "L'état physiologique du jour n'est pas assez fiable pour prescrire cette séance. Synchronise tes données ou attends que le Twin soit calibré avant de planifier.",
    evidenceRefs: ['decision.confidenceTier'],
  };
}

function lowConfidenceDecisionFinding(): RuleFinding {
  return {
    ruleCode: 'DECISION_LOW_CONFIDENCE',
    severity: 'REJECTED',
    rationale:
      "La confiance dans la décision du jour est trop faible pour prescrire cette séance. Privilegie le repos ou une séance déjà validée jusqu'à ce que les signaux soient plus stables.",
    evidenceRefs: ['decision.confidenceTier', 'decision.confidence'],
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
    return [insufficientDecisionFinding()];
  }

  if (decision.confidenceTier === 'LOW') {
    return [lowConfidenceDecisionFinding()];
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
