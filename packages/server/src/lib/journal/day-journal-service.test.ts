import { describe, expect, it, vi } from 'vitest';
import { rowToDayJournalEntry } from './day-journal-service';

describe('day-journal-service', () => {
  it('maps a DB row to a day journal entry', () => {
    expect(
      rowToDayJournalEntry({
        trainingDayId: '2026-09-09',
        factors: { coffee: 'yes', late_meal: 'no' },
        moodLabel: 'Bon',
        hydrationMl: 1500,
        caffeineMg: 80,
        drivingMinutes: 45,
        updatedAt: new Date('2026-09-09T10:00:00.000Z'),
      }),
    ).toEqual({
      trainingDayId: '2026-09-09',
      factors: { coffee: 'yes', late_meal: 'no' },
      moodLabel: 'Bon',
      hydrationMl: 1500,
      caffeineMg: 80,
      drivingMinutes: 45,
      updatedAt: '2026-09-09T10:00:00.000Z',
    });
  });

  it('coalesces null caffeine to 0 mg', () => {
    expect(
      rowToDayJournalEntry({
        trainingDayId: '2026-09-09',
        factors: {},
        moodLabel: null,
        hydrationMl: null,
        caffeineMg: null,
        updatedAt: new Date('2026-09-09T10:00:00.000Z'),
      }).caffeineMg,
    ).toBe(0);
  });
});

describe('upsertDayJournalEntryDb', () => {
  const row = {
    trainingDayId: '2026-10-02',
    factors: {},
    moodLabel: null,
    hydrationMl: null,
    caffeineMg: null,
    updatedAt: new Date('2026-10-02T08:00:00.000Z'),
  };

  it('runs a write that lost the create race again, onto the row now stored', async () => {
    const { PrismaClientKnownRequestError } = await import('@prisma/client/runtime/library');
    const { upsertDayJournalEntryDb } = await import('./day-journal-service');
    const raced = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const upsert = vi.fn().mockRejectedValueOnce(raced).mockResolvedValueOnce(row);
    const prisma = {
      athleteDayJournal: { findUnique: vi.fn().mockResolvedValue(null), upsert },
    } as never;

    const entry = await upsertDayJournalEntryDb(prisma, 'athlete-1', {
      trainingDayId: '2026-10-02',
    });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(entry.trainingDayId).toBe('2026-10-02');
  });

  it('lets any other failure through', async () => {
    const { upsertDayJournalEntryDb } = await import('./day-journal-service');
    const prisma = {
      athleteDayJournal: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockRejectedValue(new Error('down')),
      },
    } as never;

    await expect(
      upsertDayJournalEntryDb(prisma, 'athlete-1', { trainingDayId: '2026-10-02' }),
    ).rejects.toThrow('down');
  });
});
