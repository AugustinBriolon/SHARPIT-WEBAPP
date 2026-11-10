import { NextResponse } from 'next/server';
import { purgeSoftDeletedAthletes } from '@sharpit/server/lib/privacy/account-deletion';
import { purgeProcessedGarminPushes } from '@sharpit/server/lib/integrations/garmin/garmin-push';
import { verifyCronSecret } from '@sharpit/server/lib/cron/verify-cron-secret';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

/**
 * Finishes any account deletion still pending (see `purgeSoftDeletedAthletes`) and drops
 * Garmin pushes kept past their retention.
 * Scheduled in vercel.json — Bearer CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await purgeSoftDeletedAthletes();
    const purgedGarminPushes = await purgeProcessedGarminPushes();
    return NextResponse.json({
      ok: true,
      purgedGarminPushes,
      purgedCount: result.purged.length,
      // ids only — never profile metrics
      purgedAthleteIds: result.purged,
    });
  } catch (error) {
    logSafeError('cron/privacy-purge', error);
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
  }
}
