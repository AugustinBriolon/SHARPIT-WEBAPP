import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';
import {
  apiHostError,
  isSelfAuthenticatedPath,
  screenApiHostRequest,
  sealApiHostResponse,
} from '@sharpit/app/lib/hosts/api-host';
import {
  DEMO_READ_ONLY_ERROR,
  isDemoBlockedRequest,
  isDemoClerkUser,
} from '@sharpit/app/lib/demo/demo-identity';
import {
  checkRateLimit,
  rateLimiters,
  rateLimitResponseBody,
} from '@sharpit/server/lib/rate-limit';

/** Flooding backstop for every authenticated API call — generous, per athlete. */
export async function rateLimitApiUser(
  userId: string,
  pathname: string,
): Promise<NextResponse | null> {
  if (!pathname.startsWith('/api/')) {
    return null;
  }
  const result = await checkRateLimit(rateLimiters.apiGeneral, userId);
  if (result.ok) {
    return null;
  }
  return NextResponse.json(rateLimitResponseBody(result.retryAfterSeconds), { status: 429 });
}

// Bearer only: no page, no sign-in redirect, no handshake — a missing or rejected token is a
// 401 JSON, never Clerk's 404 rewrite.
const bearerProxy = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  if (!userId) {
    return apiHostError(req, 401, 'Invalid or expired token');
  }
  if (isDemoBlockedRequest(req.method, req.nextUrl.pathname) && (await isDemoClerkUser(userId))) {
    return NextResponse.json({ error: DEMO_READ_ONLY_ERROR }, { status: 403 });
  }
  return rateLimitApiUser(userId, req.nextUrl.pathname);
});

function asNextResponse(response: Response): NextResponse {
  return response instanceof NextResponse ? response : new NextResponse(response.body, response);
}

/**
 * The `api.` contract as a proxy (ADR-048): JSON only, Bearer only, no cookie, no cached
 * authenticated answer, CORS for Sharpit's web pages only. `apps/api` runs it on every request.
 *
 * Crons carry `Bearer <CRON_SECRET>`, which is not a Clerk token, and OAuth callbacks and App
 * Store notifications carry none: they skip Clerk and their route authenticates the caller
 * (cron secret, signed `state`, signed payload) and refuses everything it cannot verify.
 *
 * The local dev bypass (`DEV_BYPASS_CLERK`, development only) has no Clerk session to send:
 * it skips the Bearer and Clerk, and `getCurrentAthleteId` resolves the local athlete.
 */
export async function apiProxy(req: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
  const devBypass = isDevClerkBypass();
  const screened = screenApiHostRequest(req, { requireBearer: !devBypass });
  if (screened) {
    return screened;
  }
  if (devBypass || isSelfAuthenticatedPath(req.nextUrl.pathname)) {
    return sealApiHostResponse(req, NextResponse.next());
  }
  const response = (await bearerProxy(req, event)) ?? NextResponse.next();
  return sealApiHostResponse(req, asNextResponse(response));
}
