import { ticketSignInUrl } from '@sharpit/app/lib/auth/ticket-sign-in-url';

/**
 * OAuth providers the iPhone app connects through an apex ASWebAuthenticationSession
 * (same shape as Garmin ADR-040/047): ticket sign-in → `/connect/<provider>/start` →
 * provider authorize → `api.` callback → `/connect/<provider>/callback?<provider>=<status>`.
 */
export const NATIVE_OAUTH_PROVIDERS = ['strava', 'google', 'withings'] as const;

export type NativeOAuthProvider = (typeof NATIVE_OAUTH_PROVIDERS)[number];

export function isNativeOAuthProvider(value: string): value is NativeOAuthProvider {
  return (NATIVE_OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** Apex origin whose AASA declares the callback paths the iOS session waits for. */
export const NATIVE_OAUTH_HANDOFF_ORIGIN = 'https://sharpit.app';

export function nativeOAuthStartPath(provider: NativeOAuthProvider): string {
  return `/connect/${provider}/start`;
}

export function nativeOAuthCallbackPath(provider: NativeOAuthProvider): string {
  return `/connect/${provider}/callback`;
}

/** `api.` connect path for this provider. */
export function nativeOAuthApiConnectPath(provider: NativeOAuthProvider): string {
  return `/api/${provider}/connect`;
}

/**
 * The page an in-app authentication session opens: redeem the Clerk ticket, then start
 * the provider connect. The URL is a credential — never log it.
 */
export function nativeOAuthHandoffEntryUrl(
  origin: string,
  signInTicket: string,
  provider: NativeOAuthProvider,
): string {
  return ticketSignInUrl(origin, signInTicket, nativeOAuthStartPath(provider));
}

export type NativeOAuthHandoffStatus =
  | 'connected'
  | 'already_connected'
  | 'cancelled'
  | 'denied'
  | 'invalid_state'
  | 'consent_required'
  | 'no_refresh'
  | 'no_athlete'
  | 'error';

const STATUS_SET = new Set<string>([
  'connected',
  'already_connected',
  'cancelled',
  'denied',
  'invalid_state',
  'consent_required',
  'no_refresh',
  'no_athlete',
  'error',
]);

export function parseNativeOAuthHandoffStatus(
  raw: string | null | undefined,
): NativeOAuthHandoffStatus {
  return raw && STATUS_SET.has(raw) ? (raw as NativeOAuthHandoffStatus) : 'error';
}

export function nativeOAuthHandoffCallbackHref(
  provider: NativeOAuthProvider,
  status: NativeOAuthHandoffStatus,
): string {
  return `${nativeOAuthCallbackPath(provider)}?${provider}=${status}`;
}

export type NativeOAuthHandoffCopy = {
  title: string;
  description: string;
  canRetry: boolean;
  tone: 'done' | 'neutral' | 'risk';
};

const PROVIDER_LABEL: Record<NativeOAuthProvider, string> = {
  strava: 'Strava',
  google: 'Google Agenda',
  withings: 'Withings',
};

export function nativeOAuthProviderLabel(provider: NativeOAuthProvider): string {
  return PROVIDER_LABEL[provider];
}

export function nativeOAuthHandoffCopy(
  provider: NativeOAuthProvider,
  status: NativeOAuthHandoffStatus,
): NativeOAuthHandoffCopy {
  const name = PROVIDER_LABEL[provider];
  switch (status) {
    case 'connected':
      return {
        title: `${name} connecté`,
        description:
          'Tu peux revenir dans l’app. Tes données arriveront à la prochaine synchronisation.',
        canRetry: false,
        tone: 'done',
      };
    case 'already_connected':
      return {
        title: `${name} est déjà connecté`,
        description: 'Rien à faire ici — tu peux revenir dans l’app.',
        canRetry: false,
        tone: 'done',
      };
    case 'cancelled':
      return {
        title: 'Connexion annulée',
        description: 'Aucune donnée n’a été partagée. Tu peux revenir dans l’app.',
        canRetry: true,
        tone: 'neutral',
      };
    case 'consent_required':
      return {
        title: 'Autorisation requise',
        description: `Autorise ${name} dans Compte → Confidentialité, puis relance la connexion.`,
        canRetry: true,
        tone: 'risk',
      };
    case 'invalid_state':
      return {
        title: 'Session expirée',
        description: 'La connexion a pris trop de temps. Relance-la pour obtenir un nouveau lien.',
        canRetry: true,
        tone: 'risk',
      };
    case 'denied':
      return {
        title: 'Connexion refusée',
        description: `${name} n’a pas confirmé l’autorisation. Réessaie.`,
        canRetry: true,
        tone: 'risk',
      };
    case 'no_refresh':
      return {
        title: 'Autorisation incomplète',
        description: `${name} n’a pas renvoyé de jeton durable. Relance la connexion et accepte tous les droits.`,
        canRetry: true,
        tone: 'risk',
      };
    case 'no_athlete':
      return {
        title: 'Profil manquant',
        description: `${name} n’a pas renvoyé ton profil. Réessaie dans un instant.`,
        canRetry: true,
        tone: 'risk',
      };
    case 'error':
      return {
        title: 'Connexion impossible',
        description: `${name} n’a pas pu être relié à ton compte. Réessaie dans un instant.`,
        canRetry: true,
        tone: 'risk',
      };
  }
}
