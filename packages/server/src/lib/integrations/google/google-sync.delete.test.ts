import { emptySourcePrefs } from '@sharpit/app/lib/integrations/source-prefs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteEvent = vi.fn();
const loadResolvedSourcePrefs = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    googleAccount: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@sharpit/server/lib/integrations/google/google', () => ({
  GoogleOAuthError: class GoogleOAuthError extends Error {},
  refreshAccessToken: vi.fn(),
  createEvent: vi.fn(),
  deleteEvent: (...args: unknown[]) => deleteEvent(...args),
  getFreeBusy: vi.fn(),
  listCalendars: vi.fn(),
  listEvents: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock('@sharpit/server/lib/integrations/source-prefs-store', () => ({
  loadResolvedSourcePrefs: (...args: unknown[]) => loadResolvedSourcePrefs(...args),
}));

describe('deleteSessionFromGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SECRET_ENCRYPTION_KEY = 'google-delete-test';
  });

  it('does not delete Google events when calendar primary is not google', async () => {
    const { prisma } = await import('@sharpit/db/client');
    const { encryptSecret } = await import('@sharpit/server/lib/secret-box');
    const { deleteSessionFromGoogle } =
      await import('@sharpit/server/lib/integrations/google/google-sync');

    const prefs = emptySourcePrefs();
    prefs.classes.calendar = {
      primary: 'apple-calendar',
      enabled: ['google', 'apple-calendar'],
    };
    loadResolvedSourcePrefs.mockResolvedValue(prefs);

    vi.mocked(prisma.googleAccount.findUnique).mockResolvedValue({
      athleteId: 'ath-1',
      targetCalendarId: 'cal-1',
      accessTokenEnc: encryptSecret('access'),
      refreshTokenEnc: encryptSecret('refresh'),
      expiresAt: new Date(Date.now() + 3600_000),
    } as never);

    await deleteSessionFromGoogle({
      athleteId: 'ath-1',
      googleEventId: 'evt-1',
    });

    expect(deleteEvent).not.toHaveBeenCalled();
  });
});
