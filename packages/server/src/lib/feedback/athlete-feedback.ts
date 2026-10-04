import { z } from 'zod';
import { prisma } from '@sharpit/db/client';
import { sendTransactionalEmail } from '@sharpit/server/lib/email/transactional-email';

export const athleteFeedbackSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  context: z.string().trim().max(40).optional(),
  appVersion: z.string().trim().max(40).optional(),
});

export type AthleteFeedbackInput = z.infer<typeof athleteFeedbackSchema>;

/**
 * Keeps what the athlete wrote through « Donner un avis », then sends it to `FEEDBACK_EMAIL`
 * when set — the row is the record, the e-mail only a heads-up, so a mail that fails loses
 * nothing. The mail names the athlete by id only.
 */
export async function recordAthleteFeedback(athleteId: string, input: AthleteFeedbackInput) {
  const saved = await prisma.athleteFeedback.create({
    data: { athleteId, ...input },
    select: { id: true },
  });
  const to = process.env.FEEDBACK_EMAIL;
  if (to) {
    await sendTransactionalEmail({ to, ...feedbackEmail(athleteId, input) });
  }
  return saved;
}

export function feedbackEmail(
  athleteId: string,
  input: AthleteFeedbackInput,
): { subject: string; text: string } {
  const signature = [`athlète ${athleteId}`, input.appVersion && `app ${input.appVersion}`]
    .filter(Boolean)
    .join(', ');
  return {
    subject: input.context ? `Avis SharpIt · ${input.context}` : 'Avis SharpIt',
    text: `${input.message}\n\n— ${signature}`,
  };
}
