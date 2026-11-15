import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ingest, findMany, deleteMany } = vi.hoisted(() => ({
  ingest: vi.fn(),
  findMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@sharpit/server/lib/engines/observation-engine', () => ({
  observationEngine: { ingest },
}));
vi.mock('@sharpit/db/client', () => ({
  prisma: { observation: { findMany, deleteMany } },
}));

import { syncManualActivityObservations } from './manual-observation-sync';

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
