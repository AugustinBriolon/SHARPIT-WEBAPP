import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
const update = vi.fn();
const getUser = vi.fn();
const sendEmail = vi.fn();
const deleteAccount = vi.fn();

vi.mock('@sharpit/db/client', () => ({ prisma: { athleteProfile: { findMany, update } } }));
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: () => Promise.resolve({ users: { getUser } }),
}));
vi.mock('@sharpit/server/lib/email/transactional-email', () => ({
  sendTransactionalEmail: sendEmail,
}));
vi.mock('@sharpit/server/lib/privacy/account-deletion', () => ({
  deleteAthleteAccount: deleteAccount,
}));

const now = new Date('2026-11-10T03:15:00Z');
const candidate = (inactivityNoticeSentAt: Date | null = null) => ({
  id: 'a1',
  clerkUserId: 'user_1',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  inactivityNoticeSentAt,
});
const clerkUser = (lastActiveAt: string | null) => ({
  lastActiveAt: lastActiveAt ? new Date(lastActiveAt).getTime() : null,
  lastSignInAt: null,
  firstName: 'Sam',
  primaryEmailAddress: { emailAddress: 'sam@example.test' },
});

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue(true);
});

describe('inactivityStep', () => {
  it('notifies 30 days before the 24-month mark, not earlier', async () => {
    const { inactivityStep } = await import('./inactive-accounts');
    const step = (lastActiveAt: string) =>
      inactivityStep({ lastActiveAt: new Date(lastActiveAt), noticeSentAt: null, now });

    expect(step('2024-12-11T00:00:00Z')).toBe('none');
    expect(step('2024-12-09T00:00:00Z')).toBe('notify');
  });

  it('deletes only after 30 days of silence, and a return cancels the notice', async () => {
    const { inactivityStep } = await import('./inactive-accounts');
    const lastActiveAt = new Date('2024-11-01T00:00:00Z');

    expect(
      inactivityStep({ lastActiveAt, noticeSentAt: new Date('2026-10-20T00:00:00Z'), now }),
    ).toBe('none');
    expect(
      inactivityStep({ lastActiveAt, noticeSentAt: new Date('2026-10-10T00:00:00Z'), now }),
    ).toBe('delete');
    expect(
      inactivityStep({
        lastActiveAt: new Date('2026-10-15T00:00:00Z'),
        noticeSentAt: new Date('2026-10-10T00:00:00Z'),
        now,
      }),
    ).toBe('clear');
  });
});

describe('processInactiveAccounts', () => {
  it('records the notice only when the e-mail was accepted', async () => {
    findMany.mockResolvedValue([candidate()]);
    getUser.mockResolvedValue(clerkUser('2024-06-01T00:00:00Z'));
    sendEmail.mockResolvedValue(false);
    const { processInactiveAccounts } = await import('./inactive-accounts');

    expect(await processInactiveAccounts(now)).toEqual({ notified: [], deleted: [] });
    expect(update).not.toHaveBeenCalled();

    sendEmail.mockResolvedValue(true);
    expect(await processInactiveAccounts(now)).toEqual({ notified: ['a1'], deleted: [] });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { inactivityNoticeSentAt: now },
    });
  });

  it('deletes through the regular account deletion once the notice period has passed', async () => {
    findMany.mockResolvedValue([candidate(new Date('2026-10-01T00:00:00Z'))]);
    getUser.mockResolvedValue(clerkUser('2024-06-01T00:00:00Z'));
    const { processInactiveAccounts } = await import('./inactive-accounts');

    expect(await processInactiveAccounts(now)).toEqual({ notified: [], deleted: ['a1'] });
    expect(deleteAccount).toHaveBeenCalledWith('a1', now);
  });

  it('touches nothing when Clerk cannot be read', async () => {
    findMany.mockResolvedValue([candidate(new Date('2026-10-01T00:00:00Z'))]);
    getUser.mockRejectedValue(new Error('clerk down'));
    const { processInactiveAccounts } = await import('./inactive-accounts');

    expect(await processInactiveAccounts(now)).toEqual({ notified: [], deleted: [] });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('leaves out the demo account and accounts with a renewing subscription', async () => {
    findMany.mockResolvedValue([]);
    const { processInactiveAccounts } = await import('./inactive-accounts');
    await processInactiveAccounts(now);

    const [[{ where }]] = findMany.mock.calls;
    expect(where.clerkUserId).toEqual({ not: 'demo' });
    expect(where.subscriptions.none.willRenew).toBe(true);
  });
});
