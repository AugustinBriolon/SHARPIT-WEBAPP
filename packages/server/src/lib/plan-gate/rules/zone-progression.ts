import { format, startOfWeek, subDays } from 'date-fns';
import { exerciseLoadProfile } from '@sharpit/app/lib/physical-health/exercise-load-profile';
import {
  bySeverityDesc,
  describeZone,
  exerciseZoneConflict,
  sportZoneConflicts,
  zonesWithStrategy,
  type SensitiveZone,
} from '@sharpit/app/lib/physical-health/sensitive-zones';
import type {
  GateContext,
  GateProposal,
  PlanGateRule,
  PlanLevelGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';
import { computeTrainingLoad } from '@sharpit/server/lib/training/load/training-load';

/**
 * Zones coming back (ADR-100): a pain or injury under watch, silent, or closed less than six
 * weeks ago. The prompt already told the plan to load them gradually, with no plyometrics and a
 * week-over-week climb in steps; these rules check what came back. Warnings only, like every
 * zone rule (ADR-037): the region-to-group mapping is coarse.
 */
const RETURNING = ['progressive', 'relapse_watch'] as const;

/** Intensities that load a returning tendon or muscle in one go: the classic relapse session. */
const PEAK_INTENSITIES = new Set(['VO2MAX', 'RACE']);

/** A returning zone's week may climb this much over the week before it, no more. */
export const ZONE_RAMP_CAP = 1.1;

const WEEK_OPTS = { weekStartsOn: 1 as const };

function returningZones(context: GateContext): SensitiveZone[] {
  return zonesWithStrategy(
    context.trainingZones ?? context.physicalHealth?.conditions,
    RETURNING,
    context.now,
  );
}

function zoneText(zones: readonly SensitiveZone[]): string {
  return [...new Map(zones.map((zone) => [zone.label, zone])).values()]
    .sort(bySeverityDesc)
    .map(describeZone)
    .join(', ');
}

/** Jumps on a returning zone: the impact it has not been tested against yet. */
function plyometricLoads(proposal: GateProposal, zones: readonly SensitiveZone[]) {
  return (proposal.strengthPrescription?.sets ?? []).flatMap((set) => {
    const profile = exerciseLoadProfile(set);
    const zone = set.intent === 'PLYOMETRIC' ? exerciseZoneConflict(profile, zones) : null;
    return zone ? [{ exercise: set.exercise, zone }] : [];
  });
}

/** Loads the zone through the sport, at an intensity it is not back to. */
function peakSportLoads(proposal: GateProposal, zones: readonly SensitiveZone[]) {
  return proposal.intensity && PEAK_INTENSITIES.has(proposal.intensity)
    ? sportZoneConflicts(proposal.type, zones)
    : [];
}

export const zoneReturnIntensityRule: PlanGateRule = (context, proposal): RuleFinding[] => {
  const zones = returningZones(context);
  if (zones.length === 0) {
    return [];
  }
  const jumps = plyometricLoads(proposal, zones);
  if (jumps.length > 0) {
    return [
      {
        ruleCode: 'RETURNING_ZONE_PLYOMETRICS',
        severity: 'WARNING',
        rationale: `Zone en reprise (${zoneText(jumps.map((item) => item.zone))}) : pas de pliométrie dessus pour l'instant (${[...new Set(jumps.map((item) => item.exercise))].join(', ')}). Remplace par un travail lent et contrôlé.`,
        evidenceRefs: ['trainingZones.strategy', 'proposal.strengthPrescription'],
      },
    ];
  }
  const peaked = peakSportLoads(proposal, zones);
  if (peaked.length > 0) {
    return [
      {
        ruleCode: 'RETURNING_ZONE_PEAK_INTENSITY',
        severity: 'WARNING',
        rationale: `Zone en reprise (${zoneText(peaked)}) : une séance ${proposal.intensity} la sollicite d'un coup. Garde le seuil ou en dessous tant que la zone n'a pas tenu plusieurs semaines.`,
        evidenceRefs: ['trainingZones.strategy', 'proposal.intensity'],
      },
    ];
  }
  return [];
};

/** Local calendar key: `toISOString` shifts a local Monday midnight to Sunday east of UTC. */
function weekKey(date: Date): string {
  return format(startOfWeek(date, WEEK_OPTS), 'yyyy-MM-dd');
}

/** Proposed load per week, counting only the weeks that load a returning zone. */
function zoneWeekLoads(
  proposals: readonly GateProposal[],
  zones: readonly SensitiveZone[],
): Map<string, number> {
  const loads = new Map<string, number>();
  for (const proposal of proposals) {
    const key = weekKey(new Date(`${proposal.date}T00:00:00`));
    const touchesZone =
      sportZoneConflicts(proposal.type, zones).length > 0 ||
      (proposal.strengthPrescription?.sets ?? []).some((set) =>
        exerciseZoneConflict(exerciseLoadProfile(set), zones),
      );
    if (touchesZone || loads.has(key)) {
      loads.set(key, (loads.get(key) ?? 0) + (proposal.load ?? 0));
    }
  }
  return loads;
}

/**
 * shortcut: compares the whole proposed week with the whole week before, not the load of the
 * zone's sports alone — daily training stress carries no sport. Upgrade when it does.
 */
export const zoneRampRule: PlanLevelGateRule = (context, proposals): RuleFinding[] => {
  const zones = returningZones(context);
  if (zones.length === 0) {
    return [];
  }
  const findings: RuleFinding[] = [];
  for (const [key, projected] of zoneWeekLoads(proposals, zones)) {
    // The seven days ending the Sunday before: what the zone actually went through.
    const previous = computeTrainingLoad(
      [...context.dailyTrainingStress],
      subDays(new Date(`${key}T12:00:00`), 1),
    ).weeklyLoad;
    if (previous > 0 && projected > previous * ZONE_RAMP_CAP) {
      findings.push({
        ruleCode: 'RETURNING_ZONE_RAMP',
        severity: 'WARNING',
        rationale: `Semaine du ${key} : ~${Math.round(projected)} TSS prévus contre ${previous} la semaine d'avant (+${Math.round((projected / previous - 1) * 100)} %). Avec une zone en reprise (${zoneText(zones)}), monte de 10 % au plus d'une semaine à l'autre.`,
        evidenceRefs: ['trainingZones.strategy', 'dailyTrainingStress', 'ZONE_RAMP_CAP'],
      });
    }
  }
  return findings;
};
