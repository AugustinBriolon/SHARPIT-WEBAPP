import { NextRequest } from 'next/server';
import { prisma } from '@sharpit/db/client';
import { redirectAfterIntegrationConnect } from '@sharpit/server/lib/integrations/oauth-return';
import {
  connectStateMatchesSession,
  readConnectState,
} from '@sharpit/server/lib/integrations/oauth-state';
import { exchangeCodeForToken } from '@sharpit/server/lib/integrations/strava/strava';
import { encryptSecret } from '@sharpit/server/lib/secret-box';

function readOAuthParams(searchParams: URLSearchParams) {
  return {
    code: searchParams.get('code'),
    state: searchParams.get('state'),
    error: searchParams.get('error'),
  };
}

async function persistStravaAccount(
  athleteId: string,
  token: Awaited<ReturnType<typeof exchangeCodeForToken>>,
) {
  const { athlete } = token;
  if (!athlete) {
    return false;
  }

  const data = {
    stravaAthleteId: String(athlete.id),
    firstName: athlete.firstname ?? null,
    lastName: athlete.lastname ?? null,
    avatarUrl: athlete.profile ?? null,
    accessTokenEnc: encryptSecret(token.access_token),
    refreshTokenEnc: encryptSecret(token.refresh_token),
    expiresAt: new Date(token.expires_at * 1000),
  };

  await prisma.stravaAccount.upsert({
    where: { athleteId },
    create: { athleteId, ...data },
    update: data,
  });
  return true;
}

/** Arrives with no session (ADR-048): the signed `state` names the athlete. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { code, state: rawState, error } = readOAuthParams(searchParams);
  const state = readConnectState(rawState, 'strava');

  if (error) {
    return redirectAfterIntegrationConnect(request, state, 'strava', 'denied');
  }
  if (!code || !state) {
    return redirectAfterIntegrationConnect(request, state, 'strava', 'invalid_state');
  }
  if (!(await connectStateMatchesSession(state))) {
    return redirectAfterIntegrationConnect(request, state, 'strava', 'invalid_state');
  }

  try {
    const token = await exchangeCodeForToken(code);
    const saved = await persistStravaAccount(state.athleteId, token);
    if (!saved) {
      return redirectAfterIntegrationConnect(request, state, 'strava', 'no_athlete');
    }
    return redirectAfterIntegrationConnect(request, state, 'strava', 'connected');
  } catch (err) {
    console.error(err);
    return redirectAfterIntegrationConnect(request, state, 'strava', 'error');
  }
}
