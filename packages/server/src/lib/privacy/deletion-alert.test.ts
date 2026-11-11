import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTROLLER_EMAIL } from '@sharpit/app/lib/privacy/constants';

const sendEmail = vi.fn();
vi.mock('@sharpit/server/lib/email/transactional-email', () => ({
  sendTransactionalEmail: sendEmail,
}));

beforeEach(() => vi.clearAllMocks());

describe('reportDeletionFailures', () => {
  it('sends nothing when nothing failed', async () => {
    const { reportDeletionFailures } = await import('./deletion-alert');

    await reportDeletionFailures([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('names each athlete and step, and what to do once per kind of step', async () => {
    sendEmail.mockResolvedValue(true);
    const { reportDeletionFailures } = await import('./deletion-alert');

    await reportDeletionFailures([
      { athleteId: 'a1', step: 'clerk-identity' },
      { athleteId: 'a2', step: 'clerk-identity' },
      { athleteId: 'a2', step: 'provider-revocation', provider: 'strava' },
    ]);

    const [[email]] = sendEmail.mock.calls;
    expect(email.to).toBe(CONTROLLER_EMAIL);
    expect(email.subject).toContain('(3)');
    expect(email.text).toContain("- a1 : l'identité Clerk");
    expect(email.text).toContain('(strava)');
    expect(email.text.match(/Supprime l’utilisateur dans Clerk/g)).toHaveLength(1);
  });

  it('does not throw when the e-mail cannot go out', async () => {
    sendEmail.mockResolvedValue(false);
    const { reportDeletionFailures } = await import('./deletion-alert');

    await expect(
      reportDeletionFailures([{ athleteId: 'a1', step: 'coach-traces' }]),
    ).resolves.toBeUndefined();
  });
});
