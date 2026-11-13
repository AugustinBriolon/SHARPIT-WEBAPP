import crypto from 'crypto';

/**
 * `SECRET_ENCRYPTION_KEY` is the only secret this module should ever use —
 * a dedicated value with no purpose but encrypting provider credentials and
 * blood test results (ADR-128) at rest. Production must configure the dedicated key explicitly, since
 * silently falling back to a secret rotated for an unrelated reason would
 * make every already-encrypted row unreadable without warning — so the
 * `CRON_SECRET`/`DATABASE_URL` convenience fallback below only ever applies
 * outside production, where `DATABASE_URL` is otherwise always set and would
 * defeat the production check entirely.
 */

/** AES-256-GCM framing: 12-byte IV + 16-byte auth tag (+ ciphertext). */
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const AES_GCM_MIN_BYTES = AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export type SecretDecryptReason = 'malformed' | 'authenticity';

/**
 * Decrypt failed. Callers MUST branch on `reason`:
 * - `malformed`: empty / short / non-base64 placeholder — not live credentials
 * - `authenticity`: framed ciphertext failed GCM auth (wrong key / corruption)
 *
 * Authenticity failures are fleet incidents when widespread — never wipe tokens.
 */
export class SecretDecryptError extends Error {
  readonly reason: SecretDecryptReason;

  constructor(
    reason: SecretDecryptReason,
    message = reason === 'malformed'
      ? 'Stored secret is empty or malformed'
      : 'Stored secret failed authenticity check',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'SecretDecryptError';
    this.reason = reason;
  }
}

export function isSecretDecryptFailure(error: unknown): error is SecretDecryptError {
  return error instanceof SecretDecryptError;
}

export function isSecretMalformedFailure(error: unknown): error is SecretDecryptError {
  return error instanceof SecretDecryptError && error.reason === 'malformed';
}

export function isSecretAuthenticityFailure(error: unknown): error is SecretDecryptError {
  return error instanceof SecretDecryptError && error.reason === 'authenticity';
}

/**
 * True when `encoded` is non-empty base64 that is long enough to hold an
 * AES-GCM IV + auth tag. Rejects empty revoke markers and short placeholders
 * (e.g. demo seed `"demo"`) that would otherwise pass a naive length check
 * and explode inside `decryptSecret` with Node's auth-tag error.
 */
export function isEncryptedSecret(encoded: unknown): encoded is string {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    return false;
  }
  if (encoded.length % 4 !== 0 || !BASE64_RE.test(encoded)) {
    return false;
  }
  return Buffer.from(encoded, 'base64').length >= AES_GCM_MIN_BYTES;
}

function encryptionKey(): Buffer {
  if (process.env.SECRET_ENCRYPTION_KEY) {
    return crypto.createHash('sha256').update(process.env.SECRET_ENCRYPTION_KEY).digest();
  }
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'SECRET_ENCRYPTION_KEY is not configured — refusing to encrypt/decrypt provider credentials with no key in production.',
    );
  }
  const devFallback = process.env.CRON_SECRET ?? process.env.DATABASE_URL ?? 'sharpit-dev-insecure';
  return crypto.createHash('sha256').update(devFallback).digest();
}

/** Chiffre une valeur sensible (ex. mot de passe Renpho) avant stockage en base. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(AES_GCM_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  if (!isEncryptedSecret(encoded)) {
    throw new SecretDecryptError(
      'malformed',
      'Stored secret is empty or too short to be AES-GCM ciphertext',
    );
  }

  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, AES_GCM_IV_BYTES);
  const tag = buf.subarray(AES_GCM_IV_BYTES, AES_GCM_MIN_BYTES);
  const encrypted = buf.subarray(AES_GCM_MIN_BYTES);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (error) {
    throw new SecretDecryptError(
      'authenticity',
      'Stored secret failed authenticity check (wrong key or corrupted ciphertext)',
      { cause: error },
    );
  }
}
