import { beforeEach, describe, expect, it, vi } from 'vitest';

const googleSync = vi.hoisted(() => ({
  getGoogleAccount: vi.fn(),
  getUpcomingBusy: vi.fn(),
}));

const prefsStore = vi.hoisted(() => ({
  loadResolvedSourcePrefs: vi.fn(),
}));

const timeZoneModule = vi.hoisted(() => ({
  resolveAthleteCalendarTimeZone: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => googleSync);
vi.mock('@sharpit/server/lib/integrations/source-prefs-store', () => prefsStore);
vi.mock('@sharpit/server/lib/integrations/apple-calendar/athlete-calendar-time-zone', () => ({
  resolveAthleteCalendarTimeZone: timeZoneModule.resolveAthleteCalendarTimeZone,
}));

import { buildQueryCoachTools } from './coach-tools-query';

describe('getCalendarAvailability coach tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    timeZoneModule.resolveAthleteCalendarTimeZone.mockResolvedValue('Europe/Paris');
  });

  it('returns connected with Apple-only calendar prefs', async () => {
    googleSync.getGoogleAccount.mockResolvedValue(null);
    prefsStore.loadResolvedSourcePrefs.mockResolvedValue({
      version: 1,
      classes: {
        calendar: { primary: 'apple-calendar', enabled: ['apple-calendar'] },
      },
    });
    googleSync.getUpcomingBusy.mockResolvedValue([
      { dayKey: '2026-10-10', start: '09:00', end: '10:00' },
    ]);

    const tool = buildQueryCoachTools('ath-1').getCalendarAvailability;
    const result = await tool.execute!({ days: 14 }, {} as never);

    expect(result).toEqual({
      connected: true,
      timeZone: 'Europe/Paris',
      busy: [{ dayKey: '2026-10-10', start: '09:00', end: '10:00' }],
    });
  });

  it('returns connected:false when no calendar provider is active', async () => {
    googleSync.getGoogleAccount.mockResolvedValue(null);
    prefsStore.loadResolvedSourcePrefs.mockResolvedValue({
      version: 1,
      classes: { calendar: { primary: null, enabled: [] } },
    });

    const tool = buildQueryCoachTools('ath-1').getCalendarAvailability;
    const result = await tool.execute!({ days: 14 }, {} as never);

    expect(result).toEqual({ connected: false, busy: [] });
    expect(googleSync.getUpcomingBusy).not.toHaveBeenCalled();
  });
});
