/** Current Privacy Policy / Terms document version stamped on accept. */
export const CURRENT_PRIVACY_VERSION = 'v1-2026-10';

/**
 * Account deletion grace period before final hard purge (14 days).
 * The account is immediately deactivated and disconnected, but data is preserved
 * for 14 days allowing recovery in case of accidental or unauthorized deletion.
 */
export const PRIVACY_PURGE_DELAY_DAYS = 14;

/** French copy for blocked LLM / briefing paths (AI hard gate). */
export const AI_CONSENT_REQUIRED_MESSAGE =
  "Le traitement par IA n'est pas activé. Accepte le consentement IA dans Confidentialité pour utiliser le coach et les bilans générés.";

/** French copy when provider connect is blocked. */
export const PROVIDER_CONSENT_REQUIRED_MESSAGE =
  'Pour connecter une source, accepte d’abord le traitement des données de santé et l’avertissement sur les fournisseurs non officiels.';

/** French copy when legal accept is missing. */
export const LEGAL_CONSENT_REQUIRED_MESSAGE =
  'Accepte les Conditions d’utilisation, la Politique de confidentialité et le consentement données de santé pour continuer.';

export const CONTROLLER_NAME = 'Augustin Briolon';
export const CONTROLLER_EMAIL = 'augustin.briolon@gmail.com';
