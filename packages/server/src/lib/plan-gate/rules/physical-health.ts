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
 * Posture and mobility are traits to work on, not injuries: the plan prompt already tells the
 * coach not to lighten intensity for them, so the Gate must not withhold it either.
 */
const NON_LIMITING_CONDITION_TYPES: ReadonlySet<string> = new Set([
  'POSTURE_ISSUE',
  'MOBILITY_LIMITATION',
]);

type PhysicalHealth = NonNullable<GateContext['physicalHealth']>;
type Capacity = PhysicalHealth['aggregateTrainingCapacity'];

const CAPACITY_ORDER: readonly Capacity[] = ['FULL', 'REDUCED', 'LIMITED', 'UNABLE'];
/** Same threshold as the snapshot's own block (core `buildPhysicalHealthSignals`). */
const BLOCKING_SEVERITY = 5;

/**
 * Capacity and block as the Gate reads them: the snapshot's aggregation (worst capacity of the
 * active conditions), run again without the non-limiting ones. The frozen Core aggregates every
 * condition alike and takes its own un-serialized type, hence the copy here. A snapshot that
 * lists no condition keeps its aggregate.
 */
function limitingSignals(
  physicalHealth: PhysicalHealth,
): Pick<PhysicalHealth, 'aggregateTrainingCapacity' | 'trainingBlockedByCondition'> {
  if (physicalHealth.conditions.length === 0) {
    return physicalHealth;
  }
  const limiting = physicalHealth.conditions.filter(
    (condition) =>
      condition.status !== 'RESOLVED' && !NON_LIMITING_CONDITION_TYPES.has(condition.type),
  );
  const capacities = limiting.map((condition) => condition.functionalCapacity ?? 'FULL');
  return {
    aggregateTrainingCapacity: capacities.reduce<Capacity>(
      (worst, capacity) =>
        CAPACITY_ORDER.indexOf(capacity) > CAPACITY_ORDER.indexOf(worst) ? capacity : worst,
      'FULL',
    ),
    trainingBlockedByCondition: limiting.some(
      (condition) =>
        condition.affectsTraining &&
        condition.severity >= BLOCKING_SEVERITY &&
        condition.functionalCapacity !== 'FULL',
    ),
  };
}

function blockedTrainingFinding(): RuleFinding {
  return {
    ruleCode: 'PHYSICAL_HEALTH_BLOCKED',
    severity: 'REJECTED',
    rationale:
      "Une condition physique active bloque actuellement l'entraînement — cette séance ne peut pas être confirmée telle quelle.",
    evidenceRefs: [
      'physicalHealth.trainingBlockedByCondition',
      'physicalHealth.primaryLimitingConditionId',
    ],
  };
}

function capacityFindings(
  proposal: GateProposal,
  capacity: NonNullable<GateContext['physicalHealth']>['aggregateTrainingCapacity'],
  isHighIntensity: boolean,
): RuleFinding[] {
  if (capacity === 'UNABLE') {
    return [
      {
        ruleCode: 'PHYSICAL_HEALTH_UNABLE',
        severity: 'REJECTED',
        rationale:
          "La capacité d'entraînement inférée est actuellement à zéro (condition physique active) — repos recommandé.",
        evidenceRefs: ['physicalHealth.aggregateTrainingCapacity'],
        saferAlternative: {
          ...proposal,
          type: 'STRENGTH',
          intensity: 'RECOVERY',
          durationMin: null,
          load: null,
          title: 'Mobilité / repos actif',
        },
      },
    ];
  }

  if (capacity === 'LIMITED' && isHighIntensity) {
    return [
      {
        ruleCode: 'PHYSICAL_HEALTH_LIMITED',
        severity: 'REJECTED',
        rationale:
          'Capacité limitée par une condition physique active — une séance haute intensité présente un risque disproportionné.',
        evidenceRefs: [
          'physicalHealth.aggregateTrainingCapacity',
          'physicalHealth.primaryLimitingConditionId',
        ],
        saferAlternative: {
          ...proposal,
          intensity: 'ENDURANCE',
          load: isSet(proposal.load) ? Math.round(proposal.load * 0.6) : null,
        },
      },
    ];
  }

  if (capacity === 'REDUCED' && isHighIntensity) {
    return [
      {
        ruleCode: 'PHYSICAL_HEALTH_REDUCED',
        severity: 'REQUIRES_CONFIRMATION',
        rationale:
          "Capacité réduite par une condition physique active — confirme que cette séance haute intensité reste raisonnable aujourd'hui.",
        evidenceRefs: ['physicalHealth.aggregateTrainingCapacity'],
      },
    ];
  }

  return [];
}

export const physicalHealthRule: PlanGateRule = (
  context: GateContext,
  proposal: GateProposal,
): RuleFinding[] => {
  const { physicalHealth } = context;
  if (!physicalHealth) {
    return [];
  }

  const signals = limitingSignals(physicalHealth);
  if (signals.trainingBlockedByCondition) {
    return [blockedTrainingFinding()];
  }

  const isHighIntensity = isSet(proposal.intensity) && HIGH_INTENSITY.has(proposal.intensity);
  return capacityFindings(proposal, signals.aggregateTrainingCapacity, isHighIntensity);
};
