import { NextRequest } from 'next/server';
import {
  publicOriginFromRequest,
  redirectAfterIntegrationConnect,
} from '@sharpit/server/lib/integrations/oauth-return';
import {
  connectStateMatchesSession,
  readConnectState,
} from '@sharpit/server/lib/integrations/oauth-state';
import {
  exchangeGarminCode,
  getGarminRedirectUri,
} from '@sharpit/server/lib/integrations/garmin/garmin-oauth';
import { connectGarminAccount } from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

/**
 * Arrives with no session (ADR-048): the signed `state` names the athlete, and the PKCE
 * verifier is derived from that same state (garmin-oauth). Garmin has no history on the
 * Starter tier, so there is no initial import: data arrives by push from now on.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const rawState = searchParams.get('state');
  const state = readConnectState(rawState, 'garmin');

  if (searchParams.get('error')) {
    return redirectAfterIntegrationConnect(request, state, 'garmin', 'denied');
  }
  if (!code || !rawState || !state || !(await connectStateMatchesSession(state))) {
    return redirectAfterIntegrationConnect(request, state, 'garmin', 'invalid_state');
  }

  try {
    const redirectUri = state.redirectUri ?? getGarminRedirectUri(publicOriginFromRequest(request));
    const token = await exchangeGarminCode(code, rawState, redirectUri);
    const outcome = await connectGarminAccount(state.athleteId, token);
    return redirectAfterIntegrationConnect(
      request,
      state,
      'garmin',
      outcome === 'taken' ? 'error' : 'connected',
    );
  } catch (error) {
    logSafeError('api/garmin/callback', error);
    return redirectAfterIntegrationConnect(request, state, 'garmin', 'error');
  }
}
