import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  garminAccount: { findUnique: vi.fn() },
  stravaAccount: { findUnique: vi.fn() },
  withingsAccount: { findUnique: vi.fn() },
  renphoAccount: { findUnique: vi.fn() },
  googleAccount: { findUnique: vi.fn() },
  athleteProfile: { findUnique: vi.fn(), update: vi.fn() },
}));

vi.mock('@sharpit/db/client', () => ({ prisma: db }));

const { loadConnectedIntegrationIds } = await import('./source-prefs-store');

describe('loadConnectedIntegrationIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.garminAccount.findUnique.mockResolvedValue(null);
    db.stravaAccount.findUnique.mockResolvedValue(null);
    db.withingsAccount.findUnique.mockResolvedValue(null);
    db.renphoAccount.findUnique.mockResolvedValue(null);
    db.googleAccount.findUnique.mockResolvedValue(null);
    db.athleteProfile.findUnique.mockResolvedValue(null);
  });

  it('includes apple-calendar when appleCalendarLinkedAt is set', async () => {
    db.athleteProfile.findUnique.mockResolvedValue({
      appleHealthLinkedAt: null,
      appleCalendarLinkedAt: new Date('2026-10-08T10:00:00Z'),
    });

    await expect(loadConnectedIntegrationIds('athlete-1')).resolves.toEqual([
      'sharpit',
      'apple-calendar',
    ]);
  });

  it('omits apple-calendar when not linked', async () => {
    db.athleteProfile.findUnique.mockResolvedValue({
      appleHealthLinkedAt: null,
      appleCalendarLinkedAt: null,
    });

    await expect(loadConnectedIntegrationIds('athlete-1')).resolves.toEqual(['sharpit']);
  });
});
