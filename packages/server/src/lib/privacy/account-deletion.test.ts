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

  it('still deletes everything when the address cannot be read', async () => {
    getUserMock.mockRejectedValue(new Error('clerk down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deleteAthleteAccount } = await import('./account-deletion');

    await deleteAthleteAccount('athlete-1', now);

    expect(deleteManyMock).toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('deletes everything now: mark, provider grants, credentials, identity, Coach traces, then rows', async () => {
    const { deleteAthleteAccount } = await import('./account-deletion');
    await expect(deleteAthleteAccount('athlete-1', now)).resolves.toEqual({
      athleteId: 'athlete-1',
      deletedAt: now,
    });

    expect(order).toEqual(['mark', 'revoke', 'credentials', 'identity', 'traces', 'rows', 'email']);
    expect(forgetCalendarIdsMock).toHaveBeenCalledWith('athlete-1');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'athlete-1' },
      data: { deletedAt: now },
      select: { id: true, clerkUserId: true },
    });
    // 5 providers cleared in transaction: garmin, strava, google, withings, renpho (MFP withdrawn)
    expect((transactionMock.mock.calls[0]?.[0] as unknown[]).length).toBe(5);
    expect(deleteUserMock).toHaveBeenCalledWith('user_1');
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: 'athlete-1' } });
  });

  it('still deletes the data when Langfuse is unreachable', async () => {
    deleteTracesMock.mockRejectedValue(new Error('langfuse down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deleteAthleteAccount } = await import('./account-deletion');

    await deleteAthleteAccount('athlete-1', now);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: 'athlete-1' } });
  });

  it('still deletes the data when Clerk is unreachable', async () => {
    deleteUserMock.mockRejectedValue(new Error('clerk down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deleteAthleteAccount } = await import('./account-deletion');

    await deleteAthleteAccount('athlete-1', now);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: 'athlete-1' } });
  });
});

describe('purgeSoftDeletedAthletes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteUserMock.mockResolvedValue({});
    deleteTracesMock.mockResolvedValue(0);
    deleteManyMock.mockResolvedValue({ count: 1 });
  });

  it('finishes every pending deletion now, including former 30-day soft-deletes', async () => {
    const now = new Date('2026-09-24T03:15:00.000Z');
    findManyMock.mockResolvedValue([
      { id: 'athlete-old', clerkUserId: 'user_old' },
      { id: 'athlete-new', clerkUserId: 'user_new' },
    ]);
    const { purgeSoftDeletedAthletes } = await import('./account-deletion');

    await expect(purgeSoftDeletedAthletes(now)).resolves.toEqual({
      purged: ['athlete-old', 'athlete-new'],
    });
    expect(findManyMock).toHaveBeenCalledWith({
      where: { deletedAt: { not: null, lte: now } },
      select: { id: true, clerkUserId: true },
    });
    expect(deleteUserMock).toHaveBeenCalledTimes(2);
    expect(deleteTracesMock).toHaveBeenCalledWith('athlete-old');
    expect(deleteManyMock).toHaveBeenCalledTimes(2);
  });
});
