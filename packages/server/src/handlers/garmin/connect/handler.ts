import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { sanitizeDataClass } from '@sharpit/app/lib/integrations/oauth-public-origin';
import {
  enableProviderForAllCoveredClasses,
  enableProviderForClass,
} from '@sharpit/app/lib/integrations/source-prefs';
import { canUseGarminPersonalKey } from '@sharpit/server/lib/integrations/garmin/garmin-access';
import {
  connectGarminWithApiKey,
  getGarminAccount,
} from '@sharpit/server/lib/integrations/garmin/garmin-sync';
import {
  isGarminAccountConnected,
  isProviderAuthFailure,
} from '@sharpit/server/lib/integrations/shared/connection-status';
import { persistSourcePrefsMutation } from '@sharpit/server/lib/integrations/source-prefs-store';
import { gateProviderConnect } from '@sharpit/server/lib/privacy/gate-provider-connect';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

import { garminConnectSchema } from './schema';

/** Whether this athlete may add a key, and the masked key once one is stored. */
export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    const account = await getGarminAccount(athleteId);
    const connected = isGarminAccountConnected(account);
    return NextResponse.json({
      available: canUseGarminPersonalKey(athleteId) || Boolean(account),
      connected,
      apiKeyLast4: connected ? (account?.apiKeyLast4 ?? null) : null,
      lastSyncAt: account?.lastSyncAt ?? null,
    });
  } catch (error) {
    logSafeError('api/garmin/connect GET', error);
    return NextResponse.json({ error: 'Statut Garmin indisponible' }, { status: 500 });
  }
}

/**
 * Stores a Garmin Personal API key after Garmin accepts it. The key is write-only: the response
 * carries its last four characters, never the key. The first sync is the client's next call.
 */
export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    if (!canUseGarminPersonalKey(athleteId)) {
      return NextResponse.json({ error: 'Garmin n’est pas encore ouvert.' }, { status: 403 });
    }
    const consentBlock = await gateProviderConnect(request, 'garmin', 'json');
    if (consentBlock) {
      return consentBlock;
    }

    const parsed = garminConnectSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Clé API Garmin requise' }, { status: 400 });
    }

    const account = await connectGarminWithApiKey(athleteId, parsed.data.apiKey);
    const dataClass = sanitizeDataClass(parsed.data.dataClass);
    await persistSourcePrefsMutation(athleteId, (prefs) =>
      dataClass
        ? enableProviderForClass(prefs, dataClass, 'garmin')
        : enableProviderForAllCoveredClasses(prefs, 'garmin'),
    );

    return NextResponse.json({ success: true, ...account });
  } catch (error) {
    logSafeError('api/garmin/connect', error);
    if (isProviderAuthFailure(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Connexion Garmin échouée. Réessaie.' }, { status: 502 });
  }
}
