import { decisionCompatibilityRule } from './rules/decision-compatibility';
import { isSet } from '@sharpit/shared/value';
import { physicalHealthRule } from './rules/physical-health';
import { malformedAndDuplicateRule } from './rules/malformed-and-duplicate';
import { completedConflictRule } from './rules/completed-conflict';
import { recoverySpacingRule } from './rules/recovery-spacing';
import { goalPhaseCoherenceRule } from './rules/goal-phase-coherence';
import { dataSufficiencyRule } from './rules/data-sufficiency';
import { calendarConflictRule } from './rules/calendar-conflict';
import { sensitiveZoneRule } from './rules/sensitive-zone';
import { strengthCompletenessRule } from './rules/strength-completeness';
import { practicedSportsRule } from './rules/practiced-sports';
import { weeklyLoadRule } from './rules/weekly-load';
import { intensityDistributionRule } from './rules/intensity-distribution';
import { zoneRampRule, zoneReturnIntensityRule } from './rules/zone-progression';
import type {
  GateContext,
  GateProposal,
  GateResult,
  GateSessionResult,
  GateStatus,
  PlanGateRule,
  PlanLevelGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';
import { GATE_STATUS_SEVERITY_ORDER } from '@sharpit/app/lib/plan-gate/types';

/** Fixed, declared order — deterministic for a given GateContext + proposal set. */
const RULES: readonly PlanGateRule[] = [
  malformedAndDuplicateRule,
  completedConflictRule,
  practicedSportsRule,
  decisionCompatibilityRule,
  physicalHealthRule,
  recoverySpacingRule,
  goalPhaseCoherenceRule,
  dataSufficiencyRule,
  calendarConflictRule,
  strengthCompletenessRule,
  sensitiveZoneRule,
  zoneReturnIntensityRule,
];

const PLAN_LEVEL_RULES: readonly PlanLevelGateRule[] = [
  weeklyLoadRule,
  intensityDistributionRule,
  zoneRampRule,
];

function worstStatus(findings: readonly RuleFinding[]): GateStatus {
  if (findings.length === 0) {
    return 'ACCEPTED';
  }
  let worst: GateStatus = 'ACCEPTED';
  for (const finding of findings) {
    if (
      GATE_STATUS_SEVERITY_ORDER.indexOf(finding.severity) <
      GATE_STATUS_SEVERITY_ORDER.indexOf(worst)
    ) {
      worst = finding.severity;
    }
  }
  return worst;
}

function evaluateProposal(context: GateContext, proposal: GateProposal): GateSessionResult {
  const findings: RuleFinding[] = [];
  for (const rule of RULES) {
    findings.push(...rule(context, proposal));
  }

  const status = worstStatus(findings);
  const requiredAssumptions = findings
    .map((f) => f.requiredAssumption)
    .filter((a): a is string => isSet(a));
  const saferAlternative =
    status === 'REJECTED'
      ? (findings.find((f) => f.saferAlternative)?.saferAlternative ?? null)
      : null;

  return {
    proposal,
    status,
    findings,
    requiredAssumptions,
    saferAlternative,
  };
}

/**
 * Pure orchestrator — no I/O. GateContext must already be fully built (see build-context.ts).
 * Runs deterministically: identical context + proposals always produce identical results.
 */
export function evaluatePlan(context: GateContext, proposals: readonly GateProposal[]): GateResult {
  const sessions = proposals.map((proposal) => evaluateProposal(context, proposal));

  const planLevelFindings: RuleFinding[] = [];
  for (const rule of PLAN_LEVEL_RULES) {
    planLevelFindings.push(...rule(context, proposals));
  }

  return { sessions, planLevelFindings };
}
