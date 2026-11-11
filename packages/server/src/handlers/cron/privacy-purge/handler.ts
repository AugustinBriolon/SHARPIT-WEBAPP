import { NextResponse } from 'next/server';
import { purgeSoftDeletedAthletes } from '@sharpit/server/lib/privacy/account-deletion';
import { processInactiveAccounts } from '@sharpit/server/lib/privacy/inactive-accounts';
import { purgeProcessedGarminPushes } from '@sharpit/server/lib/integrations/garmin/garmin-push';
import { verifyCronSecret } from '@sharpit/server/lib/cron/verify-cron-secret';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

/**
 * Finishes any account deletion still pending (see `purgeSoftDeletedAthletes`), drops
 * Garmin pushes kept past their retention, and warns then deletes inactive accounts.
 * Scheduled in vercel.json — Bearer CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await purgeSoftDeletedAthletes();
    const purgedGarminPushes = await purgeProcessedGarminPushes();
    const inactive = await processInactiveAccounts();
    // 500 when an erasure is stuck: the run shows as failed, and the body says which step.
    return NextResponse.json(
      {
        ok: result.failed.length === 0,
        purgedGarminPushes,
        // ids only — never profile metrics
        inactiveNotifiedAthleteIds: inactive.notified,
        inactiveDeletedAthleteIds: inactive.deleted,
        purgedCount: result.purged.length,
        purgedAthleteIds: result.purged,
        failedErasures: result.failed,
      },
      { status: result.failed.length === 0 ? 200 : 500 },
    );
  } catch (error) {
    logSafeError('cron/privacy-purge', error);
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
  }
}
