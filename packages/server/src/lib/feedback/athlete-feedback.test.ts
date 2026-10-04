import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn().mockResolvedValue({ id: 'f1' });
const sendTransactionalEmail = vi.fn().mockResolvedValue(true);

vi.mock('@sharpit/db/client', () => ({ prisma: { athleteFeedback: { create } } }));
vi.mock('@sharpit/server/lib/email/transactional-email', () => ({ sendTransactionalEmail }));

const { athleteFeedbackSchema, recordAthleteFeedback } = await import('./athlete-feedback');

describe('athlete feedback', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('keeps the note, then mails it by athlete id only', async () => {
    vi.stubEnv('FEEDBACK_EMAIL', 'team@example.com');
    const input = { message: 'Le plan est top', context: 'settings', appVersion: '1.0 (42)' };

    expect(await recordAthleteFeedback('a1', input)).toEqual({ id: 'f1' });

    expect(create).toHaveBeenCalledWith({
      data: { athleteId: 'a1', ...input },
      select: { id: true },
    });
    expect(sendTransactionalEmail).toHaveBeenCalledWith({
      to: 'team@example.com',
      subject: 'Avis SharpIt · settings',
      text: 'Le plan est top\n\n— athlète a1, app 1.0 (42)',
    });
  });

  it('keeps the note without a mail when no address is set', async () => {
    vi.stubEnv('FEEDBACK_EMAIL', '');
    await recordAthleteFeedback('a1', { message: 'Bug sur Plan' });
    expect(create).toHaveBeenCalled();
    expect(sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it('refuses an empty or endless note', () => {
    expect(athleteFeedbackSchema.safeParse({ message: '   ' }).success).toBe(false);
    expect(athleteFeedbackSchema.safeParse({ message: 'x'.repeat(2001) }).success).toBe(false);
    expect(athleteFeedbackSchema.parse({ message: '  Merci  ' }).message).toBe('Merci');
  });
});
