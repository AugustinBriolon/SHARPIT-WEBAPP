import { CONTROLLER_EMAIL } from '@sharpit/app/lib/privacy/constants';
import { sendTransactionalEmail } from '@sharpit/server/lib/email/transactional-email';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

export type DeletionStep = 'clerk-identity' | 'coach-traces' | 'provider-revocation';

export type DeletionFailure = {
  athleteId: string;
  step: DeletionStep;
  /** Set for `provider-revocation`: which provider still holds SharpIt's access. */
  provider?: string;
};

const WHAT_HAPPENED: Record<DeletionStep, string> = {
  'clerk-identity': "l'identité Clerk n'a pas pu être supprimée",
  'coach-traces': 'les traces Langfuse n’ont pas pu être supprimées',
  'provider-revocation': "l'accès de SharpIt n'a pas pu être retiré chez le fournisseur",
};

const WHAT_TO_DO: Record<DeletionStep, string> = {
  'clerk-identity':
    'Supprime l’utilisateur dans Clerk. Le compte reste en attente en base et la purge quotidienne réessaie.',
  'coach-traces':
    'Supprime dans Langfuse les traces dont l’userId est cet identifiant. Si le compte est encore en base, la purge quotidienne réessaie.',
  'provider-revocation':
    'Retire l’accès de SharpIt dans les réglages du fournisseur : les jetons sont déjà effacés, rien ne réessaiera.',
};

function failureLine({ athleteId, step, provider }: DeletionFailure): string {
  return `- ${athleteId} : ${WHAT_HAPPENED[step]}${provider ? ` (${provider})` : ''}`;
}

export function deletionAlertText(failures: readonly DeletionFailure[]): string {
  const steps = [...new Set(failures.map((failure) => failure.step))];
  return [
    'Une suppression de compte ne s’est pas terminée correctement.',
    failures.map(failureLine).join('\n'),
    steps.map((step) => WHAT_TO_DO[step]).join('\n'),
    'Les détails techniques sont dans les logs Vercel (privacy/delete-*, integrations/revoke-*).',
  ].join('\n\n');
}

/**
 * Tells the controller that an account deletion left something behind. Best effort like every
 * e-mail here: when it cannot go out, the failure is still logged and the purge answers 500.
 */
export async function reportDeletionFailures(failures: readonly DeletionFailure[]): Promise<void> {
  if (failures.length === 0) {
    return;
  }
  const sent = await sendTransactionalEmail({
    to: CONTROLLER_EMAIL,
    subject: `SharpIt : suppression de compte à vérifier (${failures.length})`,
    text: deletionAlertText(failures),
  });
  if (!sent) {
    logSafeError('privacy/deletion-alert', new Error('alert e-mail not sent'), {
      failures: failures.length,
    });
  }
}
