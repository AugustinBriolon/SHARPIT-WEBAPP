/**
 * The e-mail confirming an account deletion. When a subscription still renews, it says how to
 * stop it: deleting the account cannot cancel an App Store subscription — only the athlete can.
 */
export type AccountDeletedEmailInput = {
  firstName: string | null;
  /** Where a still-renewing subscription is billed, or null when none renews. */
  renewingSubscription: 'apple' | 'stripe' | 'manual' | null;
};

const CANCEL_STEPS: Record<'apple' | 'stripe' | 'manual', string> = {
  apple:
    "Ton abonnement SharpIt Pro est facturé par Apple et continue de se renouveler : supprimer ton compte ne peut pas l'arrêter. Pour l'annuler : Réglages de l'iPhone › ton nom › Abonnements › SharpIt.",
  stripe:
    "Ton abonnement SharpIt Pro continue de se renouveler. Réponds à cet e-mail et nous l'annulons pour toi.",
  manual: "Ton accès SharpIt Pro offert prend fin avec ton compte : tu n'as rien à faire.",
};

export function accountDeletedEmail({ firstName, renewingSubscription }: AccountDeletedEmailInput) {
  const greeting = firstName?.trim() ? `Bonjour ${firstName.trim()},` : 'Bonjour,';
  const paragraphs = [
    greeting,
    'Ton compte SharpIt a été désactivé et est programmé pour une suppression définitive dans 14 jours. Passé ce délai, toutes tes données (activités, séances, plan, journal, profil et échanges avec le coach) seront effacées de manière irréversible.',
    'Par mesure de précaution, les accès accordés à Strava, Withings et à tes autres sources connectées ont été immédiatement révoqués.',
    ...(renewingSubscription ? [CANCEL_STEPS[renewingSubscription]] : []),
    "Si tu n'es pas à l'origine de cette demande ou si tu souhaites annuler cette suppression, réponds simplement à cet e-mail ou reconnecte-toi à l'application dans les 14 jours pour réactiver ton compte et retrouver l'intégralité de tes données.",
    "L'équipe SharpIt",
  ];
  return {
    subject: 'Suppression programmée de ton compte SharpIt',
    text: paragraphs.join('\n\n'),
  };
}
