import { NextRequest } from 'next/server';
import { prisma } from '@sharpit/db/client';
import {
  publicOriginFromRequest,
  redirectAfterIntegrationConnect,
} from '@sharpit/server/lib/integrations/oauth-return';
import {
  connectStateMatchesSession,
  type ConnectState,
  readConnectState,
} from '@sharpit/server/lib/integrations/oauth-state';
import {
  exchangeWithingsCode,
  getWithingsRedirectUri,
} from '@sharpit/server/lib/integrations/withings/withings';
import { syncWithingsHealth } from '@sharpit/server/lib/integrations/withings/withings-sync';
import { encryptSecret } from '@sharpit/server/lib/secret-box';

function readOAuthParams(searchParams: URLSearchParams) {
  return {
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error'),
  };
}

async function persistWithingsAccount(
  athleteId: string,
  token: Awaited<ReturnType<typeof exchangeWithingsCode>>,
) {
  await prisma.withingsAccount.upsert({
    where: { athleteId },
    create: {
      athleteId,
      withingsUserId: String(token.userid),
      accessTokenEnc: encryptSecret(token.access_token),
      refreshTokenEnc: encryptSecret(token.refresh_token),
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      displayName: `Withings #${token.userid}`,
    },
    update: {
      withingsUserId: String(token.userid),
      accessTokenEnc: encryptSecret(token.access_token),
      refreshTokenEnc: encryptSecret(token.refresh_token),
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
  });
}

async function runInitialWithingsSync(athleteId: string) {
  try {
    await syncWithingsHealth(athleteId, { days: 90 });
  } catch (syncErr) {
    console.error('[withings/callback] sync initial:', syncErr);
  }
}

async function completeWithingsOAuth(request: NextRequest, code: string, state: ConnectState) {
  const redirectUri = state.redirectUri ?? getWithingsRedirectUri(publicOriginFromRequest(request));
  const token = await exchangeWithingsCode(code, redirectUri);
  await persistWithingsAccount(state.athleteId, token);
  await runInitialWithingsSync(state.athleteId);
  return redirectAfterIntegrationConnect(request, state, 'withings', 'connected');
}

/** Arrives with no session (ADR-048): the signed `state` names the athlete. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { code, state: rawState, error } = readOAuthParams(searchParams);
  const state = readConnectState(rawState, 'withings');

  if (error) {
    return redirectAfterIntegrationConnect(request, state, 'withings', 'denied');
  }
  if (!code || !state) {
    return redirectAfterIntegrationConnect(request, state, 'withings', 'invalid_state');
  }
  if (!(await connectStateMatchesSession(state))) {
    return redirectAfterIntegrationConnect(request, state, 'withings', 'invalid_state');
  }

  try {
    return await completeWithingsOAuth(request, code, state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[withings/callback]', message, err);
    return redirectAfterIntegrationConnect(request, state, 'withings', 'error', {
      withingsDetail: message.slice(0, 300),
    });
  }
}
