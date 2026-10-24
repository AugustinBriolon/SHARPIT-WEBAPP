import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();
vi.mock('@sharpit/db/client', () => ({
  prisma: { athleteProfile: { findUnique: (...args: unknown[]) => findUniqueMock(...args) } },
}));

// Outside a Clerk request (a cron), `auth()` throws: the athlete checks must never reach it.
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => {
    throw new Error("Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()");
  }),
}));

const {
  athleteCanConnectProvider,
  athleteHasAiProcessingConsent,
  athleteHasHealthDataConsent,
  isDemoAthlete,
} = await import('@sharpit/server/lib/privacy/consent-store');

const consenting = {
  termsAcceptedAt: new Date('2026-09-01'),
  privacyAcceptedAt: new Date('2026-09-01'),
  privacyVersion: '2026-09',
  healthDataConsentAt: new Date('2026-09-01'),
  aiProcessingConsentAt: new Date('2026-09-01'),
  unofficialProvidersAckAt: new Date('2026-09-01'),
  deletedAt: null,
  clerkUserId: 'user_1',
};

describe('athlete consent checks without a session', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('read an athlete’s consents from their profile, as a scheduled job needs', async () => {
    findUniqueMock.mockResolvedValue(consenting);
    expect(await athleteHasHealthDataConsent('athlete-1')).toBe(true);
    expect(await athleteHasAiProcessingConsent('athlete-1')).toBe(true);
    expect(await athleteCanConnectProvider('athlete-1', 'garmin')).toBe(true);
  });

  it('refuse what the athlete has not consented to', async () => {
    findUniqueMock.mockResolvedValue({
      ...consenting,
      healthDataConsentAt: null,
      aiProcessingConsentAt: null,
    });
    expect(await athleteHasHealthDataConsent('athlete-1')).toBe(false);
    expect(await athleteHasAiProcessingConsent('athlete-1')).toBe(false);
  });

  it('let the demo athlete through by its profile', async () => {
    findUniqueMock.mockResolvedValue({
      ...consenting,
      healthDataConsentAt: null,
      clerkUserId: 'demo',
    });
    expect(await athleteHasHealthDataConsent('demo-athlete')).toBe(true);
    expect(await isDemoAthlete('demo-athlete')).toBe(true);
  });

  it('tells a real athlete from the demo one', async () => {
    findUniqueMock.mockResolvedValue(consenting);
    expect(await isDemoAthlete('athlete-1')).toBe(false);
  });
});
