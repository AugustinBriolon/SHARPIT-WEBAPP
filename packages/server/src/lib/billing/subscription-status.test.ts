import { describe, expect, it } from 'vitest';
import {
  appleAccessEndsAt,
  statusFromAppleNotification,
  statusFromAppleTransaction,
  subscriptionGrantsPro,
} from '@sharpit/server/lib/billing/subscription-status';

const now = new Date('2026-09-24T12:00:00.000Z');
const later = now.getTime() + 86_400_000;
const earlier = now.getTime() - 86_400_000;

describe('subscriptionGrantsPro', () => {
  it('grants Pro while active or in grace, until the end date', () => {
    expect(subscriptionGrantsPro('active', new Date(later), now)).toBe(true);
    expect(subscriptionGrantsPro('grace_period', new Date(later), now)).toBe(true);
    expect(subscriptionGrantsPro('active', null, now)).toBe(false);
    expect(subscriptionGrantsPro('grace_period', null, now)).toBe(false);
    expect(subscriptionGrantsPro('active', new Date(earlier), now)).toBe(false);
  });

  it('never grants Pro in billing retry, expired or revoked', () => {
    for (const status of ['billing_retry', 'expired', 'revoked'] as const) {
      expect(subscriptionGrantsPro(status, new Date(later), now)).toBe(false);
    }
  });
});

describe('statusFromAppleTransaction', () => {
  it('reads active, expired, billing retry, grace and revoked', () => {
    expect(statusFromAppleTransaction({ expiresDate: later }, null, now)).toBe('active');
    expect(statusFromAppleTransaction({ expiresDate: earlier }, null, now)).toBe('expired');
    expect(
      statusFromAppleTransaction({ expiresDate: earlier }, { isInBillingRetryPeriod: true }, now),
    ).toBe('billing_retry');
    expect(
      statusFromAppleTransaction(
        { expiresDate: earlier },
        { isInBillingRetryPeriod: true, gracePeriodExpiresDate: later },
        now,
      ),
    ).toBe('grace_period');
    expect(
      statusFromAppleTransaction({ expiresDate: later, revocationDate: earlier }, null, now),
    ).toBe('revoked');
  });
});

describe('statusFromAppleNotification', () => {
  it('maps Apple data.status', () => {
    expect(statusFromAppleNotification('DID_RENEW', 1)).toBe('active');
    expect(statusFromAppleNotification('EXPIRED', 2)).toBe('expired');
    expect(statusFromAppleNotification('DID_FAIL_TO_RENEW', 3)).toBe('billing_retry');
    expect(statusFromAppleNotification('DID_FAIL_TO_RENEW', 4)).toBe('grace_period');
    expect(statusFromAppleNotification('TEST', undefined)).toBeNull();
  });

  it('ends access on refund and revoke whatever the status says', () => {
    expect(statusFromAppleNotification('REFUND', 1)).toBe('revoked');
    expect(statusFromAppleNotification('REVOKE', 1)).toBe('revoked');
  });
});

describe('appleAccessEndsAt', () => {
  it('uses the grace period end while in grace', () => {
    expect(
      appleAccessEndsAt(
        'grace_period',
        { expiresDate: earlier },
        { gracePeriodExpiresDate: later },
      ),
    ).toEqual(new Date(later));
    expect(appleAccessEndsAt('active', { expiresDate: later }, null)).toEqual(new Date(later));
  });
});
