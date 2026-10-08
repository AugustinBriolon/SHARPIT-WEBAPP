import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    googleAccount: {
      findUnique: vi.fn(),
    },
    athleteProfile: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@sharpit/server/lib/integrations/source-prefs-store', () => ({
  loadResolvedSourcePrefs: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot', () => ({
  loadAppleCalendarBusy: vi.fn(),
}));

const { getUpcomingBusy } = await import('./google-sync');
const { prisma } = await import('@sharpit/db/client');
const { loadResolvedSourcePrefs } =
  await import('@sharpit/server/lib/integrations/source-prefs-store');
const { loadAppleCalendarBusy } =
  await import('@sharpit/server/lib/integrations/apple-calendar/calendar-busy-snapshot');

describe('getUpcomingBusy with Apple upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.googleAccount.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValue({
      googleAccount: { timeZone: 'Europe/Paris' },
    } as never);
    vi.mocked(loadResolvedSourcePrefs).mockResolvedValue({
      version: 1,
      classes: {
        calendar: { primary: 'apple-calendar', enabled: ['apple-calendar'] },
      },
    } as never);
  });

  it('returns uploaded Apple intervals when Google is not connected', async () => {
    vi.mocked(loadAppleCalendarBusy).mockResolvedValue([
      { start: '2026-10-10T07:00:00.000Z', end: '2026-10-10T08:30:00.000Z' },
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    const busy = await getUpcomingBusy('ath-1', 14);
    vi.useRealTimers();

    expect(busy).toEqual([{ dayKey: '2026-10-10', start: '09:00', end: '10:30' }]);
  });

  it('uses the athlete Google account timezone when Google calendar sync is off', async () => {
    vi.mocked(prisma.athleteProfile.findUnique).mockResolvedValue({
      googleAccount: { timeZone: 'America/New_York' },
    } as never);
    vi.mocked(loadAppleCalendarBusy).mockResolvedValue([
      { start: '2026-10-10T12:00:00.000Z', end: '2026-10-10T13:30:00.000Z' },
    ]);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    const busy = await getUpcomingBusy('ath-1', 14);
    vi.useRealTimers();

    expect(busy).toEqual([{ dayKey: '2026-10-10', start: '08:00', end: '09:30' }]);
  });
});
