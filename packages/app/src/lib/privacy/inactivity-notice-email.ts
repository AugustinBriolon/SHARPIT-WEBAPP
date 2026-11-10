import {
  INACTIVE_ACCOUNT_MONTHS,
  INACTIVE_ACCOUNT_NOTICE_DAYS,
} from '@sharpit/app/lib/privacy/constants';

/** The e-mail warning that an unused account is about to be deleted, and how to keep it. */
export function inactivityNoticeEmail({ firstName }: { firstName: string | null }) {
  const greeting = firstName?.trim() ? `Bonjour ${firstName.trim()},` : 'Bonjour,';
  const paragraphs = [
    greeting,
    `Tu ne t'es pas connecté à SharpIt depuis près de ${INACTIVE_ACCOUNT_MONTHS} mois. Pour ne pas conserver tes données de santé et d'entraînement sans raison, nous supprimons les comptes inactifs.`,
    `Sans connexion de ta part dans les ${INACTIVE_ACCOUNT_NOTICE_DAYS} jours, ton compte sera désactivé puis supprimé définitivement avec toutes ses données (activités, séances, plan, journal, profil et échanges avec le coach).`,
    "Pour le garder, il te suffit d'ouvrir l'application ou de te connecter sur sharpit.app : rien d'autre à faire.",
    "L'équipe SharpIt",
  ];
  return {
    subject: 'Ton compte SharpIt inactif sera bientôt supprimé',
    text: paragraphs.join('\n\n'),
  };
}
