import { type NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSignInTicket } from '@sharpit/app/lib/auth/sign-in-ticket';
import {
  NATIVE_OAUTH_HANDOFF_ORIGIN,
  type NativeOAuthProvider,
  nativeOAuthHandoffEntryUrl,
  nativeOAuthProviderLabel,
} from '@sharpit/app/lib/integrations/oauth-native-handoff';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Production always hands off on the apex; a local server hands off on itself. */
function handoffOrigin(request: NextRequest): string {
  return process.env.NODE_ENV === 'production'
    ? NATIVE_OAUTH_HANDOFF_ORIGIN
    : request.nextUrl.origin;
}

/**
 * The page the iOS app opens in an in-app authentication session to connect an OAuth
 * provider (Strava / Google / Withings). Same ticket posture as Garmin (ADR-047).
 */
export function createNativeOAuthHandoffPost(provider: NativeOAuthProvider) {
  return async function POST(request: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401, headers: NO_STORE });
    }

    try {
      const token = await createSignInTicket(userId);
      return NextResponse.json(
        {
          apiVersion: 1,
          url: nativeOAuthHandoffEntryUrl(handoffOrigin(request), token, provider),
        },
        { headers: NO_STORE },
      );
    } catch (error) {
      console.error(`[api/v1/${provider}/handoff]`, {
        name: error instanceof Error ? error.name : 'Error',
      });
      return NextResponse.json(
        {
          error: `Connexion ${nativeOAuthProviderLabel(provider)} indisponible pour le moment.`,
        },
        { status: 500, headers: NO_STORE },
      );
    }
  };
}
