import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ingest, findMany, deleteMany, updateMany } = vi.hoisted(() => ({
  ingest: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@sharpit/server/lib/engines/observation-engine', () => ({
  observationEngine: { ingest },
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: { observation: { findMany, deleteMany }, featureSet: { updateMany } },
}));

import {
  removeActivityObservations,
  syncManualActivityObservations,
} from './manual-observation-sync';

type Activity = Parameters<typeof syncManualActivityObservations>[0];

const activity = (overrides: Record<string, unknown> = {}): Activity =>
  ({
    id: 'act_1',
    athleteId: 'athlete_1',
    type: 'RUN',
    date: new Date('2026-11-11T17:00:00.000Z'),
    duration: 1800,
    title: 'Footing',
    notes: null,
    rpe: 4,
    feeling: null,
    garminId: null,
    stravaId: null,
    runMetrics: null,
    bikeMetrics: null,
    swimMetrics: null,
    ...overrides,
  }) as unknown as Activity;

const ingested = () => ingest.mock.calls.map(([, observation]) => observation);

describe('syncManualActivityObservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    deleteMany.mockResolvedValue({ count: 0 });
  });

  it('writes the session of an activity that no provider recorded', async () => {
    await syncManualActivityObservations(activity());

    expect(ingested()).toMatchObject([
      { type: 'SESSION', source: 'MANUAL', externalId: 'manual:activity:act_1' },
      { type: 'SUBJECTIVE', rpe: 4, sessionExternalId: 'manual:activity:act_1' },
    ]);
  });

  // The prod case: editing a Garmin run left a second, manual session for the same outing.
  it('writes no second session for a Garmin activity and ties the effort to the recorded one', async () => {
    await syncManualActivityObservations(activity({ garminId: '25045599677' }));

    expect(ingested()).toMatchObject([
      { type: 'SUBJECTIVE', rpe: 4, sessionExternalId: '25045599677' },
    ]);
  });

  it('does the same for a Strava activity', async () => {
    await syncManualActivityObservations(activity({ stravaId: '987' }));

    expect(ingested().map((observation) => observation.type)).toEqual(['SUBJECTIVE']);
    expect(ingested()[0].sessionExternalId).toBe('987');
  });

  it('removes the manual session an earlier edit left behind for a provider activity', async () => {
    await syncManualActivityObservations(activity({ garminId: '25045599677', rpe: null }));

    expect(deleteMany).toHaveBeenCalledWith({
      where: { athleteId: 'athlete_1', type: 'SESSION', externalId: 'manual:activity:act_1' },
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('replaces the effort already reported for the recorded session', async () => {
    findMany.mockResolvedValue([
      { id: 'obs_old', data: { sessionExternalId: '25045599677' } },
      { id: 'obs_other', data: { sessionExternalId: 'something-else' } },
    ]);

    await syncManualActivityObservations(activity({ garminId: '25045599677' }));

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['obs_old'] } } });
  });
});

describe('removeActivityObservations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    deleteMany.mockResolvedValue({ count: 0 });
    updateMany.mockResolvedValue({ count: 0 });
  });

  const deleted = {
    id: 'act_1',
    garminId: 'g1',
    stravaId: 's1',
    date: new Date('2026-10-25T10:00:00.000Z'),
  };
  const removedSessions = () =>
    deleteMany.mock.calls
      .map(([args]) => args.where)
      .filter((where) => where.type === 'SESSION')
      .map((where) => where.externalId);

  // The prod case: a deleted Garmin swim kept its session, and the load kept counting it.
  it('removes the session under every identity the activity carried', async () => {
    await removeActivityObservations('athlete_1', deleted);

    expect(removedSessions()).toEqual(['manual:activity:act_1', 'g1', 's1']);
  });

  it('only looks for the manual session of an activity no provider recorded', async () => {
    await removeActivityObservations('athlete_1', { ...deleted, garminId: null, stravaId: null });

    expect(removedSessions()).toEqual(['manual:activity:act_1']);
  });

  it('marks the loads from the activity’s day on to be computed again', async () => {
    await removeActivityObservations('athlete_1', deleted);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        athleteId: 'athlete_1',
        category: 'LOAD',
        status: 'COMPUTED',
        trainingDayId: { gte: '2026-10-25' },
      },
      data: { status: 'INVALIDATED' },
    });
  });
});
