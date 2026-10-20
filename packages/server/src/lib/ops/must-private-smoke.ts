import { APPLE_TEAM_ID_PLACEHOLDER } from '@sharpit/app/lib/apple-app-site-association';
import {
  nativeOAuthCallbackPath,
  nativeOAuthHandoffCallbackHref,
  nativeOAuthStartPath,
} from '@sharpit/app/lib/integrations/oauth-native-handoff';

/**
 * Live smoke for the private "Must": the Garmin Safari + universal-link handoff on a
 * given origin, plus an authenticated Today read. Checks only look at status, a few
 * headers and the body — a result never carries the Bearer or any response header value
 * beyond what it names, so the report is safe to print.
 */

export type SmokeResponse = { status: number; headers: Headers; body: string };

export type SmokeCheck = {
  name: string;
  path: string;
  method?: 'GET' | 'OPTIONS';
  headers?: Record<string, string>;
  /** Sent with the smoke Bearer; skipped when none is configured. */
  authenticated?: boolean;
  /** Returns why the response fails the check, or null when it passes. */
  verify: (response: SmokeResponse, origin: string) => string | null;
};

export type SmokeResult = { name: string; outcome: 'pass' | 'fail' | 'skipped'; reason?: string };

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const DOCUMENT_REQUEST = { Accept: 'text/html', 'Sec-Fetch-Dest': 'document' };

export function expectStatus(response: SmokeResponse, status: number): string | null {
  return response.status === status ? null : `expected ${status}, got ${response.status}`;
}

export function expectContentType(response: SmokeResponse, type: string): string | null {
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.startsWith(type) ? null : `expected ${type}, got "${contentType}"`;
}

function verifyAppleAppSiteAssociation(response: SmokeResponse): string | null {
  const mismatch = expectStatus(response, 200) ?? expectContentType(response, 'application/json');
  if (mismatch) {
    return mismatch;
  }
  if (!response.body.includes(`${nativeOAuthCallbackPath('strava')}*`)) {
    return 'Strava callback path missing from applinks';
  }
  return response.body.includes(APPLE_TEAM_ID_PLACEHOLDER) ? 'APPLE_TEAM_ID not set' : null;
}

function verifySignInRedirect(response: SmokeResponse, origin: string): string | null {
  const mismatch = expectStatus(response, 307);
  if (mismatch) {
    return mismatch;
  }
  const location = new URL(response.headers.get('location') ?? '', origin);
  if (location.origin !== origin || location.pathname !== '/sign-in') {
    return 'expected a same-origin redirect to /sign-in';
  }
  const back = location.searchParams.get('redirect_url') ?? '';
  return back === `${origin}${nativeOAuthStartPath('strava')}`
    ? null
    : 'redirect_url does not come back';
}

function verifyHtmlPage(response: SmokeResponse): string | null {
  return expectStatus(response, 200) ?? expectContentType(response, 'text/html');
}

function verifyJson(response: SmokeResponse): string | null {
  return expectStatus(response, 200) ?? expectContentType(response, 'application/json');
}

export function mustPrivateChecks(trainingDayId: string): SmokeCheck[] {
  return [
    {
      name: 'AASA served as JSON, without redirect, for the Strava callback',
      path: '/.well-known/apple-app-site-association',
      verify: verifyAppleAppSiteAssociation,
    },
    {
      name: 'Strava handoff entry sends strangers to sign-in and back',
      path: nativeOAuthStartPath('strava'),
      headers: DOCUMENT_REQUEST,
      verify: verifySignInRedirect,
    },
    {
      name: 'Strava handoff callback renders without a session',
      path: nativeOAuthHandoffCallbackHref('strava', 'connected'),
      headers: DOCUMENT_REQUEST,
      verify: verifyHtmlPage,
    },
    {
      name: 'Today reads with a Clerk Bearer',
      path: `/api/v1/today?trainingDayId=${trainingDayId}`,
      authenticated: true,
      verify: verifyJson,
    },
  ];
}

async function runCheck(
  origin: string,
  check: SmokeCheck,
  bearer: string,
  fetcher: Fetcher,
): Promise<SmokeResult> {
  const headers = check.authenticated
    ? { ...check.headers, Authorization: `Bearer ${bearer}` }
    : { ...check.headers };
  try {
    const response = await fetcher(`${origin}${check.path}`, {
      method: check.method ?? 'GET',
      headers,
      redirect: 'manual',
    });
    const reason = check.verify(
      { status: response.status, headers: response.headers, body: await response.text() },
      origin,
    );
    if (!reason) {
      return { name: check.name, outcome: 'pass' };
    }
    // Clerk names why it refused a Bearer (e.g. token-expired) — the only way to tell an
    // expired token from a misconfigured instance, and it never carries the token.
    const clerkReason = response.headers.get('x-clerk-auth-reason');
    const detail = clerkReason ? `${reason} (clerk: ${clerkReason})` : reason;
    return { name: check.name, outcome: 'fail', reason: detail };
  } catch {
    return { name: check.name, outcome: 'fail', reason: 'network error' };
  }
}

export type SmokeOptions = { bearer?: string; fetcher?: Fetcher };

/** Runs every check in order; authenticated ones are skipped when no Bearer is given. */
export async function runSmokeChecks(
  origin: string,
  checks: SmokeCheck[],
  options: SmokeOptions,
): Promise<SmokeResult[]> {
  const fetcher = options.fetcher ?? fetch;
  const results: SmokeResult[] = [];
  for (const check of checks) {
    if (check.authenticated && !options.bearer) {
      results.push({ name: check.name, outcome: 'skipped', reason: 'SHARPIT_SMOKE_BEARER unset' });
      continue;
    }
    results.push(await runCheck(origin, check, options.bearer ?? '', fetcher));
  }
  return results;
}

export function runMustPrivateSmoke(
  origin: string,
  options: SmokeOptions & { trainingDayId: string },
): Promise<SmokeResult[]> {
  return runSmokeChecks(origin, mustPrivateChecks(options.trainingDayId), options);
}
