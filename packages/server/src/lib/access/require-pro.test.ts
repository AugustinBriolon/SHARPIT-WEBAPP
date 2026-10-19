import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUniqueMock = vi.fn();

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    athleteProfile: { findUnique: (...args: unknown[]) => findUniqueMock(...args) },
  },
}));

import { PRO_REQUIRED, requirePro } from './require-pro';

describe('requirePro', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it('lets a Pro athlete through', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'PRO', onboardingCompletedAt: new Date() });
    expect(await requirePro('athlete-1')).toBeNull();
  });

  it('refuses a Free athlete with 403 pro_required', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE', onboardingCompletedAt: new Date() });
    const response = await requirePro('athlete-1');
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: PRO_REQUIRED });
  });

  it('refuses an unknown athlete', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect((await requirePro('ghost', { allowOnboardingPreview: true }))?.status).toBe(403);
  });

  it('lets a Free athlete preview the first week while the wizard is open', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE', onboardingCompletedAt: null });
    expect(await requirePro('athlete-1', { allowOnboardingPreview: true })).toBeNull();
  });

  it('closes the preview once the onboarding is complete', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE', onboardingCompletedAt: new Date() });
    expect((await requirePro('athlete-1', { allowOnboardingPreview: true }))?.status).toBe(403);
  });

  it('never opens the preview to a route that did not ask for it', async () => {
    findUniqueMock.mockResolvedValue({ tier: 'FREE', onboardingCompletedAt: null });
    expect((await requirePro('athlete-1'))?.status).toBe(403);
  });
});
