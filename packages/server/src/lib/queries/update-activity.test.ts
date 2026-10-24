import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    activity: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@sharpit/server/lib/integrations/garmin/garmin', () => ({
  clientFromTokens: vi.fn(),
  garminTokensFromStorage: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/garmin/garmin-multisport', () => ({
  fetchGarminMultisportLegs: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/garmin/garmin-sync', () => ({
  getGarminAccount: vi.fn(),
}));

const ATHLETE_ID = 'athlete-1';
const ACTIVITY_ID = 'act-1';

describe('updateActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses activity.update (not updateMany) so nested metric upserts are valid', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { updateActivity } = await import('@sharpit/server/lib/queries/index');

    const nestedData = {
      rpe: 7,
      feeling: 'Bien',
      type: 'RUN' as const,
      runMetrics: { upsert: { create: {}, update: {} } },
    };

    vi.mocked(prisma.activity.findFirst).mockResolvedValue({ id: ACTIVITY_ID } as never);
    vi.mocked(prisma.activity.update).mockResolvedValue({
      id: ACTIVITY_ID,
      rpe: 7,
      feeling: 'Bien',
    } as never);

    const result = await updateActivity(ATHLETE_ID, ACTIVITY_ID, nestedData);

    expect(prisma.activity.findFirst).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID, athleteId: ATHLETE_ID },
      select: { id: true },
    });
    expect(prisma.activity.update).toHaveBeenCalledWith({
      where: { id: ACTIVITY_ID },
      data: nestedData,
      include: expect.any(Object),
    });
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: ACTIVITY_ID, rpe: 7, feeling: 'Bien' });
  });

  it('updates swimMetrics via nested upsert without updateMany', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { updateActivity } = await import('@sharpit/server/lib/queries/index');

    const nestedData = {
      rpe: 5,
      feeling: 'Correct',
      type: 'SWIM' as const,
      swimMetrics: {
        upsert: { create: { distanceM: 2000 }, update: { distanceM: 2000 } },
      },
    };

    vi.mocked(prisma.activity.findFirst).mockResolvedValue({ id: ACTIVITY_ID } as never);
    vi.mocked(prisma.activity.update).mockResolvedValue({ id: ACTIVITY_ID } as never);

    await updateActivity(ATHLETE_ID, ACTIVITY_ID, nestedData);

    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
    expect(prisma.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ACTIVITY_ID },
        data: nestedData,
      }),
    );
  });

  it('returns null when the activity is not owned by the athlete (IDOR)', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { updateActivity } = await import('@sharpit/server/lib/queries/index');

    vi.mocked(prisma.activity.findFirst).mockResolvedValue(null);

    const result = await updateActivity(ATHLETE_ID, ACTIVITY_ID, { rpe: 8 });

    expect(result).toBeNull();
    expect(prisma.activity.update).not.toHaveBeenCalled();
    expect(prisma.activity.updateMany).not.toHaveBeenCalled();
  });
});
