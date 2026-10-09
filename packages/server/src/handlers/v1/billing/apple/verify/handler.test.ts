import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));
const verifier = vi.hoisted(() => ({
  verifyAppleTransaction: vi.fn(),
  verifyAppleRenewalInfo: vi.fn(),
}));
vi.mock('@sharpit/server/lib/billing/apple-verifier', () => verifier);
const sync = vi.hoisted(() => {
  class AppleOwnershipError extends Error {}
  return { AppleOwnershipError, applyAppleTransaction: vi.fn() };
});
vi.mock('@sharpit/server/lib/billing/apple-sync', () => sync);
vi.mock('@sharpit/server/lib/billing/subscription-store', () => ({
  appAccountTokenFor: vi.fn().mockResolvedValue('token-a'),
  loadProState: vi.fn().mockResolvedValue({ tier: 'PRO', subscription: null }),
}));

const post = (body: unknown) =>
  new NextRequest('https://sharpit.app/api/v1/billing/apple/verify', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('POST /api/v1/billing/apple/verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('requires a signed transaction', async () => {
    const { POST } = await import('./handler');
    expect((await POST(post({}))).status).toBe(400);
  });

  it('refuses a transaction whose signature does not verify', async () => {
    verifier.verifyAppleTransaction.mockRejectedValue(new Error('bad chain'));
    const { POST } = await import('./handler');
    expect((await POST(post({ signedTransaction: 'x.y.z' }))).status).toBe(400);
    expect(sync.applyAppleTransaction).not.toHaveBeenCalled();
  });

  it('refuses a purchase that belongs to another account', async () => {
    verifier.verifyAppleTransaction.mockResolvedValue({ originalTransactionId: '1' });
    sync.applyAppleTransaction.mockRejectedValue(new sync.AppleOwnershipError('autre compte'));
    const { POST } = await import('./handler');
    expect((await POST(post({ signedTransaction: 'x.y.z' }))).status).toBe(409);
  });

  it('stores a verified purchase and answers with the Pro page', async () => {
    verifier.verifyAppleTransaction.mockResolvedValue({ originalTransactionId: '1' });
    verifier.verifyAppleRenewalInfo.mockResolvedValue({ autoRenewStatus: 1 });
    sync.applyAppleTransaction.mockResolvedValue('PRO');
    const { POST } = await import('./handler');

    const response = await POST(post({ signedTransaction: 'a.b.c', signedRenewalInfo: 'd.e.f' }));
    expect(response.status).toBe(200);
    expect(sync.applyAppleTransaction).toHaveBeenCalledWith({
      athleteId: 'athlete-1',
      athleteAppAccountToken: 'token-a',
      requireAppAccountToken: true,
      transaction: { originalTransactionId: '1' },
      renewal: { autoRenewStatus: 1 },
    });
    const body = await response.json();
    expect(body.tier).toBe('PRO');
    expect(body.perks.length).toBeGreaterThan(0);
  });
});
