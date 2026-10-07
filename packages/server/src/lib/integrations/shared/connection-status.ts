/**
 * Provider connection checks and auth-failure utilities.
 *
 * Each `is*Connected` guard checks that required credential fields are present
 * and decrypt to live secrets (Garmin: oauth1/oauth2 token JSON). Same meaning
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
export const GARMIN_CONNECTION_SELECT = { oauth1TokenEnc: true, oauth2TokenEnc: true } as const;
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

function looksLikeGarminOauth1(value: unknown): value is { oauth_token: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { oauth_token?: unknown }).oauth_token === 'string' &&
    (value as { oauth_token: string }).oauth_token.length > 0
  );
}

function looksLikeGarminOauth2(value: unknown): value is { access_token: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { access_token?: unknown }).access_token === 'string' &&
    (value as { access_token: string }).access_token.length > 0
  );
}

function isGarminTokenPairConnected(oauth1Enc: unknown, oauth2Enc: unknown): boolean {
  if (!isEncryptedSecret(oauth1Enc) || !isEncryptedSecret(oauth2Enc)) {
    return false;
  }
  try {
    const oauth1: unknown = JSON.parse(decryptSecret(oauth1Enc));
    const oauth2: unknown = JSON.parse(decryptSecret(oauth2Enc));
    return looksLikeGarminOauth1(oauth1) && looksLikeGarminOauth2(oauth2);
  } catch (error) {
    // Wrong-key / GCM auth: preserve "connected" so cron still attempts decrypt
    // and the fleet circuit breaker can trip. Malformed JSON / empty leftovers → disconnected.
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

/**
 * Garmin DI (#54) and legacy Garth tokens share `oauth1TokenEnc` / `oauth2TokenEnc`.
 * Connected = both columns hold decryptable token JSON the Settings hub would treat
 * as live — not revoked empties, demo placeholders, or ciphertext junk.
 */
export function isGarminAccountConnected(account: MaybeAccount): boolean {
  if (!account) {
    return false;
  }
  return isGarminTokenPairConnected(account.oauth1TokenEnc, account.oauth2TokenEnc);
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
