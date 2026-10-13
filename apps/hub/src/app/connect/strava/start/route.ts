import { NextRequest, NextResponse } from 'next/server';
import {
  nativeOAuthApiConnectPath,
  nativeOAuthCallbackPath,
  nativeOAuthHandoffCallbackHref,
} from '@sharpit/app/lib/integrations/oauth-native-handoff';
import { serverApiFetch } from '@sharpit/ui/server/api-client';

const PROVIDER = 'strava' as const;

/**
 * Native Strava handoff — `api.` arms the OAuth state; this apex URL only follows it.
 * Every exit lands on the callback URL so the iOS session always closes with an outcome.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const returnTo = nativeOAuthCallbackPath(PROVIDER);
  try {
    const response = await serverApiFetch(
      `${nativeOAuthApiConnectPath(PROVIDER)}?returnTo=${encodeURIComponent(returnTo)}`,
      { headers: { Accept: 'application/json' }, origin },
    );
    const body = (await response.json().catch(() => null)) as { url?: string } | null;
    if (response.ok && body?.url) {
      return NextResponse.redirect(body.url);
    }
    console.error(`[connect/${PROVIDER}/start]`, { status: response.status });
  } catch (error) {
    console.error(`[connect/${PROVIDER}/start]`, {
      name: error instanceof Error ? error.name : 'Error',
    });
  }
  return NextResponse.redirect(new URL(nativeOAuthHandoffCallbackHref(PROVIDER, 'error'), origin));
}
