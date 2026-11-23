import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  activity: { findFirst: vi.fn() },
  googleAccount: { findUnique: vi.fn().mockResolvedValue(null) },
  plannedSession: {
    findFirst: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue({ id: 'ps-1' }),
  },
}));

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));

import { linkPlannedSessionActivity } from '@sharpit/server/lib/queries/planned-sessions';

const monday = new Date('2026-11-23T00:00:00Z');

describe('linkPlannedSessionActivity — the session goes where it was done', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.activity.findFirst.mockResolvedValue({
      id: 'act-1',
      date: new Date('2026-11-22T16:40:00Z'),
    });
  });

  it('moves a session done the day before to that day and time', async () => {
    prismaMock.plannedSession.findFirst.mockResolvedValue({
      date: monday,
      startTime: '18:00',
      brickGroupId: null,
    });

    await linkPlannedSessionActivity('athlete-1', 'ps-1', 'act-1', { takeDoneSchedule: true });

    expect(prismaMock.plannedSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'ps-1', athleteId: 'athlete-1' },
      data: {
        activityId: 'act-1',
        completed: true,
        date: new Date('2026-11-22T00:00:00Z'),
        startTime: '17:40',
      },
    });
  });

  it('leaves a brick’s leg in its chain', async () => {
    prismaMock.plannedSession.findFirst.mockResolvedValue({
      date: monday,
      startTime: '18:00',
      brickGroupId: 'brick-1',
    });

    await linkPlannedSessionActivity('athlete-1', 'ps-1', 'act-1', { takeDoneSchedule: true });

    expect(prismaMock.plannedSession.updateMany.mock.calls[0]![0].data).toEqual({
      activityId: 'act-1',
      completed: true,
    });
  });

  it('leaves the schedule alone when not asked (the same-day auto-link)', async () => {
    await linkPlannedSessionActivity('athlete-1', 'ps-1', 'act-1');

    expect(prismaMock.plannedSession.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.plannedSession.updateMany.mock.calls[0]![0].data).toEqual({
      activityId: 'act-1',
      completed: true,
    });
  });
});
