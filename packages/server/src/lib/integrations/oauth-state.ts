import { auth } from '@clerk/nextjs/server';
import type { IntegrationId } from '@sharpit/app/lib/integrations/shared/client-sync';
import type { DataClassId } from '@sharpit/app/lib/integrations/provider-catalog';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { readSignedToken, signToken } from '@sharpit/server/lib/signed-token';

/**
 * Everything a provider connect must remember across the provider's sign-in, carried in the
 * OAuth `state` (or the Garmin SSO page URL) instead of cookies: `api.` never sets one, and the
 * callback arrives with no Bearer (ADR-048). Signed, so the athlete id can be trusted; bound to
 * one provider and to ten minutes.
 */
export interface ConnectState {
  provider: IntegrationId;
  athleteId: string;
  /** An allow-listed in-app path (`sanitizeIntegrationReturnTo`). */
  returnTo: string;
  dataClass: DataClassId | null;
  /** The Sharpit web origin the athlete started from, and lands back on. */
  webOrigin: string;
  /** The `redirect_uri` sent to the provider — the token exchange must repeat it. */
  redirectUri: string | null;
}

const CONNECT_STATE_TTL_SECONDS = 600;

export function createConnectState(state: ConnectState): string {
  return signToken({ ...state, exp: Math.floor(Date.now() / 1000) + CONNECT_STATE_TTL_SECONDS });
}

function isConnectState(value: Record<string, unknown>): boolean {
  return (
    typeof value.athleteId === 'string' &&
    typeof value.returnTo === 'string' &&
    typeof value.webOrigin === 'string' &&
    (value.dataClass === null || typeof value.dataClass === 'string') &&
    (value.redirectUri === null || typeof value.redirectUri === 'string')
  );
}

/** The state when it is genuine, fresh and was issued for this provider; null otherwise. */
export function readConnectState(
  raw: string | null | undefined,
  provider: IntegrationId,
): ConnectState | null {
  const payload = readSignedToken(raw);
  if (!payload || payload.provider !== provider || !isConnectState(payload)) {
    return null;
  }
  const { athleteId, returnTo, dataClass, webOrigin, redirectUri } =
    payload as unknown as ConnectState;
  return { provider, athleteId, returnTo, dataClass, webOrigin, redirectUri };
}

/**
 * When a Clerk session is present on the callback host (same posture as Garmin SSO),
 * the signed state must name that athlete — blocks account-linking CSRF. When there is
 * no session (`api.` host, ADR-048), the signed state alone is the authority.
 */
export async function connectStateMatchesSession(state: ConnectState): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) {
    return true;
  }
  try {
    return (await getCurrentAthleteId()) === state.athleteId;
  } catch {
    return false;
  }
}
