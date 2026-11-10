import { addDays, startOfWeek } from 'date-fns';
import { weekdayLabel, type Weekday } from '@sharpit/app/lib/training-availability/types';
import type {
  GateContext,
  GateProposal,
  PlanLevelGateRule,
  RuleFinding,
} from '@sharpit/app/lib/plan-gate/types';

const WEEK_OPTS = { weekStartsOn: 1 as const };
/** A week the window barely touches is not the generator's to fill. */
const MIN_WINDOW_DAYS_IN_WEEK = 5;

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

function sessionDate(date: string | Date): Date {
  return typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
}

/** ADD proposals plus existing rows the proposals do not supersede, keyed by week. */
function sessionCounts(
  context: GateContext,
  proposals: readonly GateProposal[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (date: Date) => counts.set(weekKey(date), (counts.get(weekKey(date)) ?? 0) + 1);
  const modifiedIds = new Set(proposals.map((p) => p.sessionId).filter(Boolean));

  for (const p of proposals) {
    add(sessionDate(p.date));
  }
  for (const s of context.existingSessions) {
    if (!modifiedIds.has(s.id)) {
      add(s.date);
    }
  }
  return counts;
}

/**
 * The athlete declared how many sessions and which weekdays — warn when the generated week
 * disagrees. Warning only: same severity as weekly-load; the athlete can keep the proposal.
 */
export const availabilityMatchRule: PlanLevelGateRule = (
  context: GateContext,
  proposals: readonly GateProposal[],
): RuleFinding[] => {
  if (!context.planWindow) {
    return [];
  }

  const findings: RuleFinding[] = [];
  const weeks = judgedWeeks(context.planWindow);
  const declared = context.declaredSessionsPerWeek;

  if (typeof declared === 'number' && declared > 0) {
    const counts = sessionCounts(context, proposals);
    for (const key of weeks) {
      const count = counts.get(key) ?? 0;
      if (count !== declared) {
        findings.push({
          ruleCode: 'AVAILABILITY_SESSION_COUNT',
          severity: 'WARNING',
          rationale: `Semaine du ${key} : ${count} séance(s) pour ${declared} déclarée(s).`,
          evidenceRefs: ['declaredSessionsPerWeek', 'planWindow'],
        });
      }
    }
  }

  const weekdays = context.declaredWeekdays;
  if (weekdays && weekdays.length > 0) {
    const allowed = new Set(weekdays);
    const off = new Set<Weekday>();
    for (const p of proposals) {
      const day = sessionDate(p.date).getDay() as Weekday;
      if (weeks.has(weekKey(sessionDate(p.date))) && !allowed.has(day)) {
        off.add(day);
      }
    }
    if (off.size > 0) {
      const labels = [...off].map(weekdayLabel).filter(Boolean).join(', ');
      findings.push({
        ruleCode: 'AVAILABILITY_WEEKDAY',
        severity: 'WARNING',
        rationale: `Séance(s) un jour non déclaré : ${labels}.`,
        evidenceRefs: ['declaredWeekdays', 'proposal.date'],
      });
    }
  }

  return findings;
};
