/**
 * Provider connection checks and auth-failure utilities.
 *
 * Each `is*Connected` guard checks that required credential fields are present
 * and decrypt to live secrets (Garmin, like the OAuth providers). Same meaning
 * for the Settings integrations hub and `/api/cron/sync`.
 */

import {
  decryptSecret,
  isEncryptedSecret,
  isSecretAuthenticityFailure,
  isSecretDecryptFailure,
  isSecretMalformedFailure,
} from '@sharpit/server/lib/secret-box';
import { isSet } from '@sharpit/shared/value';

// ---------------------------------------------------------------------------
// Auth error
// ---------------------------------------------------------------------------

export class ProviderAuthError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProviderAuthError';
  }
}

export function isProviderAuthFailure(error: unknown): error is ProviderAuthError {
  return error instanceof ProviderAuthError;
}

/**
 * True provider-side auth expiry. Safe to wipe local credentials and prompt
 * reconnect. Does NOT include AES-GCM authenticity failures (wrong key) —
 * those are fleet incidents and must never mass-revoke.
 */
export function isCredentialFailure(error: unknown): boolean {
  return isProviderAuthFailure(error);
}

/** Soft skip path for cron: provider auth OR any decrypt failure (no hard spam). */
export function isCredentialSoftFailure(error: unknown): boolean {
  return isProviderAuthFailure(error) || isSecretDecryptFailure(error);
}

export function isDecryptAuthenticitySoftFailure(error: unknown): boolean {
  return isSecretAuthenticityFailure(error);
}

export function isDecryptMalformedSoftFailure(error: unknown): boolean {
  return isSecretMalformedFailure(error);
}

// ---------------------------------------------------------------------------
// Per-provider connection predicates
// ---------------------------------------------------------------------------

type MaybeAccount = Record<string, unknown> | null | undefined;

/**
 * The columns each predicate reads, as Prisma selects.
 *
 * They live beside the predicates because a caller that selects less than the
 * check needs gets `undefined`, and `undefined != null` is false — so the account
 * reads as disconnected with no error anywhere. Every provider was reported
 * disconnected for exactly that reason, which silently disabled provider sync
 * across the whole app.
 *
 * Spread these rather than listing columns by hand, and the two cannot drift.
 */
export const OAUTH_CONNECTION_SELECT = { accessTokenEnc: true, refreshTokenEnc: true } as const;
export const GARMIN_CONNECTION_SELECT = OAUTH_CONNECTION_SELECT;
export const RENPHO_CONNECTION_SELECT = { email: true, passwordEnc: true } as const;
export const MFP_CONNECTION_SELECT = { sessionTokenEnc: true } as const;

/**
 * Live credentials for hub + cron: framed AES-GCM that decrypts to a non-empty
 * secret. Authenticity failures (wrong fleet key) still count as connected so
 * cron can hit the decrypt circuit breaker instead of silently skipping.
 */
function isLiveEncryptedSecret(encoded: unknown): boolean {
  if (!isEncryptedSecret(encoded)) {
    return false;
  }
  try {
    return decryptSecret(encoded).length > 0;
  } catch (error) {
    return isSecretAuthenticityFailure(error);
  }
}

export function isOAuthAccountConnected(account: MaybeAccount): boolean {
  if (!account) {
    return false;
  }
  return (
    isLiveEncryptedSecret(account.accessTokenEnc) && isLiveEncryptedSecret(account.refreshTokenEnc)
  );
}

/** Garmin is an OAuth provider like the others (ADR-105). */
export function isGarminAccountConnected(account: MaybeAccount): boolean {
  if (!account) {
    return false;
  }
  return isOAuthAccountConnected(account);
}

export function isRenphoAccountConnected(account: MaybeAccount): boolean {
  if (!account) {
    return false;
  }
  return isSet(account.email) && isLiveEncryptedSecret(account.passwordEnc);
}

export function isMfpAccountConnected(account: MaybeAccount): boolean {
  if (!account) {
    return false;
  }
  return isLiveEncryptedSecret(account.sessionTokenEnc);
}

// ---------------------------------------------------------------------------
// Reconnect helpers
// ---------------------------------------------------------------------------

export const INTEGRATIONS_RECONNECT_HREF = '/settings/integrations';

interface ProviderAccounts {
  strava: MaybeAccount;
  garmin: MaybeAccount;
  withings: MaybeAccount;
  renpho: MaybeAccount;
  google: MaybeAccount;
}

const RECONNECT_CHECKS: Array<{
  accountKey: keyof ProviderAccounts;
  label: string;
  isConnected: (account: MaybeAccount) => boolean;
}> = [
  { accountKey: 'strava', label: 'Strava', isConnected: isOAuthAccountConnected },
  { accountKey: 'garmin', label: 'Garmin', isConnected: isGarminAccountConnected },
  { accountKey: 'withings', label: 'Withings', isConnected: isOAuthAccountConnected },
  { accountKey: 'renpho', label: 'Renpho', isConnected: isRenphoAccountConnected },
  { accountKey: 'google', label: 'Google', isConnected: isOAuthAccountConnected },
];

/**
 * Returns names of providers that have an account row but whose credentials are
 * no longer valid (need reconnection).
 */
export function reconnectProviderNames(accounts: ProviderAccounts): string[] {
  return RECONNECT_CHECKS.filter(({ accountKey, isConnected }) => {
    const account = accounts[accountKey];
    return account && !isConnected(account);
  }).map(({ label }) => label);
}

export function reconnectProductMessage(names: string[]): string | null {
  if (names.length === 0) {
    return null;
  }
  const joined = names.join(', ');
  return names.length === 1
    ? `La connexion ${joined} a expiré. Reconnecte-la dans les paramètres.`
    : `Les connexions ${joined} ont expiré. Reconnecte-les dans les paramètres.`;
}
