import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  activity: { findMany: vi.fn(), findFirst: vi.fn() },
  plannedSession: { findMany: vi.fn(), findFirst: vi.fn() },
  analysisRun: { findMany: vi.fn() },
}));
const linkPlannedSessionActivity = vi.hoisted(() => vi.fn());

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));
vi.mock('@sharpit/server/lib/queries/planned-sessions', () => ({
  linkPlannedSessionActivity,
  setPlannedSessionAnalysis: vi.fn(),
}));
vi.mock('@sharpit/server/lib/ai', () => ({ isCoachConfigured: vi.fn().mockReturnValue(false) }));
vi.mock('@sharpit/server/lib/coach/plan/coach-analysis', () => ({
  analyzePlannedSession: vi.fn(),
}));
vi.mock('@sharpit/server/lib/analysis/analysis-run-store', () => ({ withAnalysisRun: vi.fn() }));

import {
  autoLinkActivitiesOfDay,
  plannedSessionsAwaitingAnalysis,
} from '@sharpit/server/lib/planned-session/linking/session-linking';

const day = new Date('2026-09-20T12:00:00');
const morning = new Date('2026-09-20T07:30:00');

describe('autoLinkActivitiesOfDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.plannedSession.findFirst.mockResolvedValue(null);
    linkPlannedSessionActivity.mockResolvedValue({});
  });

  it('only looks at the day’s activities that have no planned session', async () => {
    prismaMock.activity.findMany.mockResolvedValue([]);

    await autoLinkActivitiesOfDay('athlete-1', day);

    const [[{ where }]] = prismaMock.activity.findMany.mock.calls;
    expect(where.athleteId).toBe('athlete-1');
    expect(where.plannedSession).toEqual({ is: null });
    expect(where.date.gte).toEqual(new Date('2026-09-20T00:00:00'));
    expect(where.date.lt).toEqual(new Date('2026-09-21T00:00:00'));
  });

  it('does nothing when every activity is already linked', async () => {
    prismaMock.activity.findMany.mockResolvedValue([]);

    await expect(autoLinkActivitiesOfDay('athlete-1', day)).resolves.toEqual([]);
    expect(linkPlannedSessionActivity).not.toHaveBeenCalled();
  });

  it('links an unlinked activity to the same-day session of its type', async () => {
    prismaMock.activity.findMany.mockResolvedValue([{ id: 'activity-1' }]);
    prismaMock.activity.findFirst.mockResolvedValue({
      id: 'activity-1',
      type: 'RUN',
      date: morning,
      duration: 3600,
    });
    prismaMock.plannedSession.findMany.mockResolvedValue([
      { id: 'session-1', date: day, durationMin: 60 },
    ]);

    const linked = await autoLinkActivitiesOfDay('athlete-1', day);

    expect(linked).toEqual(['session-1']);
    expect(linkPlannedSessionActivity).toHaveBeenCalledWith('athlete-1', 'session-1', 'activity-1');
  });

  it('does not use one session for two activities', async () => {
    prismaMock.activity.findMany.mockResolvedValue([{ id: 'activity-1' }, { id: 'activity-2' }]);
    prismaMock.activity.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ id: where.id, type: 'RUN', date: morning, duration: 3600 }),
    );
    prismaMock.plannedSession.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id?.notIn?.includes('session-1')
          ? []
          : [{ id: 'session-1', date: day, durationMin: 60 }],
      ),
    );

    const linked = await autoLinkActivitiesOfDay('athlete-1', day);

    expect(linked).toEqual(['session-1']);
    expect(linkPlannedSessionActivity).toHaveBeenCalledTimes(1);
  });
});

describe('plannedSessionsAwaitingAnalysis', () => {
  const now = new Date('2026-11-17T10:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks again for last week’s linked sessions with no reading, never a Strava-only one', async () => {
    prismaMock.plannedSession.findMany.mockResolvedValue([{ id: 'ride' }, { id: 'run' }]);
    prismaMock.analysisRun.findMany.mockResolvedValue([]);

    expect(await plannedSessionsAwaitingAnalysis('athlete-1', now)).toEqual(['ride', 'run']);

    const [[{ where }]] = prismaMock.plannedSession.findMany.mock.calls;
    expect(where.athleteId).toBe('athlete-1');
    expect(where.activity.is.NOT).toEqual({ source: 'strava' });
    expect(where.activity.is.date.gte).toEqual(new Date('2026-11-10T10:00:00Z'));
  });

  it('leaves a session whose run is in flight or ended in the last six hours', async () => {
    prismaMock.plannedSession.findMany.mockResolvedValue([{ id: 'ride' }, { id: 'run' }]);
    prismaMock.analysisRun.findMany.mockResolvedValue([{ targetId: 'ride' }]);

    expect(await plannedSessionsAwaitingAnalysis('athlete-1', now)).toEqual(['run']);

    const [[{ where }]] = prismaMock.analysisRun.findMany.mock.calls;
    expect(where.OR).toEqual([
      { status: 'RUNNING' },
      { finishedAt: { gte: new Date('2026-11-17T04:00:00Z') } },
    ]);
  });
});
