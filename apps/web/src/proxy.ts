import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { afterAuthPath } from '@sharpit/app/lib/auth/after-auth-redirect';
import { describeClerkConfigIssues, diagnoseClerkConfig } from '@sharpit/app/lib/auth/clerk-config';
import { recoverFromHandshakeFailure } from '@sharpit/app/lib/auth/handshake-recovery';
import { isDevClerkBypass } from '@sharpit/app/lib/dev/dev-auth';

// Routes open without a Clerk session: the auth pages, the demo entry (which signs the
// visitor in to the shared demo account) and the icons browsers fetch without a cookie.
const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/icon(.*)',
  '/apple-icon(.*)',
  '/demo',
]);

const isAuthPage = createRouteMatcher(['/sign-in', '/sign-up']);

/**
 * A signed-in athlete never sees an empty sign-in: `/sign-in` and `/sign-up` go where Clerk
 * was sending them (`redirect_url`) — same-origin only — else `/start`. Server-side, so no
 * flash and no client/server ping-pong. A stranger anywhere else meets the sign-in page.
 */
function redirectSignedIn(req: NextRequest): NextResponse | null {
  if (req.method !== 'GET' || !isAuthPage(req)) {
    return null;
  }
  const destination = afterAuthPath(
    req.nextUrl.searchParams.get('redirect_url'),
    req.nextUrl.origin,
  );
  return NextResponse.redirect(new URL(destination, req.nextUrl.origin));
}

// Explicit so `auth.protect()` sends strangers to our pages (with `redirect_url` back to
// where they were — the Garmin handoff included), never to the hosted Account Portal.
const AUTH_ROUTES = { signInUrl: '/sign-in', signUpUrl: '/sign-up' };

const clerkProxy = clerkMiddleware(async (auth, req) => {
  if (isDevClerkBypass()) {
    return;
  }

  const { userId } = await auth();
  if (userId) {
    return redirectSignedIn(req);
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
}, AUTH_ROUTES);

// Printed once per server instance, by rule name only — never a key.
const clerkConfigIssues = describeClerkConfigIssues(diagnoseClerkConfig());
if (clerkConfigIssues.length > 0 && !isDevClerkBypass()) {
  console.error('[auth] Clerk configuration', clerkConfigIssues);
}

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  try {
    return await clerkProxy(req, event);
  } catch (error) {
    const recovered = recoverFromHandshakeFailure(req, error);
    if (recovered) {
      return recovered;
    }
    throw error;
  }
}

export const config = {
  matcher: [
    // Ignore les internes Next.js et les fichiers statiques (sauf si présents en query params)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Routes Frontend API spécifiques à Clerk
    '/__clerk/(.*)',
  ],
};
