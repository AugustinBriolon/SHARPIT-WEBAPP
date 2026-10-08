import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    calendarBusySnapshot: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const { prisma } = await import('@sharpit/db/client');
const { loadAppleCalendarBusy, saveAppleCalendarBusy } = await import('./calendar-busy-snapshot');

describe('calendar-busy-snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops invalid intervals when reloading from storage', async () => {
    vi.mocked(prisma.calendarBusySnapshot.findUnique).mockResolvedValue({
      intervals: [
        { start: '2026-10-10T07:00:00.000Z', end: '2026-10-10T08:00:00.000Z' },
        { start: 'not-a-date', end: '2026-10-10T09:00:00.000Z' },
        { start: '2026-10-10T10:00:00.000Z', end: '2026-10-10T10:00:00.000Z' },
        { start: '2026-10-10T11:00:00.000Z', end: '2026-10-10T09:00:00.000Z' },
      ],
    } as never);

    await expect(loadAppleCalendarBusy('ath-1')).resolves.toEqual([
      { start: '2026-10-10T07:00:00.000Z', end: '2026-10-10T08:00:00.000Z' },
    ]);
  });

  it('returns uploaded intervals through load after save', async () => {
    const intervals = [{ start: '2026-10-10T07:00:00.000Z', end: '2026-10-10T08:30:00.000Z' }];

    vi.mocked(prisma.calendarBusySnapshot.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.calendarBusySnapshot.findUnique).mockResolvedValue({
      intervals,
    } as never);

    await saveAppleCalendarBusy('ath-1', intervals);
    await expect(loadAppleCalendarBusy('ath-1')).resolves.toEqual(intervals);
    expect(prisma.calendarBusySnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ athleteId: 'ath-1', intervals }),
      }),
    );
  });
});
