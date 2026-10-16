import { isSameDay, startOfDay } from 'date-fns';
import { isSet } from '@sharpit/shared/value';
import type { ActivityType } from '@prisma/client';
import type { ClientActivity, ClientPlannedSession } from '@sharpit/app/lib/query/types';
import {
  brickLegSummaries,
  groupPlannedSessions,
  type BrickLegSummary,
  type DayPlannedItem,
} from '@sharpit/app/lib/planned-session/brick/brick-sessions';
import { comparePlannedSessionsBySchedule } from '@sharpit/app/lib/planned-session/planned-session-dates';
import { activityTypeLabels, formatDuration } from '@sharpit/app/lib/format';
import { formatPlannedDuration, intensityLabels } from '@sharpit/app/lib/planned-session/sessions';
import {
  buildCompletedSessionMetrics,
  type CompletedSessionMetric,
} from '@sharpit/app/lib/today/rich/completed-session-metrics';
import { buildPlannedSessionMetrics } from '@sharpit/app/lib/today/rich/planned-session-metrics';
import {
  brickTransitionsSec,
  collectDoneBricks,
  formatTransition,
  type DoneBrick,
} from '@sharpit/app/lib/today/dashboard/today-brick-lines';

export type DaySummaryLine = {
  id: string;
  kind: 'done' | 'planned';
  activityType: ActivityType;
  primary: string;
  secondary?: string;
  /** Key KPIs for Today session preview cards (done + planned, max 3). */
  metrics?: CompletedSessionMetric[];
  /** Set for single planned sessions — enables shared label atoms in the UI. */
  plannedSession?: ClientPlannedSession;
  /** Set for a brick line — the athlete sees one card with each leg behind a dropdown. */
  brickLegs?: BrickLegSummary[];
  /** Set for a brick under way: seconds from each leg's end to the next's start, null if unknown. */
  brickTransitionsSec?: Array<number | null>;
  /** A done session's match to its plan, 0–100, once the analysis ran; null otherwise. */
  complianceScore?: number | null;
};

/** The compliance score out of a planned session's stored analysis, when it holds one. */
export function readComplianceScore(analysis: unknown): number | null {
  if (!analysis || typeof analysis !== 'object') return null;
  const score = (analysis as { complianceScore?: unknown }).complianceScore;
  return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;
}

export type TodayDaySummary = {
  sectionLabel: string;
  lines: DaySummaryLine[];
  isEmpty: boolean;
};

