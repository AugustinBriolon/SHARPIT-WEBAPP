import { describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  activity: { findFirst: vi.fn().mockResolvedValue(null) },
  plannedSession: { updateMany: vi.fn() },
}));

vi.mock('@sharpit/db/client', () => ({ prisma: prismaMock }));

import { linkPlannedSessionActivity } from '@sharpit/server/lib/queries/planned-sessions';

describe('linkPlannedSessionActivity — absorbed legs', () => {
  it('cannot link a planned session to a hidden multisport leg', async () => {
    const linked = await linkPlannedSessionActivity('athlete-1', 'ps-1', 'leg-swim');

    expect(linked).toBeNull();
    expect(prismaMock.activity.findFirst).toHaveBeenCalledWith({
      where: { id: 'leg-swim', athleteId: 'athlete-1', mergedIntoId: null },
      select: { id: true },
    });
    expect(prismaMock.plannedSession.updateMany).not.toHaveBeenCalled();
  });
});
