import { beforeEach, describe, expect, it, vi } from 'vitest';

const inbox = { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() };
const sync = {
  forgetGarminUser: vi.fn(),
  getGarminAccountByUserId: vi.fn(),
  updateGarminPermissions: vi.fn(),
  writeGarminHealthDay: vi.fn(),
};
const ingestGarminActivities = vi.fn();
const onProviderSyncCompleted = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    garminPushInbox: inbox,
    activity: { findFirst: vi.fn() },
    athleteProfile: { update: vi.fn() },
  },
}));
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-sync', () => sync);
vi.mock('@sharpit/server/lib/integrations/garmin/garmin-activity-sync', () => ({
  ingestGarminActivities,
}));
vi.mock('@sharpit/server/lib/athlete-state/orchestrator', () => ({ onProviderSyncCompleted }));
vi.mock('@sharpit/server/lib/streams/streams', () => ({ persistStream: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  inbox.create.mockImplementation(({ data }) => Promise.resolve({ id: `row-${data.summaryType}` }));
});

describe('receiveGarminPush', () => {
  it('keeps one row per handled summary list and ignores the rest', async () => {
    const { receiveGarminPush } = await import('./garmin-push');
    const ids = await receiveGarminPush({
      dailies: [{ userId: 'u1' }],
      epochs: [{ userId: 'u1' }],
      sleeps: [],
    });
    expect(ids).toEqual(['row-dailies']);
    expect(inbox.create).toHaveBeenCalledTimes(1);
  });

  it('stores nothing for a body that is not a push', async () => {
    const { receiveGarminPush } = await import('./garmin-push');
    expect(await receiveGarminPush(null)).toEqual([]);
    expect(await receiveGarminPush('nope')).toEqual([]);
  });
});

describe('processGarminPushRow', () => {
  function row(summaryType: string, payload: unknown[]) {
    inbox.findUnique.mockResolvedValue({ id: 'r', summaryType, payload, processedAt: null });
  }

  it('writes a daily for the linked athlete, then refreshes the athlete state', async () => {
    sync.getGarminAccountByUserId.mockResolvedValue({ athleteId: 'athlete-1' });
    sync.writeGarminHealthDay.mockResolvedValue('updated');
    row('dailies', [{ userId: 'u1', calendarDate: '2026-10-24', steps: 9000 }]);
    const { processGarminPushRow } = await import('./garmin-push');

    await processGarminPushRow('r');

    expect(sync.writeGarminHealthDay).toHaveBeenCalledWith(
      'athlete-1',
      expect.objectContaining({ date: '2026-10-24', totalSteps: 9000 }),
    );
    expect(onProviderSyncCompleted).toHaveBeenCalledWith('athlete-1', [
      expect.objectContaining({ provider: 'garmin', observationCount: 1 }),
    ]);
    expect(inbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { processedAt: expect.any(Date) } }),
    );
  });

  it('drops data for a Garmin user no athlete is linked to', async () => {
    sync.getGarminAccountByUserId.mockResolvedValue(null);
    row('dailies', [{ userId: 'stranger', calendarDate: '2026-10-24', steps: 1 }]);
    const { processGarminPushRow } = await import('./garmin-push');

    await processGarminPushRow('r');

    expect(sync.writeGarminHealthDay).not.toHaveBeenCalled();
  });

  it('forgets a user who removed SharpIt from Garmin Connect', async () => {
    row('deregistrations', [{ userId: 'u1' }]);
    const { processGarminPushRow } = await import('./garmin-push');

    await processGarminPushRow('r');

    expect(sync.forgetGarminUser).toHaveBeenCalledWith('u1');
  });

  it('imports the legs of a pushed session, never the multisport parent', async () => {
    sync.getGarminAccountByUserId.mockResolvedValue({ athleteId: 'athlete-1' });
    ingestGarminActivities.mockResolvedValue({
      imported: 1,
      updated: 0,
      merged: 0,
      skipped: 0,
      changedActivityIds: ['a1'],
      changedTypes: [],
    });
    row('activities', [
      {
        userId: 'u1',
        activityId: 1,
        activityType: 'MULTI_SPORT',
        isParent: true,
        startTimeInSeconds: 1,
      },
      { userId: 'u1', activityId: 2, activityType: 'CYCLING', startTimeInSeconds: 1 },
    ]);
    const { processGarminPushRow } = await import('./garmin-push');

    await processGarminPushRow('r');

    const [[, activities]] = ingestGarminActivities.mock.calls;
    expect(activities.map((a: { activityId: number }) => a.activityId)).toEqual([2]);
  });

  it('counts a failed attempt and rethrows, so the cron replays the row', async () => {
    sync.getGarminAccountByUserId.mockRejectedValue(new Error('db down'));
    row('dailies', [{ userId: 'u1', calendarDate: '2026-10-24', steps: 1 }]);
    const { processGarminPushRow } = await import('./garmin-push');

    await expect(processGarminPushRow('r')).rejects.toThrow('db down');
    expect(inbox.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: { increment: 1 } }) }),
    );
  });
});
