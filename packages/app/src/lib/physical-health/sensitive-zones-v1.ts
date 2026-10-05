/**
 * `GET /api/v1/sensitive-zones` — the athlete's declared zones as a followed state
 * (ADR-068): what each one does to the plan, how it evolved, and what to ask next.
 *
 * Pure: the handler loads the notes and the upcoming sessions, this shapes them.
 */

import {
  categoryLabels,
  COMMON_BODY_PARTS,
  sideLabels,
  statusLabels,
} from '@sharpit/app/lib/physical-health/physical';
import {
  reassessmentDue,
  reassessmentQuestion,
} from '@sharpit/app/lib/physical-health/reassessment-due';
import {
  auditUpcomingSessions,
  countSessionsLoadingZone,
  type AuditableSession,
} from '@sharpit/app/lib/physical-health/sensitive-zone-audit';
import {
  catalogGroupsForRegion,
  sensitiveZonesFrom,
} from '@sharpit/app/lib/physical-health/sensitive-zones';
import {
  FUNCTIONAL_IMPACT_LABELS,
  recurrenceCount,
  resolutionSuggested,
  statusChangeLabel,
  ZONE_STRATEGY_DETAILS,
  ZONE_STRATEGY_LABELS,
  zoneStrategy,
  type ZoneStrategy,
} from '@sharpit/app/lib/physical-health/zone-follow-up';

export type ZoneNoteCheckin = {
  id: string;
  date: Date;
  createdAt: Date;
  severity: number | null;
  comment: string | null;
  functionalImpact: string | null;
  status: string | null;
};

export type ZoneNote = {
  id: string;
  category: keyof typeof categoryLabels;
  status: keyof typeof statusLabels;
  title: string;
  bodyPart: string | null;
  side: keyof typeof sideLabels;
  severity: number | null;
  functionalImpact: string | null;
  description: string | null;
  affectsTraining: boolean;
  startDate: Date;
  resolvedAt: Date | null;
  checkins: ZoneNoteCheckin[];
};

export type V1ZoneTimelineEntry = {
  id: string;
  date: string;
  /** `reading`: a follow-up with a severity; `status`: the zone changed state. */
  kind: 'reading' | 'status';
  label: string;
  severity: number | null;
  functionalImpact: string | null;
  comment: string | null;
};

export type V1SensitiveZone = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  bodyPart: string | null;
  /** False when the region is unknown to the lexicon: the plan check cannot see this zone. */
  bodyPartRecognized: boolean;
  side: string;
  sideLabel: string | null;
  status: string;
  statusLabel: string;
  severity: number | null;
  functionalImpact: string | null;
  functionalImpactLabel: string | null;
  description: string | null;
  affectsTraining: boolean;
  startDate: string;
  resolvedAt: string | null;
  strategy: ZoneStrategy;
  strategyLabel: string;
  strategyDetail: string;
  resolutionSuggested: boolean;
  recurrenceCount: number;
  /** The follow-up question owed, or null when the zone was heard from recently. */
  followUpQuestion: string | null;
  upcomingSessionsLoading: number;
  /** Newest first. */
  timeline: V1ZoneTimelineEntry[];
};

export type V1SensitiveZones = {
  apiVersion: 1;
  zones: V1SensitiveZone[];
  /** The body parts offered when declaring — each one checked against the plan. */
  bodyParts: string[];
};

function chronological(checkins: readonly ZoneNoteCheckin[]): ZoneNoteCheckin[] {
  return [...checkins].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function readingLabel(checkin: ZoneNoteCheckin): string {
  return checkin.severity === null ? 'Point de suivi' : `Douleur ${checkin.severity}/10`;
}

export function zoneTimeline(checkins: readonly ZoneNoteCheckin[]): V1ZoneTimelineEntry[] {
  let previous: string | null = null;
  const entries = chronological(checkins).map((checkin) => {
    const isStatus = checkin.status !== null;
    const label = isStatus
      ? statusChangeLabel(checkin.status ?? '', previous)
      : readingLabel(checkin);
    if (isStatus) {
      previous = checkin.status;
    }
    return {
      id: checkin.id,
      date: checkin.date.toISOString(),
      kind: isStatus ? ('status' as const) : ('reading' as const),
      label,
      severity: checkin.severity,
      functionalImpact: checkin.functionalImpact,
      comment: checkin.comment,
    };
  });
  return entries.reverse();
}

const STRATEGY_ORDER: Record<ZoneStrategy, number> = {
  protect: 0,
  progressive: 1,
  correct: 2,
  relapse_watch: 3,
  none: 4,
};

function byFollowUpOrder(a: V1SensitiveZone, b: V1SensitiveZone): number {
  const resolved = Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED');
  if (resolved !== 0) {
    return resolved;
  }
  return STRATEGY_ORDER[a.strategy] - STRATEGY_ORDER[b.strategy];
}

function followUpQuestion(note: ZoneNote, now: Date): string | null {
  const due = reassessmentDue({ note, lastRealisedSessionAt: null, now });
  return due ? reassessmentQuestion(due) : null;
}

function upcomingLoad(note: ZoneNote, sessions: readonly AuditableSession[], now: Date): number {
  const zones = sensitiveZonesFrom([note]);
  if (zones.length === 0) {
    return 0;
  }
  return countSessionsLoadingZone(auditUpcomingSessions({ sessions, zones, now }), note.title);
}

export function projectSensitiveZone(
  note: ZoneNote,
  sessions: readonly AuditableSession[],
  now: Date,
): V1SensitiveZone {
  const strategy = zoneStrategy(note, now);
  return {
    id: note.id,
    title: note.title,
    category: note.category,
    categoryLabel: categoryLabels[note.category],
    bodyPart: note.bodyPart,
    bodyPartRecognized: catalogGroupsForRegion(note.bodyPart).length > 0,
    side: note.side,
    sideLabel: note.side === 'NA' ? null : sideLabels[note.side],
    status: note.status,
    statusLabel: statusLabels[note.status],
    severity: note.severity,
    functionalImpact: note.functionalImpact,
    functionalImpactLabel: note.functionalImpact
      ? (FUNCTIONAL_IMPACT_LABELS[note.functionalImpact] ?? null)
      : null,
    description: note.description,
    affectsTraining: note.affectsTraining,
    startDate: note.startDate.toISOString(),
    resolvedAt: note.resolvedAt?.toISOString() ?? null,
    strategy,
    strategyLabel: ZONE_STRATEGY_LABELS[strategy],
    strategyDetail: ZONE_STRATEGY_DETAILS[strategy],
    resolutionSuggested: resolutionSuggested(note, now),
    recurrenceCount: recurrenceCount(note.checkins),
    followUpQuestion: followUpQuestion(note, now),
    upcomingSessionsLoading: upcomingLoad(note, sessions, now),
    timeline: zoneTimeline(note.checkins),
  };
}

export function projectSensitiveZones(input: {
  notes: readonly ZoneNote[];
  sessions: readonly AuditableSession[];
  now: Date;
}): V1SensitiveZones {
  return {
    apiVersion: 1,
    zones: input.notes
      .map((note) => projectSensitiveZone(note, input.sessions, input.now))
      .sort(byFollowUpOrder),
    bodyParts: [...COMMON_BODY_PARTS],
  };
}
