import { afterEach, describe, expect, it } from 'vitest';
import { encryptSecret } from '@sharpit/server/lib/secret-box';
import {
  MFP_CONNECTION_SELECT,
  OAUTH_CONNECTION_SELECT,
  RENPHO_CONNECTION_SELECT,
  isMfpAccountConnected,
  isOAuthAccountConnected,
  isRenphoAccountConnected,
} from './connection-status';

/**
 * The trap these guard against: a caller selects fewer columns than the predicate
 * reads, the missing one is `undefined`, `undefined != null` is false, and the
 * account reports disconnected with no error raised anywhere. That happened to
 * every provider at once and silently disabled sync across the app.
 */
const CASES = [
  {
    name: 'oauth',
    select: OAUTH_CONNECTION_SELECT,
    check: isOAuthAccountConnected,
    fillValid: (row: Record<string, unknown>) => {
      row.accessTokenEnc = encryptSecret('access');
      row.refreshTokenEnc = encryptSecret('refresh');
    },
  },
  {
    name: 'renpho',
    select: RENPHO_CONNECTION_SELECT,
    check: isRenphoAccountConnected,
    fillValid: (row: Record<string, unknown>) => {
      row.email = 'athlete@example.com';
      row.passwordEnc = encryptSecret('password');
    },
  },
  {
    name: 'mfp',
    select: MFP_CONNECTION_SELECT,
    check: isMfpAccountConnected,
    fillValid: (row: Record<string, unknown>) => {
      row.sessionTokenEnc = encryptSecret('session-cookie');
    },
  },
] as const;

function emptyRow(select: Record<string, true>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(select).map((key) => [key, undefined]));
}

function rowFrom(select: Record<string, true>, value: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.keys(select).map((key) => [key, value]));
}

const ORIGINAL_KEY = process.env.SECRET_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.SECRET_ENCRYPTION_KEY;
  } else {
    process.env.SECRET_ENCRYPTION_KEY = ORIGINAL_KEY;
  }
});

describe.each(CASES)('$name connection select', ({ select, check, fillValid }) => {
  it('carries every column its predicate reads', () => {
    process.env.SECRET_ENCRYPTION_KEY = 'connection-status-test-key';
    const row = emptyRow(select);
    fillValid(row);
    expect(check(row)).toBe(true);
  });

  it('reports disconnected when any one of them is missing', () => {
    process.env.SECRET_ENCRYPTION_KEY = 'connection-status-test-key';
    const keys = Object.keys(select);
    for (const omitted of keys) {
      const partial = emptyRow(select);
      fillValid(partial);
      delete partial[omitted];
      expect(check(partial), `missing ${omitted} must not read as connected`).toBe(false);
    }
  });

  it('reports disconnected on a null credential, not just an absent one', () => {
    expect(check(rowFrom(select, null))).toBe(false);
  });

  it('reports disconnected without an account at all', () => {
    expect(check(null)).toBe(false);
    expect(check(undefined)).toBe(false);
  });

  it('reports disconnected for short placeholder ciphertext (e.g. demo)', () => {
    expect(check(rowFrom(select, 'demo'))).toBe(false);
    expect(check(rowFrom(select, 'x'))).toBe(false);
  });
});

describe('isMfpAccountConnected (hub + cron agreement)', () => {
  it('is disconnected with no row', () => {
    expect(isMfpAccountConnected(null)).toBe(false);
  });

  it('is disconnected for revoked empty enc', () => {
    expect(isMfpAccountConnected({ sessionTokenEnc: '' })).toBe(false);
  });

  it('is disconnected for malformed/demo blobs', () => {
    expect(isMfpAccountConnected({ sessionTokenEnc: 'demo' })).toBe(false);
  });

  it('is connected for a live encrypted session cookie', () => {
    process.env.SECRET_ENCRYPTION_KEY = 'connection-status-test-key';
    expect(isMfpAccountConnected({ sessionTokenEnc: encryptSecret('session-cookie') })).toBe(true);
  });
});
