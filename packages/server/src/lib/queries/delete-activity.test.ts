import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    plannedSession: {
      findMany: vi.fn(),
    },
    activity: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const ATHLETE_ID = 'default';

vi.mock('@sharpit/server/lib/queries/planned-sessions', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@sharpit/server/lib/queries/planned-sessions')>();
  return {
    ...actual,
    linkPlannedSessionActivity: vi.fn(),
  };
});

describe('deleteActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unlinks the planned session before deleting the activity', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { linkPlannedSessionActivity } =
      await import('@sharpit/server/lib/queries/planned-sessions');
    const { deleteActivity } = await import('@sharpit/server/lib/queries/index');

    vi.mocked(prisma.activity.findFirst).mockResolvedValue({ id: 'act-1' } as never);
    vi.mocked(prisma.plannedSession.findMany).mockResolvedValue([{ id: 'ps-1' }] as never);
    vi.mocked(linkPlannedSessionActivity).mockResolvedValue({} as never);
    vi.mocked(prisma.activity.delete).mockResolvedValue({ id: 'act-1' } as never);

    await deleteActivity(ATHLETE_ID, 'act-1');

    expect(prisma.plannedSession.findMany).toHaveBeenCalledWith({
      where: { activityId: { in: ['act-1'] }, athleteId: ATHLETE_ID },
      select: { id: true },
    });
    expect(linkPlannedSessionActivity).toHaveBeenCalledWith(ATHLETE_ID, 'ps-1', null);
    expect(prisma.activity.delete).toHaveBeenCalledWith({ where: { id: 'act-1' } });
  });

  it('deletes the activity without unlink when nothing is linked', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { linkPlannedSessionActivity } =
      await import('@sharpit/server/lib/queries/planned-sessions');
    const { deleteActivity } = await import('@sharpit/server/lib/queries/index');

    vi.mocked(prisma.activity.findFirst).mockResolvedValue({ id: 'act-2' } as never);
    vi.mocked(prisma.plannedSession.findMany).mockResolvedValue([]);
    vi.mocked(prisma.activity.delete).mockResolvedValue({ id: 'act-2' } as never);

    await deleteActivity(ATHLETE_ID, 'act-2');

    expect(linkPlannedSessionActivity).not.toHaveBeenCalled();
    expect(prisma.activity.delete).toHaveBeenCalledWith({ where: { id: 'act-2' } });
  });

  it('deletes the legs a multisport parent absorbed, so they do not resurface', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { linkPlannedSessionActivity } =
      await import('@sharpit/server/lib/queries/planned-sessions');
    const { deleteActivity } = await import('@sharpit/server/lib/queries/index');

    vi.mocked(prisma.activity.findFirst).mockResolvedValue({ id: 'tri' } as never);
    vi.mocked(prisma.activity.findMany).mockResolvedValue([{ id: 'swim' }, { id: 'run' }] as never);
    vi.mocked(prisma.plannedSession.findMany).mockResolvedValue([{ id: 'ps-swim' }] as never);
    vi.mocked(prisma.activity.delete).mockResolvedValue({ id: 'tri' } as never);

    const deleted = await deleteActivity(ATHLETE_ID, 'tri');

    expect(prisma.activity.findMany).toHaveBeenCalledWith({
      where: { athleteId: ATHLETE_ID, mergedIntoId: 'tri' },
      select: { id: true },
    });
    expect(linkPlannedSessionActivity).toHaveBeenCalledWith(ATHLETE_ID, 'ps-swim', null);
    expect(prisma.activity.deleteMany).toHaveBeenCalledWith({
      where: { athleteId: ATHLETE_ID, id: { in: ['swim', 'run'] } },
    });
    expect(deleted?.mergedLegIds).toEqual(['swim', 'run']);
  });
});
