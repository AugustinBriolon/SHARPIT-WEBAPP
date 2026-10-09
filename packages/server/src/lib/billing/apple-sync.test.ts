import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const store = vi.hoisted(() => ({
  findAppleSubscription: vi.fn(),
  upsertAppleSubscription: vi.fn(),
  athleteIdForAppAccountToken: vi.fn(),
}));
vi.mock('@sharpit/server/lib/billing/subscription-store', () => store);

const now = new Date('2026-09-24T12:00:00.000Z');
const transaction = {
  originalTransactionId: '1000',
  productId: 'app.sharpit.pro.monthly',
  expiresDate: now.getTime() + 30 * 86_400_000,
  appAccountToken: 'token-a',
  environment: 'Sandbox',
};

describe('applyAppleTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.findAppleSubscription.mockResolvedValue(null);
    store.upsertAppleSubscription.mockResolvedValue('PRO');
  });

  it('stores the subscription for its owner and derives the tier', async () => {
    const { applyAppleTransaction } = await import('./apple-sync');
    await expect(
      applyAppleTransaction({
        athleteId: 'athlete-1',
        athleteAppAccountToken: 'token-a',
        transaction,
        renewal: { autoRenewStatus: 1 },
        now,
      }),
    ).resolves.toBe('PRO');
    expect(store.upsertAppleSubscription).toHaveBeenCalledWith({
      athleteId: 'athlete-1',
      originalTransactionId: '1000',
      productId: 'app.sharpit.pro.monthly',
      status: 'active',
      expiresAt: new Date(transaction.expiresDate),
      willRenew: true,
      environment: 'Sandbox',
      appAccountToken: 'token-a',
    });
  });

  it('refuses a purchase made for another account', async () => {
    const { applyAppleTransaction, AppleOwnershipError } = await import('./apple-sync');
    await expect(
      applyAppleTransaction({
        athleteId: 'athlete-1',
        athleteAppAccountToken: 'token-b',
        transaction,
        renewal: null,
        now,
      }),
    ).rejects.toBeInstanceOf(AppleOwnershipError);
  });

  it('rejects a verify-path purchase with no appAccountToken', async () => {
    const { applyAppleTransaction, AppleOwnershipError } = await import('./apple-sync');
    const { appAccountToken: _omit, ...withoutToken } = transaction;
    await expect(
      applyAppleTransaction({
        athleteId: 'athlete-1',
        athleteAppAccountToken: 'token-a',
        transaction: withoutToken,
        renewal: null,
        now,
        requireAppAccountToken: true,
      }),
    ).rejects.toBeInstanceOf(AppleOwnershipError);
    expect(store.upsertAppleSubscription).not.toHaveBeenCalled();
  });

  it('keeps an original transaction on the account that holds it', async () => {
    store.findAppleSubscription.mockResolvedValue({ athleteId: 'athlete-2' });
    const { applyAppleTransaction, AppleOwnershipError } = await import('./apple-sync');
    await expect(
      applyAppleTransaction({
        athleteId: 'athlete-1',
        athleteAppAccountToken: 'token-a',
        transaction,
        renewal: null,
        now,
      }),
    ).rejects.toBeInstanceOf(AppleOwnershipError);
  });

  it('lets a notification status win over the transaction dates', async () => {
    const { applyAppleTransaction } = await import('./apple-sync');
    await applyAppleTransaction({
      athleteId: 'athlete-1',
      athleteAppAccountToken: 'token-a',
      transaction,
      renewal: null,
      statusOverride: 'revoked',
      now,
    });
    expect(store.upsertAppleSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'revoked' }),
    );
  });

  it('finds the owner of a notification by token, then by original transaction', async () => {
    const { athleteForAppleTransaction } = await import('./apple-sync');
    store.athleteIdForAppAccountToken.mockResolvedValue('athlete-1');
    await expect(athleteForAppleTransaction(transaction)).resolves.toEqual({
      athleteId: 'athlete-1',
      appAccountToken: 'token-a',
    });

    store.athleteIdForAppAccountToken.mockResolvedValue(null);
    store.findAppleSubscription.mockResolvedValue({
      athleteId: 'athlete-3',
      appAccountToken: null,
    });
    await expect(athleteForAppleTransaction(transaction)).resolves.toEqual({
      athleteId: 'athlete-3',
      appAccountToken: null,
    });
  });
});
