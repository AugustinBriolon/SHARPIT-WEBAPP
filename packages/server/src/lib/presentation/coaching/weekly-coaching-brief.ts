/**
 * Weekly Coaching Brief — presentation mapping.
 *
 * Pure: takes already-fetched plain data (plan week, goal, planned sessions, per-session
 * Decision Memory records, today's snapshot context, learning feedback) and maps to the
 * ViewModel. All I/O happens in the API route. Never fabricates a weekly objective when
 * no reliable plan/goal context exists — see the degraded-state branch below.
 */

import { addDays, format } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import { fr } from 'date-fns/locale';
import type { ActivityType, GoalHorizon, PlanPhase, SessionIntensity } from '@prisma/client';
import { activityTypeLabels } from '@sharpit/app/lib/format';
import { formatJours } from '@sharpit/shared/french-plural';
import { intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import { phaseLabels } from '@sharpit/app/lib/training/periodization';
import { horizonLabels } from '@sharpit/app/lib/goals/goals';
import {
  computeTrainingLoad,
  ACWR_THRESHOLDS,
} from '@sharpit/server/lib/training/load/training-load';
import { WEEKLY_TARGET_TOLERANCE } from '@sharpit/server/lib/plan-gate/rules/weekly-load';
import { describeSnapshotContext } from '@sharpit/server/lib/presentation/coaching/snapshot-context-labels';
import type {
  WeeklyBriefKeySession,
  WeeklyBriefLearningFeedbackItem,
  WeeklyCoachingBriefViewModel,
} from '@sharpit/app/presentation/weekly-coaching-brief-view-model';
import type {
  CoachingDecisionRecord,
  DecisionSnapshotContext,
} from '@sharpit/app/lib/decision-memory/types';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';

const KEY_INTENSITIES = new Set<SessionIntensity>(['THRESHOLD', 'VO2MAX', 'RACE']);
const WEEK_DAYS = 7;

type WeeklyCoachingBriefInput = {
  weekStart: Date;
  now: Date;
  planWeek: {
    phase: PlanPhase;
    targetLoad: number;
    isDeload: boolean;
    focus: string | null;
  } | null;
  goal: { title: string; targetDate: Date | null; horizon: GoalHorizon | null } | null;
  plannedSessions: readonly {
    id: string;
    date: Date;
    type: ActivityType;
    intensity: SessionIntensity | null;
    durationMin: number | null;
    load: number | null;
    goalId?: string | null;
  }[];
  /** Goal titles keyed by id — used to label key sessions (option B). */
  goalTitleById?: ReadonlyMap<string, string>;
  dailyTrainingStress: readonly { load: number | null; date: Date }[];
  /** Origin CoachingDecision per planned session, only present for coach-proposed sessions. */
  sessionDecisions: ReadonlyMap<string, CoachingDecisionRecord>;
  todaysSnapshotContext: DecisionSnapshotContext | null;
  learningFeedback: readonly WeeklyBriefLearningFeedbackItem[];
};

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function toWeeklyBriefKeySession(
  s: WeeklyCoachingBriefInput['plannedSessions'][number],
  sessionDecisions: WeeklyCoachingBriefInput['sessionDecisions'],
  goalTitleById: ReadonlyMap<string, string> | undefined,
): WeeklyBriefKeySession {
  const decision = sessionDecisions.get(s.id);
  const goalTitle = resolveWeeklyBriefGoalTitle(s, decision, goalTitleById);
  return {
    sessionId: s.id,
    dateLabel: format(s.date, 'EEE d MMM', { locale: fr }),
    typeLabel: activityTypeLabels[s.type],
    intensityLabel: s.intensity ? intensityLabels[s.intensity] : null,
    purpose: decision?.proposal.rationale ?? null,
    goalTitle,
  };
}

function lookupGoalTitle(
  goalId: string | null | undefined,
  goalTitleById: ReadonlyMap<string, string> | undefined,
): string | null {
  if (!goalId || !goalTitleById) {
    return null;
  }
  return goalTitleById.get(goalId) ?? null;
}

function resolveWeeklyBriefGoalTitle(
  session: WeeklyCoachingBriefInput['plannedSessions'][number],
  decision: CoachingDecisionRecord | undefined,
  goalTitleById: ReadonlyMap<string, string> | undefined,
): string | null {
  const fromSession = lookupGoalTitle(session.goalId, goalTitleById);
  if (fromSession) {
    return fromSession;
  }
  return lookupGoalTitle(decision?.proposal.goalId, goalTitleById);
}

function buildKeySessions(
  plannedSessions: WeeklyCoachingBriefInput['plannedSessions'],
  sessionDecisions: WeeklyCoachingBriefInput['sessionDecisions'],
  goalTitleById: ReadonlyMap<string, string> | undefined,
): WeeklyBriefKeySession[] {
  const durationMedian = median(
    plannedSessions.map((s) => s.durationMin).filter((d): d is number => isSet(d)),
  );

  return plannedSessions
    .filter(
      (s) =>
        (s.intensity && KEY_INTENSITIES.has(s.intensity)) || (s.durationMin ?? 0) > durationMedian,
    )
    .map((s) => toWeeklyBriefKeySession(s, sessionDecisions, goalTitleById));
}

function buildRecoveryDays(
  weekStart: Date,
  plannedSessions: WeeklyCoachingBriefInput['plannedSessions'],
): { protectedDayLabels: string[]; note: string } {
  const sessionsByDay = new Map<string, WeeklyCoachingBriefInput['plannedSessions'][number][]>();
  for (const s of plannedSessions) {
    const key = dayKeyFromDate(s.date);
    const list = sessionsByDay.get(key) ?? [];
    list.push(s);
    sessionsByDay.set(key, list);
  }

  const protectedDayLabels: string[] = [];
  for (let i = 0; i < WEEK_DAYS; i += 1) {
    const day = addDays(weekStart, i);
    const key = format(day, 'yyyy-MM-dd');
    const daySessions = sessionsByDay.get(key) ?? [];
    const isProtected =
      daySessions.length === 0 || daySessions.every((s) => s.intensity === 'RECOVERY');
    if (isProtected) {
      protectedDayLabels.push(format(day, 'EEEE', { locale: fr }));
    }
  }

  const note =
    protectedDayLabels.length > 0
      ? `${formatJours(protectedDayLabels.length)} de récupération protégés cette semaine.`
      : 'Aucun jour de récupération explicite cette semaine.';

  return { protectedDayLabels, note };
}

function buildLoad(
  weekStart: Date,
  plannedSessions: WeeklyCoachingBriefInput['plannedSessions'],
  planWeek: WeeklyCoachingBriefInput['planWeek'],
  dailyTrainingStress: WeeklyCoachingBriefInput['dailyTrainingStress'],
): WeeklyCoachingBriefViewModel['load'] {
  const plannedLoad = Math.round(plannedSessions.reduce((sum, s) => sum + (s.load ?? 0), 0));

  if (planWeek) {
    return {
      plannedLoad,
      toleratedCeiling: Math.round(planWeek.targetLoad * WEEKLY_TARGET_TOLERANCE),
      toleratedSource: 'PLAN_TARGET',
    };
  }

  if (dailyTrainingStress.length === 0) {
    return { plannedLoad, toleratedCeiling: null, toleratedSource: null };
  }

  const estimate = computeTrainingLoad([...dailyTrainingStress], weekStart).weeklyLoad;
  return {
    plannedLoad,
    toleratedCeiling: Math.round(estimate * ACWR_THRESHOLDS.OVERLOAD_MODERATE),
    toleratedSource: 'ACWR_ESTIMATE',
  };
}

const WHAT_WOULD_CHANGE_RULE_CODES = new Set([
  'WEEKLY_LOAD_EXCEEDED',
  'INTENSITY_DISTRIBUTION_EXCEEDED',
  'FATIGUE_REST_ONLY',
  'FATIGUE_LIGHT_ONLY',
  'DECISION_INTENSITY_CONFLICT',
]);

function collectWeeklyBriefGateSignals(
  sessionDecisions: WeeklyCoachingBriefInput['sessionDecisions'],
) {
  const assumptions = new Set<string>();
  const dataGaps = new Set<string>();
  const whatWouldChange = new Set<string>();
  for (const decision of sessionDecisions.values()) {
    for (const assumption of decision.gateResult.requiredAssumptions) {
      assumptions.add(assumption);
    }
    for (const finding of decision.gateResult.findings) {
      if (finding.severity === 'REQUIRES_CONFIRMATION') {
        dataGaps.add(finding.rationale);
      }
      if (WHAT_WOULD_CHANGE_RULE_CODES.has(finding.ruleCode)) {
        whatWouldChange.add(finding.rationale);
      }
    }
  }
  return {
    assumptions: [...assumptions],
    dataGaps: [...dataGaps],
    whatWouldChange: [...whatWouldChange],
  };
}

function buildWeeklyBriefGoalContext(
  goal: NonNullable<WeeklyCoachingBriefInput['goal']>,
  now: Date,
): NonNullable<WeeklyCoachingBriefViewModel['goalContext']> {
  return {
    title: goal.title,
    targetDateLabel: goal.targetDate ? format(goal.targetDate, 'd MMM yyyy', { locale: fr }) : null,
    daysToGo: goal.targetDate
      ? Math.round((goal.targetDate.getTime() - now.getTime()) / 86_400_000)
      : null,
    horizonLabel: goal.horizon ? horizonLabels[goal.horizon] : null,
  };
}

function buildWeeklyBriefEmptyViewModel(input: {
  weekStartLabel: string;
  weekEndLabel: string;
  learningFeedback: WeeklyCoachingBriefInput['learningFeedback'];
}): WeeklyCoachingBriefViewModel {
  return {
    weekStartLabel: input.weekStartLabel,
    weekEndLabel: input.weekEndLabel,
    visible: true,
    planContext: null,
    goalContext: null,
    load: null,
    keySessions: [],
    recovery: null,
    limitingFactor: null,
    assumptions: [],
    dataGaps: [],
    whatWouldChange: [],
    learningFeedback: input.learningFeedback,
    emptyState: {
      title: 'Pas de plan structuré pour cette semaine',
      description: 'Génère un plan avec le coach pour voir ta semaine expliquée ici.',
      action: { label: 'Remplir ma semaine', href: '/plan/semaine?generate=1' },
    },
  };
}

function buildWeeklyBriefLimitingFactor(
  todaysSnapshotContext: WeeklyCoachingBriefInput['todaysSnapshotContext'],
  now: Date,
): WeeklyCoachingBriefViewModel['limitingFactor'] {
  if (!todaysSnapshotContext) {
    return null;
  }
  const snapshot = describeSnapshotContext(todaysSnapshotContext);
  return {
    limitingFactorLabel: snapshot.limitingFactorLabel,
    confidenceTierLabel: snapshot.confidenceTierLabel,
    asOfLabel: `Situation au ${format(now, 'd MMM', { locale: fr })} — peut évoluer d'ici la fin de semaine.`,
  };
}

function buildWeeklyBriefPopulatedViewModel(
  input: WeeklyCoachingBriefInput,
  weekStartLabel: string,
  weekEndLabel: string,
): WeeklyCoachingBriefViewModel {
  const { weekStart, now, planWeek, goal, plannedSessions, sessionDecisions } = input;
  const gateSignals = collectWeeklyBriefGateSignals(sessionDecisions);

  return {
    weekStartLabel,
    weekEndLabel,
    visible: true,
    planContext: planWeek
      ? {
          phaseLabel: phaseLabels[planWeek.phase],
          targetLoad: planWeek.targetLoad,
          isDeload: planWeek.isDeload,
          focus: planWeek.focus,
        }
      : null,
    goalContext: goal ? buildWeeklyBriefGoalContext(goal, now) : null,
    load: buildLoad(weekStart, plannedSessions, planWeek, input.dailyTrainingStress),
    keySessions: buildKeySessions(plannedSessions, sessionDecisions, input.goalTitleById),
    recovery: buildRecoveryDays(weekStart, plannedSessions),
    limitingFactor: buildWeeklyBriefLimitingFactor(input.todaysSnapshotContext, now),
    assumptions: gateSignals.assumptions,
    dataGaps: gateSignals.dataGaps,
    whatWouldChange: gateSignals.whatWouldChange,
    learningFeedback: input.learningFeedback,
    emptyState: null,
  };
}

export function buildWeeklyCoachingBriefViewModel(
  input: WeeklyCoachingBriefInput,
): WeeklyCoachingBriefViewModel {
  const { weekStart, planWeek, goal, plannedSessions } = input;
  const weekEnd = addDays(weekStart, WEEK_DAYS - 1);
  const weekStartLabel = format(weekStart, 'd MMM', { locale: fr });
  const weekEndLabel = format(weekEnd, 'd MMM yyyy', { locale: fr });

  const hasNothing = !planWeek && !goal && plannedSessions.length === 0;
  if (hasNothing) {
    return buildWeeklyBriefEmptyViewModel({
      weekStartLabel,
      weekEndLabel,
      learningFeedback: input.learningFeedback,
    });
  }

  return buildWeeklyBriefPopulatedViewModel(input, weekStartLabel, weekEndLabel);
}
