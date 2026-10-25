import { after, NextRequest, NextResponse } from 'next/server';
import { timingSafeEqualString } from '@sharpit/server/lib/crypto/timing-safe-equal';
import {
  processGarminPushRow,
  receiveGarminPush,
} from '@sharpit/server/lib/integrations/garmin/garmin-push';

/**
 * Garmin's push endpoint (Health and Activity APIs), configured at apis.garmin.com/tools as
 * `https://api.sharpit.app/api/garmin/push?key=<GARMIN_PUSH_SECRET>` for every summary type.
 * Garmin signs nothing, so the secret in the URL is the authentication. The payload is kept,
 * the 200 sent at once (Garmin's 30 s rule), and processing runs after the response.
 * shortcut: Vercel caps a request body at 4.5 MB, so the per-second details of a very long
 * session can be refused; move such sessions to Activity Files (FIT) if that shows up.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.GARMIN_PUSH_SECRET;
  const key = request.nextUrl.searchParams.get('key') ?? '';
  if (!secret || !timingSafeEqualString(key, secret)) {
    // The key's length only, never its value: enough to tell a missing or cut key at Garmin.
    console.warn('[garmin-push] refused', {
      secretConfigured: Boolean(secret),
      keyLength: key.length,
      queryKeys: [...request.nextUrl.searchParams.keys()],
    });
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids = await receiveGarminPush(body);
  after(async () => {
    for (const id of ids) {
      await processGarminPushRow(id).catch((error: unknown) => {
        console.error('[garmin-push] processing failed, the cron replays it', {
          id,
          name: error instanceof Error ? error.name : 'Error',
        });
      });
    }
  });
  return NextResponse.json({ received: ids.length });
}