function filterTodayActivities(activities: ClientActivity[], refDay: Date): ClientActivity[] {
  return activities
    .filter((a) => isSameDay(new Date(a.date), refDay))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function resolveLinkedPlannedIds(
  activities: ClientActivity[],
  plannedSessions: ClientPlannedSession[],
): Set<string> {
  return new Set(
    [
      ...plannedSessions.map((s) => (s.activityId ? s.id : null)),
      ...activities.map((a) => a.plannedSession?.id ?? null),
    ].filter((id): id is string => isSet(id)),
  );
}

function filterTodayPlannedSessions(
  plannedSessions: ClientPlannedSession[],
  refDay: Date,
  linkedPlannedIds: Set<string>,
): ClientPlannedSession[] {
  return plannedSessions
    .filter(
      (s) =>
        isSameDay(new Date(s.date), refDay) &&
        !s.completed &&
        !s.activityId &&
        !linkedPlannedIds.has(s.id),
    )
    .sort(comparePlannedSessionsBySchedule);
}

function buildDoneActivityLine(a: ClientActivity): DaySummaryLine {
  return {
    id: a.id,
    kind: 'done' as const,
    activityType: a.type,
    primary: activityLabel(a),
    secondary: activityMeta(a),
    metrics: buildCompletedSessionMetrics({
      type: a.type,
      duration: a.duration,
      load: a.load,
      rpe: a.rpe,
      runMetrics: a.runMetrics,
      bikeMetrics: a.bikeMetrics,
      swimMetrics: a.swimMetrics,
      hikeMetrics: a.hikeMetrics,
      strengthSets: a.strengthSets ?? [],
    }),
    complianceScore: readComplianceScore(a.plannedSession?.analysis),
  };
}

function sumOrNull(values: Array<number | null | undefined>): number | null {
  const set = values.filter((v): v is number => isSet(v));
  return set.length ? set.reduce((sum, v) => sum + v, 0) : null;
}

/** One line for a brick under way: its legs beside their activities, and its transitions. */
function buildDoneBrickLine(brick: DoneBrick): DaySummaryLine {
  const done = brick.legs.flatMap((leg) => (leg.activity ? [leg.activity] : []));
  const pending = brick.legs.filter((leg) => !leg.activity);
  const transitions = brickTransitionsSec(brick.legs);
  const firstTransition = transitions.find(isSet);
  const durationSec = sumOrNull(done.map((a) => a.duration));
  const load = sumOrNull(done.map((a) => a.load));
  return {
    id: brick.brickGroupId,
    kind: 'done',
    activityType: 'TRIATHLON',
    primary: `Brick · ${brick.legs.map((leg) => activityTypeLabels[leg.session.type]).join(' → ')}`,
    secondary: [
      durationSec ? formatDuration(durationSec) : null,
      isSet(load) ? `${Math.round(load)} TSS` : null,
      isSet(firstTransition) ? `Transition ${formatTransition(firstTransition)}` : null,
      pending.length
        ? `${pending.map((leg) => activityTypeLabels[leg.session.type]).join(', ')} à faire`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
    // First leg backs the deep-link id; the card itself renders every leg.
    plannedSession: brick.legs[0]!.session,
    brickLegs: brickLegSummaries(
      brick.legs.map((leg) => leg.session),
      (session) => brick.legs.find((leg) => leg.session.id === session.id)?.activity ?? null,
    ),
    brickTransitionsSec: transitions,
  };
}

/** Done sessions in the day's order: activities alone, and bricks as one line each. */
function buildDoneLines(
  activities: ClientActivity[],
  bricks: readonly DoneBrick[],
): DaySummaryLine[] {
  const inBrick = new Set(
    bricks.flatMap((brick) => brick.legs.flatMap((leg) => (leg.activity ? [leg.activity.id] : []))),
  );
  const items = [
    ...activities
      .filter((a) => !inBrick.has(a.id))
      .map((a) => ({ at: new Date(a.date).getTime(), line: buildDoneActivityLine(a) })),
    ...bricks.map((brick) => ({ at: brick.startedAt.getTime(), line: buildDoneBrickLine(brick) })),
  ];
  return items.sort((a, b) => a.at - b.at).map((item) => item.line);
}

/**
 * Done today plus still to do today. Past unrealized sessions are deliberately
 * absent: catch-up is a Plan question, and listing it here turned Today into a
 * backlog the athlete could not act on.
 */
export function buildTodayDaySummary(
  date: Date,
  activities: ClientActivity[],
  plannedSessions: ClientPlannedSession[],
  goalTitleById?: ReadonlyMap<string, string>,
): TodayDaySummary {
  const refDay = startOfDay(date);
  const todayActivities = filterTodayActivities(activities, refDay);
  const linkedPlannedIds = resolveLinkedPlannedIds(activities, plannedSessions);
  const doneBricks = collectDoneBricks(todayActivities, plannedSessions);
  const bricksUnderWay = new Set(doneBricks.map((brick) => brick.brickGroupId));
  // A brick under way is one line with its done legs: its remaining legs are not listed apart.
  const todayPlanned = filterTodayPlannedSessions(plannedSessions, refDay, linkedPlannedIds).filter(
    (s) => !s.brickGroupId || !bricksUnderWay.has(s.brickGroupId),
  );
  const doneLines = buildDoneLines(todayActivities, doneBricks);
  const plannedLines = buildPlannedLines(todayPlanned, goalTitleById);
  const lines = [...doneLines, ...plannedLines];

  if (lines.length === 0) {
    return {
      sectionLabel: "Aujourd'hui",
      lines: [],
      isEmpty: true,
    };
  }

  return {
    sectionLabel: resolveSectionLabel(doneLines.length, plannedLines.length),
    lines,
    isEmpty: false,
  };
}

function buildBrickPlannedLine(
  group: Extract<DayPlannedItem, { kind: 'brick' }>,
  goalTitleById?: ReadonlyMap<string, string>,
): DaySummaryLine {
  const totalMin = group.sessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
  const brickGoalId = group.sessions.find((s) => s.goalId)?.goalId;
  const brickGoalTitle = brickGoalId ? goalTitleById?.get(brickGoalId) : undefined;
  const duration = formatPlannedDuration(totalMin);
  return {
    id: group.id,
    kind: 'planned',
    activityType: 'TRIATHLON',
    primary: `Brick · ${group.sessions.map((s) => activityTypeLabels[s.type]).join(' → ')}`,
    secondary: [duration, brickGoalTitle ? `Sert ${brickGoalTitle}` : null]
      .filter(Boolean)
      .join(' · '),
    // First leg backs the deep-link id; the card itself renders every leg.
    plannedSession: group.sessions[0],
    brickLegs: brickLegSummaries(group.sessions),
  };
}

function buildSinglePlannedLine(
  session: ClientPlannedSession,
  goalTitleById?: ReadonlyMap<string, string>,
): DaySummaryLine {
  const goalTitle = session.goalId ? goalTitleById?.get(session.goalId) : undefined;
  return {
    id: session.id,
    kind: 'planned',
    activityType: session.type,
    primary: plannedLabel(session),
    secondary: plannedMeta(session, goalTitleById),
    metrics: buildPlannedSessionMetrics({
      type: session.type,
      durationMin: session.durationMin,
      intensity: session.intensity,
      load: session.load,
      goalTitle,
      title: session.title,
      description: session.description,
      accessories: session.accessories,
      strengthPrescription: session.strengthPrescription,
    }),
    plannedSession: session,
  };
}

function buildPlannedLines(
  todayPlanned: ClientPlannedSession[],
  goalTitleById?: ReadonlyMap<string, string>,
): DaySummaryLine[] {
  const groups = groupPlannedSessions(todayPlanned);
  const lines: DaySummaryLine[] = [];

  for (const group of groups) {
    if (group.kind === 'brick') {
      lines.push(buildBrickPlannedLine(group, goalTitleById));
      continue;
    }
    lines.push(buildSinglePlannedLine(group.session, goalTitleById));
  }

  return lines;
}

function resolveSectionLabel(doneCount: number, plannedCount: number): string {
  if (doneCount > 0 && plannedCount > 0) {
    return "Aujourd'hui · réalisé et à venir";
  }

  if (doneCount > 0) {
    return doneCount === 1 ? "Réalisé aujourd'hui" : `Réalisé aujourd'hui · ${doneCount} séances`;
  }

  return "Prévu aujourd'hui";
}

function activityLabel(activity: ClientActivity): string {
  const plannedTitle = activity.plannedSession?.title?.trim();
  if (plannedTitle) {
    return plannedTitle;
  }
  const title = activity.title?.trim();
  return title ?? activityTypeLabels[activity.type];
}

function plannedLabel(session: ClientPlannedSession): string {
  const title = session.title?.trim();
  return title ?? activityTypeLabels[session.type];
}

/**
 * What a finished session cost, on one line.
 *
 * RPE was fetched, carried all the way here, and dropped — the home screen showed
 * duration and TSS, both of which a watch computes, and left out the only number
 * the athlete supplies himself. It is also the one that disagrees: same load, a
 * rising RPE, is fatigue the load model cannot see.
 *
 * Spelled "RPE 7" to match the activity detail header. The two lines are
 * deliberately not sharing a formatter — one is a compact summary that drops
 * empty parts, the other a detail header that always leads with duration, and
 * they answer to different screens.
 */
function activityMeta(activity: ClientActivity): string | undefined {
  const parts: string[] = [];
  if (activity.duration) {
    parts.push(formatDuration(activity.duration));
  }
  if (isSet(activity.load)) {
    parts.push(`${Math.round(activity.load)} TSS`);
  }
  if (isSet(activity.rpe)) {
    parts.push(`RPE ${activity.rpe}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function plannedMeta(
  session: ClientPlannedSession,
  goalTitleById?: ReadonlyMap<string, string>,
): string | undefined {
  const parts: string[] = [];
  if (session.intensity) {
    parts.push(intensityLabels[session.intensity]);
  }
  if (session.durationMin) {
    parts.push(formatPlannedDuration(session.durationMin));
  }
  if (isSet(session.load)) {
    parts.push(`${Math.round(session.load)} TSS`);
  }
  if (session.goalId) {
    const title = goalTitleById?.get(session.goalId);
    if (title) {
      parts.push(`Sert ${title}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
