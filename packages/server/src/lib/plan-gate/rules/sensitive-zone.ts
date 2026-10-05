import { exerciseLoadProfile } from '@sharpit/app/lib/physical-health/exercise-load-profile';
import {
  bySeverityDesc,
  describeZone,
  exerciseZoneConflict,
  sensitiveZonesFrom,
  sportZoneConflicts,
  type SensitiveZone,
} from '@sharpit/app/lib/physical-health/sensitive-zones';
import type {
  GateContext,
  GateProposal,
  PlanGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';

/** `exercise: null` means the sport itself loads the zone, not one movement in it. */
type FlaggedExercise = { exercise: string | null; zone: SensitiveZone };

function flaggedExercises(
  proposal: GateProposal,
  zones: readonly SensitiveZone[],
): FlaggedExercise[] {
  const sets = proposal.strengthPrescription?.sets ?? [];
  return sets.flatMap((set) => {
    // A freshly generated prescription carries the coach's declaration; a
    // persisted one may also carry a catalog id and watch refs.
    const zone = exerciseZoneConflict(exerciseLoadProfile(set), zones);
    return zone ? [{ exercise: set.exercise, zone }] : [];
  });
}

function flaggedSport(proposal: GateProposal, zones: readonly SensitiveZone[]): FlaggedExercise[] {
  return sportZoneConflicts(proposal.type, zones).map((zone) => ({ exercise: null, zone }));
}

function sortedZones(flagged: readonly FlaggedExercise[]): SensitiveZone[] {
  const byLabel = new Map(flagged.map((item) => [item.zone.label, item.zone]));
  return [...byLabel.values()].sort(bySeverityDesc);
}

function describe(flagged: readonly FlaggedExercise[]): string {
  const zoneText = sortedZones(flagged).map(describeZone).join(', ');
  const exercises = [...new Set(flagged.map((item) => item.exercise).filter(Boolean))];
  if (exercises.length === 0) {
    return `Ce sport sollicite une zone que l'athlète protège (${zoneText}). Adapte le volume et l'intensité, ou change de sport ce jour-là.`;
  }
  return `Cette séance charge une zone que l'athlète protège (${zoneText}) : ${exercises.join(', ')}. Renforce autour de la zone plutôt que dessus, ou remplace ces exercices.`;
}

/**
 * A strength session must not load a zone the athlete is protecting.
 *
 * The prompt says never to aggravate a sensitive zone and the context names the
 * zones, but nothing checked the exercises that came back. The catalog knows
 * which body group each exercise loads, so the mismatch is verifiable rather
 * than a matter of the model's attention (volet C).
 *
 * A warning, never a rejection: the mapping from a French body region to the
 * catalog's coarse groups is deliberately broad, and prehab work around an
 * injury legitimately targets the same group.
 */
export const sensitiveZoneRule: PlanGateRule = (
  context: GateContext,
  proposal: GateProposal,
): RuleFinding[] => {
  const zones = sensitiveZonesFrom(context.trainingZones ?? context.physicalHealth?.conditions);
  if (zones.length === 0) {
    return [];
  }

  const flagged =
    proposal.type === 'STRENGTH'
      ? flaggedExercises(proposal, zones)
      : flaggedSport(proposal, zones);
  if (flagged.length === 0) {
    return [];
  }

  return [
    {
      ruleCode: 'SENSITIVE_ZONE_LOADED',
      severity: 'WARNING',
      rationale: describe(flagged),
      evidenceRefs: ['physicalHealth.conditions', 'proposal.strengthPrescription'],
    },
  ];
};
