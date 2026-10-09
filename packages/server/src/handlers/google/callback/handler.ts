import { NextRequest } from 'next/server';
import {
  emailFromIdToken,
  exchangeCodeForToken,
} from '@sharpit/server/lib/integrations/google/google';
import { redirectAfterIntegrationConnect } from '@sharpit/server/lib/integrations/oauth-return';
import {
  connectStateMatchesSession,
  type ConnectState,
  readConnectState,
} from '@sharpit/server/lib/integrations/oauth-state';
import { prisma } from '@sharpit/db/client';
import { encryptSecret } from '@sharpit/server/lib/secret-box';

function readOAuthParams(searchParams: URLSearchParams) {
  return {
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error'),
  };
}

async function persistGoogleAccount(
  athleteId: string,
  token: Awaited<ReturnType<typeof exchangeCodeForToken>>,
) {
  const email = emailFromIdToken(token.id_token);
  const data = {
    email,
    accessTokenEnc: encryptSecret(token.access_token),
    refreshTokenEnc: encryptSecret(token.refresh_token!),
    expiresAt: new Date(Date.now() + token.expires_in * 1000),
    scope: token.scope ?? null,
  };

  await prisma.googleAccount.upsert({
    where: { athleteId },
    create: { athleteId, ...data },
    update: data,
  });
}

async function completeGoogleOAuth(request: NextRequest, code: string, state: ConnectState) {
  const token = await exchangeCodeForToken(code, state.redirectUri ?? undefined);
  if (!token.refresh_token) {
    return redirectAfterIntegrationConnect(request, state, 'google', 'no_refresh');
  }
  await persistGoogleAccount(state.athleteId, token);
  return redirectAfterIntegrationConnect(request, state, 'google', 'connected');
}

/** Arrives with no session (ADR-048): the signed `state` names the athlete. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { code, state: rawState, error } = readOAuthParams(searchParams);
  const state = readConnectState(rawState, 'google');

  if (error) {
    return redirectAfterIntegrationConnect(request, state, 'google', 'denied');
  }
  if (!code || !state) {
    return redirectAfterIntegrationConnect(request, state, 'google', 'invalid_state');
  }
  if (!(await connectStateMatchesSession(state))) {
    return redirectAfterIntegrationConnect(request, state, 'google', 'invalid_state');
  }

  try {
    return await completeGoogleOAuth(request, code, state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[google/callback]', message, err);
    const extra =
      process.env.NODE_ENV === 'development' ? { googleDetail: message.slice(0, 300) } : undefined;
    return redirectAfterIntegrationConnect(request, state, 'google', 'error', extra);
  }
}
