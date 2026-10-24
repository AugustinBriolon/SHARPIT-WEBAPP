import { NextRequest, NextResponse } from 'next/server';
import {
  beginIntegrationConnect,
  connectNavigation,
  publicOriginFromRequest,
  redirectIfBindHost,
} from '@sharpit/server/lib/integrations/oauth-return';
import {
  buildGarminAuthorizeUrl,
  getGarminRedirectUri,
  isGarminConfigured,
} from '@sharpit/server/lib/integrations/garmin/garmin-oauth';
import { gateProviderConnect } from '@sharpit/server/lib/privacy/gate-provider-connect';

export async function GET(request: NextRequest) {
  const bindRedirect = redirectIfBindHost(request);
  if (bindRedirect) {
    return bindRedirect;
  }
  if (!isGarminConfigured()) {
    return NextResponse.json(
      { error: 'Garmin non configuré. Ajoute GARMIN_CLIENT_ID et GARMIN_CLIENT_SECRET dans .env' },
      { status: 400 },
    );
  }

  const consentBlock = await gateProviderConnect(request, 'garmin', 'redirect');
  if (consentBlock) {
    return consentBlock;
  }

  const redirectUri = getGarminRedirectUri(publicOriginFromRequest(request));
  const state = await beginIntegrationConnect(request, 'garmin', redirectUri);
  return connectNavigation(request, buildGarminAuthorizeUrl(state, redirectUri));
}
