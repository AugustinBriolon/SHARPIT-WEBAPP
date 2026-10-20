import {
  NATIVE_OAUTH_PROVIDERS,
  nativeOAuthCallbackPath,
} from '@sharpit/app/lib/integrations/oauth-native-handoff';
import type { DataClassId } from '@sharpit/app/lib/integrations/provider-catalog';
import { DATA_CLASSES } from '@sharpit/app/lib/integrations/provider-catalog';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_ALLOWED_ORIGIN, API_HOST, apiAllowedOrigins } from '@sharpit/app/lib/hosts/api-host';

export const DEFAULT_INTEGRATION_RETURN_PATH = '/settings/integrations';

const ALLOWED_RETURN_PATHS = new Set([
  '/onboarding',
  '/settings/integrations',
  '/settings',
  // Native Strava / Google / Withings handoff.
  ...NATIVE_OAUTH_PROVIDERS.map(nativeOAuthCallbackPath),
]);
const DATA_CLASS_IDS = new Set<string>(DATA_CLASSES.map((c) => c.id));

export function sanitizeDataClass(raw: string | null | undefined): DataClassId | null {
  if (!raw || !DATA_CLASS_IDS.has(raw)) {
    return null;
  }
  return raw as DataClassId;
}

/**
 * OAuth providers reject bind addresses like `0.0.0.0` as redirect_uri.
 * Map them to localhost while preserving scheme + port.
 */
export function normalizeOAuthPublicOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
      url.hostname = 'localhost';
    }
    return url.origin;
  } catch {
    return origin;
  }
}

/** Sanitize a returnTo query value to an allow-listed in-app path. */
export function sanitizeIntegrationReturnTo(raw: string | null | undefined): string {
  if (!raw) {
    return DEFAULT_INTEGRATION_RETURN_PATH;
  }
  try {
    const path = raw.startsWith('http') ? new URL(raw).pathname : raw.split('?')[0];
    if (ALLOWED_RETURN_PATHS.has(path)) {
      return path;
    }
  } catch {
    // ignore
  }
  return DEFAULT_INTEGRATION_RETURN_PATH;
}

function hostHeaderHostname(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end >= 0 ? host.slice(1, end) : host;
  }
  return host.split(':')[0] ?? '';
}

/**
 * Bounce only when the *browser* asked for the bind address (Host header).
 * Do not use `nextUrl.hostname` — with `next dev -H 0.0.0.0` it stays `0.0.0.0`
 * even when the athlete opened `localhost`, which caused an infinite redirect.
 */
export function redirectIfBindHost(request: NextRequest): NextResponse | null {
  const hostName = hostHeaderHostname(request);
  if (hostName !== '0.0.0.0' && hostName !== '::') {
    return null;
  }
  const url = request.nextUrl.clone();
  url.hostname = 'localhost';
  return NextResponse.redirect(url);
}

/** Public origin for OAuth: prefer Host header, then fall back to request URL. */
export function publicOriginFromRequest(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (request.nextUrl.protocol === 'https:' ? 'https' : 'http');
  if (host) {
    return normalizeOAuthPublicOrigin(`${proto}://${host}`);
  }
  return normalizeOAuthPublicOrigin(request.nextUrl.origin);
}

/**
 * The Sharpit web origin a connect started from, where the athlete lands afterwards: the
 * calling page's origin when it is one `api.` allows (a cross-origin call from the web), else
 * this request's own origin — except on `api.` itself, which serves no page (a provider
 * callback), where it is the thin web.
 */
export function webOriginFor(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin && apiAllowedOrigins().includes(origin)) {
    return origin;
  }
  const own = publicOriginFromRequest(request);
  return new URL(own).hostname === API_HOST ? API_ALLOWED_ORIGIN : own;
}

/**
 * Where a connect sends the browser next. A web page calling `api.` asks for JSON — a
 * cross-origin fetch cannot follow the redirect — and navigates itself; a plain navigation
 * gets the redirect.
 */
export function connectNavigation(request: NextRequest, url: string | URL): NextResponse {
  if (request.headers.get('accept')?.includes('application/json')) {
    return NextResponse.json({ url: String(url) });
  }
  return NextResponse.redirect(url);
}
