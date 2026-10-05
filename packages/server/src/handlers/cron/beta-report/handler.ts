import { NextResponse } from 'next/server';
import { trainingDayIdForNow } from '@sharpit/core/training/training-day';
import { verifyCronSecret } from '@sharpit/server/lib/cron/verify-cron-secret';
import { sendWeeklyBetaReport } from '@sharpit/server/lib/reports/weekly-beta-report';

/** Monday morning: the beta's outcome and the week's feedback, mailed to FEEDBACK_EMAIL. */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await sendWeeklyBetaReport(trainingDayIdForNow())) });
  } catch (error) {
    console.error('[cron/beta-report]', error);
    return NextResponse.json({ error: 'Beta report failed' }, { status: 500 });
  }
}
