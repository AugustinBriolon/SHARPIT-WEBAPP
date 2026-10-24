import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateMock = vi.fn();
const updateManyMock = vi.fn();
const transactionMock = vi.fn();
const findManyMock = vi.fn();
const deleteManyMock = vi.fn();
const deleteUserMock = vi.fn();
const getUserMock = vi.fn();
const findSubscriptionMock = vi.fn();
const sendEmailMock = vi.fn();
const order: string[] = [];

vi.mock('@sharpit/db/client', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
    athleteProfile: {
      update: (...args: unknown[]) => updateMock(...args),
      findMany: (...args: unknown[]) => findManyMock(...args),
      deleteMany: (...args: unknown[]) => deleteManyMock(...args),
    },
    garminAccount: { updateMany: (...args: unknown[]) => updateManyMock(...args) },
    stravaAccount: { updateMany: (...args: unknown[]) => updateManyMock(...args) },
    googleAccount: { updateMany: (...args: unknown[]) => updateManyMock(...args) },
    withingsAccount: { updateMany: (...args: unknown[]) => updateManyMock(...args) },
    renphoAccount: { updateMany: (...args: unknown[]) => updateManyMock(...args) },
    subscription: { findFirst: (...args: unknown[]) => findSubscriptionMock(...args) },
  },
}));

vi.mock('@sharpit/server/lib/email/transactional-email', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

const revokeAllMock = vi.fn();
vi.mock('@sharpit/server/lib/integrations/provider-revocation', () => ({
  revokeAllProviderAccess: (...args: unknown[]) => revokeAllMock(...args),
}));

const deleteTracesMock = vi.fn();
vi.mock('@sharpit/server/lib/ai/langfuse-erasure', () => ({
  deleteLangfuseTracesForAthlete: (...args: unknown[]) => deleteTracesMock(...args),
}));

const forgetCalendarIdsMock = vi.fn();
vi.mock('@sharpit/server/lib/integrations/google/calendar-ids-cache', () => ({
  forgetCalendarIds: (...args: unknown[]) => forgetCalendarIdsMock(...args),
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({ users: { deleteUser: deleteUserMock, getUser: getUserMock } })),
}));

describe('deleteAthleteAccount', () => {
  const now = new Date('2026-09-02T08:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    updateMock.mockImplementation(async () => {
      order.push('mark');
      return { id: 'athlete-1', clerkUserId: 'user_1' };
    });
    revokeAllMock.mockImplementation(async () => {
      order.push('revoke');
      return {};
    });
    transactionMock.mockImplementation(async () => {
      order.push('credentials');
      return [];
    });
    deleteUserMock.mockImplementation(async () => {
      order.push('identity');
      return {};
    });
    deleteTracesMock.mockImplementation(async () => {
      order.push('traces');
      return 0;
    });
    deleteManyMock.mockImplementation(async () => {
      order.push('rows');
      return { count: 1 };
    });
    getUserMock.mockResolvedValue({
      firstName: 'Zoé',
      primaryEmailAddress: { emailAddress: 'zoe@example.com' },
    });
    findSubscriptionMock.mockResolvedValue(null);
    sendEmailMock.mockImplementation(async () => {
      order.push('email');
      return true;
    });
  });

  it('confirms by e-mail once everything is gone, telling how to stop a renewing Apple subscription', async () => {
    findSubscriptionMock.mockResolvedValue({ source: 'apple' });
    const { deleteAthleteAccount } = await import('./account-deletion');

    await deleteAthleteAccount('athlete-1', now);

    expect(order.at(-1)).toBe('email');
    const [email] = sendEmailMock.mock.calls[0] as [{ to: string; text: string }];
    expect(email.to).toBe('zoe@example.com');
    expect(email.text).toContain('Abonnements');
  });

  it('still marks deleted and revokes when the address cannot be read', async () => {
    getUserMock.mockRejectedValue(new Error('clerk down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deleteAthleteAccount } = await import('./account-deletion');

    await deleteAthleteAccount('athlete-1', now);

    expect(updateMock).toHaveBeenCalled();
    expect(revokeAllMock).toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('soft-deletes: mark, revoke grants, clear credentials, and notify', async () => {
    const { deleteAthleteAccount } = await import('./account-deletion');
    await expect(deleteAthleteAccount('athlete-1', now)).resolves.toEqual({
      athleteId: 'athlete-1',
      deletedAt: now,
    });

    expect(order).toEqual(['mark', 'revoke', 'credentials', 'email']);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'athlete-1' },
      data: { deletedAt: now },
      select: { id: true, clerkUserId: true },
    });
    // 5 providers cleared in transaction: garmin, strava, google, withings, renpho
    expect((transactionMock.mock.calls[0]?.[0] as unknown[]).length).toBe(5);
    // Hard purge not called immediately during soft delete
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(deleteManyMock).not.toHaveBeenCalled();
  });

  it('restores a soft-deleted athlete by clearing deletedAt', async () => {
    const { restoreAthleteAccount } = await import('./account-deletion');
    await restoreAthleteAccount('athlete-1');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'athlete-1' },
      data: { deletedAt: null },
    });
  });
});

describe('purgeSoftDeletedAthletes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteUserMock.mockResolvedValue({});
    deleteTracesMock.mockResolvedValue(0);
    deleteManyMock.mockResolvedValue({ count: 1 });
  });

  it('purges athletes whose soft-deletion is older than the 14-day delay', async () => {
    const now = new Date('2026-09-24T03:15:00.000Z');
    const expectedCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    findManyMock.mockResolvedValue([
      { id: 'athlete-old', clerkUserId: 'user_old' },
      { id: 'athlete-new', clerkUserId: 'user_new' },
    ]);
    const { purgeSoftDeletedAthletes } = await import('./account-deletion');

    await expect(purgeSoftDeletedAthletes(now)).resolves.toEqual({
      purged: ['athlete-old', 'athlete-new'],
    });
    expect(findManyMock).toHaveBeenCalledWith({
      where: { deletedAt: { not: null, lte: expectedCutoff } },
      select: { id: true, clerkUserId: true },
    });
    expect(deleteUserMock).toHaveBeenCalledTimes(2);
    expect(deleteTracesMock).toHaveBeenCalledWith('athlete-old');
    expect(deleteManyMock).toHaveBeenCalledTimes(2);
  });
});
