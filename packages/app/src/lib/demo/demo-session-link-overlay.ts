import type { ActivityType, SessionIntensity } from '@prisma/client';
import type { ClientActivity, ClientPlannedSession } from '@sharpit/app/lib/query/types';
import type { ActivityDetail } from '@sharpit/app/lib/activity/detail/types';
import {
  readDemoSessionLinks,
  type DemoSessionLinkReading,
} from '@sharpit/app/lib/demo/demo-session-link-state';

export type DemoLinkPlannedSnapshot = {
  title?: string | null;
  type: ActivityType;
  date: string;
  durationMin?: number | null;
  intensity?: SessionIntensity | null;
  description?: string | null;
};

export type DemoLinkEntry = {
  plannedSessionId: string;
  activityId: string;
  planned?: DemoLinkPlannedSnapshot;
  reading?: DemoSessionLinkReading;
};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function findDemoLinkByActivityId(
  activityId: string,
  links: readonly DemoLinkEntry[] = readDemoSessionLinks(),
): DemoLinkEntry | undefined {
  return links.find((entry) => entry.activityId === activityId);
}

export function findDemoLinkByPlannedSessionId(
  plannedSessionId: string,
  links: readonly DemoLinkEntry[] = readDemoSessionLinks(),
): DemoLinkEntry | undefined {
  return links.find((entry) => entry.plannedSessionId === plannedSessionId);
}

export function plannedSessionSummaryFromClient(
  session: Pick<
    ClientPlannedSession,
    | 'id'
    | 'title'
    | 'date'
    | 'type'
    | 'durationMin'
    | 'description'
    | 'intensity'
    | 'analysis'
    | 'analyzedAt'
    | 'brickGroupId'
    | 'brickOrder'
  >,
): NonNullable<ActivityDetail['plannedSession']> {
  return {
    id: session.id,
    title: session.title,
    date: toDate(session.date),
    type: session.type,
    durationMin: session.durationMin,
    description: session.description,
    intensity: session.intensity,
    analysis: session.analysis,
    analyzedAt: session.analyzedAt ? toDate(session.analyzedAt) : null,
    brickGroupId: session.brickGroupId,
    brickOrder: session.brickOrder,
    goal: null,
  };
}

function plannedSessionSummaryFromSnapshot(
  plannedSessionId: string,
  snapshot: DemoLinkPlannedSnapshot,
): NonNullable<ActivityDetail['plannedSession']> {
  return {
    id: plannedSessionId,
    title: snapshot.title ?? null,
    date: toDate(snapshot.date),
    type: snapshot.type,
    durationMin: snapshot.durationMin ?? null,
    description: snapshot.description ?? null,
    intensity: snapshot.intensity ?? null,
    analysis: null,
    analyzedAt: null,
    // Demo snapshots never model a brick — nothing to overlay.
    brickGroupId: null,
    brickOrder: null,
    goal: null,
  };
}

/** Activity detail RSC payload — overlay demo-only link from sessionStorage. */
export function resolveDemoLinkedPlannedSessionForActivity(
  activityId: string,
  serverPlannedSession: ActivityDetail['plannedSession'],
  plannedSessions: readonly ClientPlannedSession[] | undefined,
  links: readonly DemoLinkEntry[] = readDemoSessionLinks(),
): ActivityDetail['plannedSession'] {
  if (serverPlannedSession) {
    return serverPlannedSession;
  }

  const link = findDemoLinkByActivityId(activityId, links);
  if (!link) {
    return null;
  }

  const session = plannedSessions?.find((item) => item.id === link.plannedSessionId);
  if (session) {
    return withDemoReadingSummary(plannedSessionSummaryFromClient(session), link.reading);
  }
  if (link.planned) {
    return withDemoReadingSummary(
      plannedSessionSummaryFromSnapshot(link.plannedSessionId, link.planned),
      link.reading,
    );
  }
  return null;
}

function withDemoReadingSummary(
  summary: NonNullable<ActivityDetail['plannedSession']>,
  reading: DemoSessionLinkReading | undefined,
): NonNullable<ActivityDetail['plannedSession']> {
  if (!reading) {
    return summary;
  }
  return {
    ...summary,
    analysis: reading.analysis,
    analyzedAt: new Date(reading.analyzedAt),
  };
}

function resolveDemoActivity(
  activityId: string,
  session: ClientPlannedSession,
  activities: readonly ClientActivity[] | undefined,
): NonNullable<ClientPlannedSession['activity']> {
  const activityFromCache = activities?.find((item) => item.id === activityId);
  if (activityFromCache) {
    return activityFromCache as NonNullable<ClientPlannedSession['activity']>;
  }
  if (session.activity?.id === activityId) {
    return session.activity;
  }
  return { id: activityId } as NonNullable<ClientPlannedSession['activity']>;
}

function patchSessionActivityLink(
  session: ClientPlannedSession,
  link: DemoLinkEntry,
  activities: readonly ClientActivity[] | undefined,
): ClientPlannedSession {
  const { activityId } = link;
  if (session.activityId === activityId && session.activity?.id === activityId) {
    return session;
  }

  return {
    ...session,
    activityId,
    activity: resolveDemoActivity(activityId, session, activities),
    completed: true,
  } as ClientPlannedSession;
}

function patchSessionReading(
  session: ClientPlannedSession,
  reading: DemoSessionLinkReading,
): ClientPlannedSession {
  const analyzedAt = new Date(reading.analyzedAt);
  return {
    ...session,
    analysis: session.analysis ?? reading.analysis,
    analyzedAt: session.analyzedAt ?? analyzedAt,
    activity: session.activity
      ? ({
          ...session.activity,
          narrativeAnalysis: session.activity.narrativeAnalysis ?? reading.narrative,
          narrativeAnalyzedAt: session.activity.narrativeAnalyzedAt ?? analyzedAt,
        } as NonNullable<ClientPlannedSession['activity']>)
      : session.activity,
  } as ClientPlannedSession;
}

/** Planned-session modal — keep activityId / nested activity in demo after hard navigation. */
export function overlayDemoLinkOnPlannedSession(
  session: ClientPlannedSession,
  activities: readonly ClientActivity[] | undefined,
  links: readonly DemoLinkEntry[] = readDemoSessionLinks(),
): ClientPlannedSession {
  const link = findDemoLinkByPlannedSessionId(session.id, links);
  if (!link) {
    return session;
  }

  const patched = patchSessionActivityLink(session, link, activities);
  if (!link.reading) {
    return patched;
  }
  return patchSessionReading(patched, link.reading);
}
