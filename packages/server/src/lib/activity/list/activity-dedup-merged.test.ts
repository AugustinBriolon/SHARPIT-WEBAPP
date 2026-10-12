import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityType } from '@prisma/client';

const prismaMock = vi.hoisted(() => ({
  activity: { findUnique: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));

import { findMatchingActivity } from '@sharpit/server/lib/activity/list/activity-dedup';

const date = new Date('2026-10-11T08:17:00Z');
const hiddenLeg = {
  id: 'leg-bike',
  type: ActivityType.BIKE,
  date,
  duration: 2100,
  garminId: null,
  stravaId: 's-bike',
  appleHealthId: null,
  source: 'strava',
  rpe: null,
  feeling: null,
  mergedIntoId: 'tri-1',
};

describe('findMatchingActivity — absorbed multisport legs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('still finds a hidden leg by its external id, so a re-sync keeps it hidden', async () => {
    prismaMock.activity.findUnique.mockResolvedValue(hiddenLeg);

    const match = await findMatchingActivity('athlete-1', {
      type: ActivityType.BIKE,
      date,
      duration: 2100,
      stravaId: 's-bike',
    });

    expect(match).toMatchObject({ id: 'leg-bike', mergedIntoId: 'tri-1' });
    expect(prismaMock.activity.findMany).not.toHaveBeenCalled();
  });

  it('never matches a hidden leg by fingerprint', async () => {
    prismaMock.activity.findMany.mockResolvedValue([]);

    await findMatchingActivity('athlete-1', { type: ActivityType.BIKE, date, duration: 2100 });

    expect(prismaMock.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ athleteId: 'athlete-1', mergedIntoId: null }),
      }),
    );
  });
});
