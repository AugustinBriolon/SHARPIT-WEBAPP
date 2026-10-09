import type { SubscriptionStatus } from '@prisma/client';

/** Only these statuses grant SharpIt Pro. Billing retry without grace does not. */
export function subscriptionGrantsPro(
  status: SubscriptionStatus,
  expiresAt: Date | null,
  now: Date,
) {
  if (status !== 'active' && status !== 'grace_period') {
    return false;
  }
  // Active/grace without an end date must not grant Pro forever — Apple's renewals
  // and grace always carry an expiry; a null `expiresAt` is incomplete, not infinite.
  return expiresAt !== null && expiresAt.getTime() > now.getTime();
}

/** What a verified Apple transaction (plus its renewal info, when sent) says right now. */
function inGracePeriod(renewal: { gracePeriodExpiresDate?: number } | null, nowMs: number) {
  return (renewal?.gracePeriodExpiresDate ?? 0) > nowMs;
}

export function statusFromAppleTransaction(
  transaction: { expiresDate?: number; revocationDate?: number },
  renewal: { isInBillingRetryPeriod?: boolean; gracePeriodExpiresDate?: number } | null,
  now: Date,
): SubscriptionStatus {
  const nowMs = now.getTime();
  if (transaction.revocationDate) {
    return 'revoked';
  }
  if (inGracePeriod(renewal, nowMs)) {
    return 'grace_period';
  }
  if ((transaction.expiresDate ?? Number.POSITIVE_INFINITY) > nowMs) {
    return 'active';
  }
  return renewal?.isInBillingRetryPeriod ? 'billing_retry' : 'expired';
}

/**
 * App Store Server Notifications V2 carry the subscription's status in `data.status`
 * (1 active, 2 expired, 3 billing retry, 4 billing grace period, 5 revoked). A refund
 * or a revoke ends access whatever the status says.
 */
export function statusFromAppleNotification(
  notificationType: string | undefined,
  dataStatus: number | undefined,
): SubscriptionStatus | null {
  if (notificationType === 'REFUND' || notificationType === 'REVOKE') {
    return 'revoked';
  }
  switch (dataStatus) {
    case 1:
      return 'active';
    case 2:
      return 'expired';
    case 3:
      return 'billing_retry';
    case 4:
      return 'grace_period';
    case 5:
      return 'revoked';
    default:
      return null;
  }
}

/** When access ends: the grace period's end while in grace, else the transaction's. */
export function appleAccessEndsAt(
  status: SubscriptionStatus,
  transaction: { expiresDate?: number },
  renewal: { gracePeriodExpiresDate?: number } | null,
): Date | null {
  if (status === 'grace_period' && renewal?.gracePeriodExpiresDate) {
    return new Date(renewal.gracePeriodExpiresDate);
  }
  return transaction.expiresDate ? new Date(transaction.expiresDate) : null;
}
