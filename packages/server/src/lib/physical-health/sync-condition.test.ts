import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  condition: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  conditionEpisode: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@sharpit/db/client', () => ({ prisma: db }));

import { syncConditionFromNote, type ConditionSourceNote } from './sync-condition';

const NOTE: ConditionSourceNote = {
  id: 'note-1',
  athleteId: 'a1',
  category: 'POSTURE',
  status: 'ACTIVE',
  title: 'Épaules enroulées',
  bodyPart: 'Épaule',
  side: 'BILATERAL',
  severity: 5,
  description: null,
  affectsTraining: true,
  startDate: new Date('2026-09-01T00:00:00Z'),
  resolvedAt: null,
};

describe('syncConditionFromNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.conditionEpisode.findFirst.mockResolvedValue({ id: 'ep-1', episodeNumber: 1 });
  });

  it('creates the Condition a note never got, with its first episode', async () => {
    db.condition.findFirst.mockResolvedValue(null);
    await syncConditionFromNote(NOTE);
    expect(db.condition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        legacyPhysicalNoteId: 'note-1',
        type: 'POSTURE_ISSUE',
        bodyRegion: 'Épaule',
        status: 'ACTIVE',
        episodes: { create: expect.objectContaining({ episodeNumber: 1, status: 'ACTIVE' }) },
      }),
    });
  });

  it('mirrors a resolution onto the condition and its current episode', async () => {
    db.condition.findFirst.mockResolvedValue({ id: 'c1' });
    const resolvedAt = new Date('2026-10-05T00:00:00Z');
    await syncConditionFromNote({ ...NOTE, status: 'RESOLVED', resolvedAt }, 'ACTIVE');
    expect(db.condition.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ status: 'RESOLVED', resolvedAt }),
    });
    expect(db.conditionEpisode.update).toHaveBeenCalledWith({
      where: { id: 'ep-1' },
      data: { status: 'RESOLVED', resolvedAt },
    });
  });

  it('opens a new episode and counts a recurrence when a resolved zone comes back', async () => {
    db.condition.findFirst.mockResolvedValue({ id: 'c1' });
    await syncConditionFromNote(NOTE, 'RESOLVED');
    expect(db.conditionEpisode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conditionId: 'c1', episodeNumber: 2 }),
    });
    expect(db.condition.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'RECURRENT', recurrenceCount: { increment: 1 } },
    });
  });
});
