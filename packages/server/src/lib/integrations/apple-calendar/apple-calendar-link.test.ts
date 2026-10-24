import { beforeEach, describe, expect, it, vi } from 'vitest';
import { legacyDefaultsFromConnected } from '@sharpit/app/lib/integrations/source-prefs';

const db = vi.hoisted(() => ({
  garminAccount: { findUnique: vi.fn() },
  stravaAccount: { findUnique: vi.fn() },
  withingsAccount: { findUnique: vi.fn() },
  renphoAccount: { findUnique: vi.fn() },
  googleAccount: { findUnique: vi.fn() },
  athleteProfile: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock('@sharpit/db/client', () => ({ prisma: db }));
vi.mock('server-only', () => ({}));

const { linkAppleCalendar } = await import('./apple-calendar-link');

type ProfileRow = {
  appleCalendarLinkedAt: Date | null;
  appleHealthLinkedAt?: Date | null;
  integrationSourcePrefs?: unknown;
};

describe('linkAppleCalendar', () => {
  let profile: ProfileRow;

  beforeEach(() => {
    vi.clearAllMocks();
    profile = {
      appleCalendarLinkedAt: null,
      appleHealthLinkedAt: null,
      integrationSourcePrefs: legacyDefaultsFromConnected(['google']),
    };
    db.garminAccount.findUnique.mockResolvedValue(null);
    db.stravaAccount.findUnique.mockResolvedValue(null);
    db.withingsAccount.findUnique.mockResolvedValue(null);
    db.renphoAccount.findUnique.mockResolvedValue(null);
    db.googleAccount.findUnique.mockResolvedValue({ athleteId: 'athlete-1' });
    db.athleteProfile.findUnique.mockImplementation(async () => ({ ...profile }));
    db.athleteProfile.update.mockImplementation(async ({ data }: { data: Partial<ProfileRow> }) => {
      profile = { ...profile, ...data };
      return profile;
    });
  });

  it('sets linkedAt and enables apple-calendar for calendar class', async () => {
    await linkAppleCalendar('athlete-1', true);

    expect(profile.appleCalendarLinkedAt).toBeInstanceOf(Date);

    const prefsWrite = db.athleteProfile.update.mock.calls.find(
      (call) => call[0]?.data?.integrationSourcePrefs !== undefined,
    );
    expect(prefsWrite?.[0].data.integrationSourcePrefs.classes.calendar.enabled).toContain(
      'apple-calendar',
    );
  });

  it('is a no-op when already linked', async () => {
    profile.appleCalendarLinkedAt = new Date('2026-10-01T00:00:00Z');

    await linkAppleCalendar('athlete-1', true);

    expect(db.athleteProfile.update).not.toHaveBeenCalled();
  });

  it('clears linkedAt and removes apple-calendar from prefs on unlink', async () => {
    profile.appleCalendarLinkedAt = new Date('2026-10-01T00:00:00Z');
    profile.integrationSourcePrefs = legacyDefaultsFromConnected(['google', 'apple-calendar']);

    await linkAppleCalendar('athlete-1', false);

    expect(profile.appleCalendarLinkedAt).toBeNull();

    const prefsWrite = db.athleteProfile.update.mock.calls.find(
      (call) => call[0]?.data?.integrationSourcePrefs !== undefined,
    );
    expect(prefsWrite?.[0].data.integrationSourcePrefs.classes.calendar.enabled).not.toContain(
      'apple-calendar',
    );
  });
});
