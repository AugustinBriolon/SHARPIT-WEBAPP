import 'server-only';

import type {
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';
import type { SubscriptionStatus } from '@prisma/client';
import {
  appleAccessEndsAt,
  statusFromAppleNotification,
  statusFromAppleTransaction,
} from '@sharpit/server/lib/billing/subscription-status';
import {
  athleteIdForAppAccountToken,
  findAppleSubscription,
  upsertAppleSubscription,
} from '@sharpit/server/lib/billing/subscription-store';

export class AppleOwnershipError extends Error {}

type AppleTransactionInput = {
  athleteId: string;
  athleteAppAccountToken: string | null;
  transaction: JWSTransactionDecodedPayload;
  renewal: JWSRenewalInfoDecodedPayload | null;
  statusOverride?: SubscriptionStatus | null;
  now?: Date;
  /**
   * Verify (StoreKit → app → our API): the purchase must carry `appAccountToken`.
   * Notifications keep the opposite posture — unknown owner → ignore via
   * `athleteForAppleTransaction`, so this stays false there.
   */
  requireAppAccountToken?: boolean;
};

/** Refuses a purchase that is not this athlete's; returns the row already stored, if any. */
async function assertOwnership(input: AppleTransactionInput, originalTransactionId: string) {
  const token = input.transaction.appAccountToken;
  if (input.requireAppAccountToken && !token) {
    throw new AppleOwnershipError('Transaction Apple sans appAccountToken');
  }
  if (token && input.athleteAppAccountToken && token !== input.athleteAppAccountToken) {
    throw new AppleOwnershipError('Cet achat appartient à un autre compte');
  }
  const existing = await findAppleSubscription(originalTransactionId);
  if (existing && existing.athleteId !== input.athleteId) {
    throw new AppleOwnershipError('Cet abonnement est déjà lié à un autre compte');
  }
  return existing;
}

function willRenewFrom(
  renewal: JWSRenewalInfoDecodedPayload | null,
  existing: { willRenew: boolean } | null,
  status: SubscriptionStatus,
): boolean {
  if (renewal) {
    return renewal.autoRenewStatus === 1;
  }
  return existing?.willRenew ?? status === 'active';
}

/**
 * Stores what a verified Apple transaction says and re-derives the tier. The purchase
 * must belong to this athlete: its `appAccountToken` (set by the app at purchase) must be
 * theirs, and an original transaction already tied to another account stays there.
 */
export async function applyAppleTransaction(input: AppleTransactionInput) {
  const { athleteId, transaction, renewal } = input;
  const { originalTransactionId, productId } = transaction;
  if (!originalTransactionId || !productId) {
    throw new AppleOwnershipError('Transaction Apple incomplète');
  }
  const existing = await assertOwnership(input, originalTransactionId);
  const status =
    input.statusOverride ??
    statusFromAppleTransaction(transaction, renewal, input.now ?? new Date());
  return upsertAppleSubscription({
    athleteId,
    originalTransactionId,
    productId,
    status,
    expiresAt: appleAccessEndsAt(status, transaction, renewal),
    willRenew: willRenewFrom(renewal, existing, status),
    environment: transaction.environment ?? null,
    appAccountToken: transaction.appAccountToken ?? null,
  });
}

/**
 * Who a notification is about: the account its `appAccountToken` names, else the
 * account already holding that original transaction. Null = not ours to act on.
 */
export async function athleteForAppleTransaction(
  transaction: JWSTransactionDecodedPayload,
): Promise<{ athleteId: string; appAccountToken: string | null } | null> {
  if (transaction.appAccountToken) {
    const athleteId = await athleteIdForAppAccountToken(transaction.appAccountToken);
    if (athleteId) {
      return { athleteId, appAccountToken: transaction.appAccountToken };
    }
  }
  if (!transaction.originalTransactionId) {
    return null;
  }
  const existing = await findAppleSubscription(transaction.originalTransactionId);
  return existing
    ? { athleteId: existing.athleteId, appAccountToken: existing.appAccountToken }
    : null;
}

export { statusFromAppleNotification };
