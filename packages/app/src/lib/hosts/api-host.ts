import { type NextRequest, NextResponse } from 'next/server';

/**
 * `api.sharpit.app` is the JSON + Bearer host of the split (web. = thin UI, apex = AASA,
 * `/connect/*`, landing). These guards keep `api.` to its contract: JSON only, Clerk Bearer
 * only, no cookies, no HTML, CORS for Sharpit's own web pages only.
 */
export const API_HOST = 'api.sharpit.app';

/** The thin web — the browser origin `api.` is built for. */
export const API_ALLOWED_ORIGIN = 'https://web.sharpit.app';

/**
 * Browser origins allowed to call `api.` — never `*`. The apex stays listed while the web
 * project still serves signed-in pages there (the Garmin handoff, ADR-048 phase 3); the
 * local web app only in development.
 */
const PRODUCTION_ORIGINS = [API_ALLOWED_ORIGIN, 'https://sharpit.app'];
const DEVELOPMENT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

export function apiAllowedOrigins(): readonly string[] {
  return process.env.NODE_ENV === 'development'
    ? [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS]
    : PRODUCTION_ORIGINS;
}

/** Vercel cron invocations, authenticated by `CRON_SECRET` in their route, never by Clerk. */
const CRON_PATH = /^\/api\/cron\/[a-z-]+$/;

/**
 * Called by a third party that carries no Bearer, and authenticated in the route itself: an
 * OAuth provider sending the browser back (signed `state`), Apple's server notifications
 * (signed payload).
 */
const PUBLIC_PATHS = [
  /^\/api\/(strava|withings|google)\/callback$/,
  /^\/api\/billing\/apple\/notifications$/,
];

/** What `api.` serves: route handlers under `/api/` — never a page. */
const API_HOST_PATH = /^\/api\//;

export function isCronPath(pathname: string): boolean {
  return CRON_PATH.test(pathname);
}

/** No Bearer expected: the route authenticates the caller itself (crons included). */
export function isSelfAuthenticatedPath(pathname: string): boolean {
  return isCronPath(pathname) || PUBLIC_PATHS.some((pattern) => pattern.test(pathname));
}

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type';

export function isApiHostRequest(req: NextRequest): boolean {
  return req.nextUrl.hostname === API_HOST;
}

export function isApiHostPath(pathname: string): boolean {
  return API_HOST_PATH.test(pathname);
}

export function hasBearer(req: NextRequest): boolean {
  return /^Bearer\s+\S+/i.test(req.headers.get('authorization') ?? '');
}

function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get('origin');
  return origin && apiAllowedOrigins().includes(origin) ? origin : null;
}

/**
 * Applied to every `api.` response the proxy produces or lets through: never stores an
 * authenticated answer, never sets a cookie, and names the one browser origin allowed.
 */
export function sealApiHostResponse(req: NextRequest, response: NextResponse): NextResponse {
  response.headers.delete('set-cookie');
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Origin, Authorization');
  const origin = allowedOrigin(req);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  } else {
    response.headers.delete('Access-Control-Allow-Origin');
  }
  return response;
}

export function apiHostError(
  req: NextRequest,
  status: 401 | 403 | 404,
  error: string,
): NextResponse {
  return sealApiHostResponse(req, NextResponse.json({ error }, { status }));
}

/** CORS preflight: answered here, never forwarded to a route. */
export function apiHostPreflight(req: NextRequest): NextResponse {
  if (!allowedOrigin(req)) {
    return apiHostError(req, 403, 'Origin not allowed');
  }
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  response.headers.set('Access-Control-Max-Age', '600');
  return sealApiHostResponse(req, response);
}

/**
 * Everything that can be answered before Clerk runs: pages, preflights and requests with no
 * Bearer at all (except the public callbacks). Null means "let it through to authentication".
 * `requireBearer: false` is the local dev bypass only (`isDevClerkBypass`), where no token exists.
 */
export function screenApiHostRequest(
  req: NextRequest,
  { requireBearer = true }: { requireBearer?: boolean } = {},
): NextResponse | null {
  if (!isApiHostPath(req.nextUrl.pathname)) {
    return apiHostError(req, 404, 'Not found');
  }
  if (req.method === 'OPTIONS') {
    return apiHostPreflight(req);
  }
  if (PUBLIC_PATHS.some((pattern) => pattern.test(req.nextUrl.pathname))) {
    return null;
  }
  if (requireBearer && !hasBearer(req)) {
    return apiHostError(req, 401, 'Bearer token required');
  }
  return null;
}
