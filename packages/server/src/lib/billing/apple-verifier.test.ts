import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** An unsigned JWS, as Xcode's StoreKit configuration produces locally. */
function xcodeTransaction(overrides: Record<string, unknown> = {}) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = {
    transactionId: '0',
    originalTransactionId: '0',
    bundleId: 'app.sharpit.ios',
    productId: 'app.sharpit.pro.monthly',
    environment: 'Xcode',
    signedDate: Date.now(),
    ...overrides,
  };
  return `${encode({ alg: 'ES256' })}.${encode(payload)}.`;
}

describe('verifyAppleTransaction', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('decodes an Xcode StoreKit transaction on a dev server', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { verifyAppleTransaction } = await import('./apple-verifier');
    const transaction = await verifyAppleTransaction(xcodeTransaction());
    expect(transaction.productId).toBe('app.sharpit.pro.monthly');
    expect(transaction.environment).toBe('Xcode');
  });

  it('still checks the bundle id of an Xcode transaction', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { verifyAppleTransaction } = await import('./apple-verifier');
    await expect(
      verifyAppleTransaction(xcodeTransaction({ bundleId: 'com.other.app' })),
    ).rejects.toThrow();
  });

  it('refuses an Xcode transaction in a production build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APPLE_APP_APPLE_ID', '1234567890');
    const { verifyAppleTransaction } = await import('./apple-verifier');
    await expect(verifyAppleTransaction(xcodeTransaction())).rejects.toThrow();
  });
});
