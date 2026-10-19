import 'server-only';

import {
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import { APPLE_ROOT_CERTIFICATES_BASE64 } from '@sharpit/server/lib/billing/apple-root-certificates';

/** SHARPIT-APP's bundle id (see its project.pbxproj). */
const DEFAULT_BUNDLE_ID = 'app.sharpit.ios';

const verifiers = new Map<Environment, SignedDataVerifier>();

function appAppleId(): number | undefined {
  const raw = process.env.APPLE_APP_APPLE_ID?.trim();
  const id = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function verifierFor(environment: Environment): SignedDataVerifier {
  const cached = verifiers.get(environment);
  if (cached) {
    return cached;
  }
  const production = environment === Environment.PRODUCTION;
  const appleId = appAppleId();
  if (production && appleId === undefined) {
    // Apple requires the app's numeric id to verify production data.
    throw new Error('APPLE_APP_APPLE_ID is not set');
  }
  const verifier = new SignedDataVerifier(
    APPLE_ROOT_CERTIFICATES_BASE64.map((cert) => Buffer.from(cert, 'base64')),
    // Online revocation checks: network calls to Apple's OCSP — production only.
    production,
    environment,
    process.env.APPLE_IAP_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID,
    production ? appleId : undefined,
  );
  verifiers.set(environment, verifier);
  return verifier;
}

/**
 * Xcode's StoreKit configuration signs transactions locally, so Apple's library skips the
 * signature for them. Honoured only by a dev server (`next dev`, vitest), never by a build.
 */
function acceptsXcodeTransactions() {
  return process.env.NODE_ENV !== 'production';
}

/**
 * The environment the JWS claims, read before verification only to pick the verifier —
 * which then checks the signature *and* that the environment matches. TestFlight and
 * App Review purchases are Sandbox and must be honoured too.
 */
function claimedEnvironment(jws: string, pick: (payload: Record<string, unknown>) => unknown) {
  try {
    const [, body] = jws.split('.');
    const payload = JSON.parse(Buffer.from(body ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const claimed = pick(payload);
    if (claimed === Environment.XCODE && acceptsXcodeTransactions()) {
      return Environment.XCODE;
    }
    return claimed === Environment.SANDBOX ? Environment.SANDBOX : Environment.PRODUCTION;
  } catch {
    return Environment.PRODUCTION;
  }
}

export function verifyAppleTransaction(signed: string): Promise<JWSTransactionDecodedPayload> {
  const env = claimedEnvironment(signed, (p) => p.environment);
  return verifierFor(env).verifyAndDecodeTransaction(signed);
}

export function verifyAppleRenewalInfo(signed: string): Promise<JWSRenewalInfoDecodedPayload> {
  const env = claimedEnvironment(signed, (p) => p.environment);
  return verifierFor(env).verifyAndDecodeRenewalInfo(signed);
}

export function verifyAppleNotification(signed: string): Promise<ResponseBodyV2DecodedPayload> {
  const env = claimedEnvironment(signed, (p) => (p.data as { environment?: unknown })?.environment);
  return verifierFor(env).verifyAndDecodeNotification(signed);
}
