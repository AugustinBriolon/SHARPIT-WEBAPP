import { NextResponse } from 'next/server';
import { verifyCronSecret } from '@sharpit/server/lib/cron/verify-cron-secret';
import { runPlanHorizon } from '@sharpit/server/lib/coach/plan/plan-horizon';

/**
 * Daily: no athlete in the middle of a plan runs out of planned sessions. Writes the next week
 * three days ahead, reminds the day after, adds it as written the day before it starts.
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runPlanHorizon()) });
  } catch (error) {
    console.error('[cron/plan-horizon]', error);
    return NextResponse.json({ error: 'Plan horizon failed' }, { status: 500 });
  }
}
