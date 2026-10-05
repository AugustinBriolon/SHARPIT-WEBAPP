import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Sender, overridable per environment (`EMAIL_FROM`); the domain must be verified at Resend. A real
 * mailbox rather than a « noreply »: an athlete's reply reaches the team, and spam filters trust a
 * sender that can be answered.
 */
const DEFAULT_FROM = 'SharpIt <contact@sharpit.app>';

/**
 * Sends one transactional e-mail through Resend's HTTP API. Best effort by design: it never
 * throws, and without `RESEND_API_KEY` it sends nothing — an e-mail must never block the action
 * it reports on. Returns whether Resend accepted it.
 */
export async function sendTransactionalEmail(email: TransactionalEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: [email.to],
        subject: email.subject,
        text: email.text,
      }),
    });
    if (!response.ok) {
      logSafeError('email/send', new Error(`Resend answered ${response.status}`));
      return false;
    }
    return true;
  } catch (error) {
    logSafeError('email/send', error);
    return false;
  }
}
