import { addDays, startOfWeek } from 'date-fns';
import { enduranceActivityTypesForPracticed } from '@sharpit/app/lib/practiced-sports';
import {
  isStructuredStrengthSession,
  LIGHT_WEEK_STRENGTH_TARGET,
  WEEKLY_STRENGTH_TARGET,
} from '@sharpit/server/lib/planned-session/strength/strength-session-template';
import type {
  GateContext,
  GateProposal,
  PlanLevelGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';

const WEEK_OPTS = { weekStartsOn: 1 as const };
/** A week the window barely touches is not the generator's to fill. */
const MIN_WINDOW_DAYS_IN_WEEK = 5;
const LIGHT_PHASES = new Set(['TAPER', 'RACE']);

function weekKey(date: Date): string {
  return startOfWeek(date, WEEK_OPTS).toISOString().slice(0, 10);
}

function judgedWeeks(window: NonNullable<GateContext['planWindow']>): Set<string> {
  const daysByWeek = new Map<string, number>();
  for (let offset = 0; offset < window.days; offset++) {
    const key = weekKey(addDays(window.start, offset));
    daysByWeek.set(key, (daysByWeek.get(key) ?? 0) + 1);
  }
  return new Set(
    [...daysByWeek].filter(([, days]) => days >= MIN_WINDOW_DAYS_IN_WEEK).map(([key]) => key),
  );
}

function countStructuredStrength(
  context: GateContext,
  proposals: readonly GateProposal[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (date: Date) => counts.set(weekKey(date), (counts.get(weekKey(date)) ?? 0) + 1);
  const modifiedIds = new Set(proposals.map((p) => p.sessionId).filter(Boolean));

  for (const p of proposals) {
    if (p.type === 'STRENGTH' && isStructuredStrengthSession(p.durationMin)) {
      add(new Date(`${p.date}T00:00:00`));
    }
  }
  for (const s of context.existingSessions) {
    if (
      !modifiedIds.has(s.id) &&
      s.type === 'STRENGTH' &&
      isStructuredStrengthSession(s.durationMin)
    ) {
      add(s.date);
    }
  }
  return counts;
}

/**
 * A generated week must carry the strength dose that protects tendons (ADR-112):
 * two structured sessions, one in a taper or race week. Mobility fillers do not count.
 */
export const strengthFrequencyRule: PlanLevelGateRule = (
  context: GateContext,
  proposals: readonly GateProposal[],
): RuleFinding[] => {
  if (
    !context.planWindow ||
    context.fatigueTrainingCapacity === 'REST_ONLY' ||
    enduranceActivityTypesForPracticed(context.practicedSports).length === 0
  ) {
    return [];
  }

  const counts = countStructuredStrength(context, proposals);
  const findings: RuleFinding[] = [];
  for (const key of judgedWeeks(context.planWindow)) {
    const phase = context.planWeeks.find((w) => weekKey(w.weekStart) === key)?.phase;
    const target =
      phase && LIGHT_PHASES.has(phase) ? LIGHT_WEEK_STRENGTH_TARGET : WEEKLY_STRENGTH_TARGET;
    const count = counts.get(key) ?? 0;
    if (count < target) {
      findings.push({
        ruleCode: 'STRENGTH_DOSE_LOW',
        severity: 'WARNING',
        rationale: `Semaine du ${key} : ${count} séance(s) de renfo structurée(s) pour ${target} attendue(s). Le renfo protège les tendons ; une mobilité courte ne le remplace pas.`,
        evidenceRefs: ['planWindow', 'proposal.type', 'proposal.durationMin'],
      });
    }
  }
  return findings;
};
