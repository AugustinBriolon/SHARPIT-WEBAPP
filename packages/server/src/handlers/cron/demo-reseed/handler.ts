import { NextResponse } from 'next/server';
import { prisma } from '@sharpit/db/client';
import {
  refreshReviewAthleteHistory,
  seedDemoAthlete,
} from '@sharpit/server/lib/demo/seed-demo-data';
import { verifyCronSecret } from '@sharpit/server/lib/cron/verify-cron-secret';

/** Keeps the public demo's "last 3 weeks" genuinely relative to today — every
 * date in seedDemoAthlete() is computed at run time, so a daily rerun is what
 * actually prevents the demo from going stale (see ADR-026). The App Review
 * account (`REVIEW_CLERK_USER_ID`) is moved to today the same way, so it reads
 * as a live athlete whenever Apple opens it. */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await seedDemoAthlete(prisma);
  const review = await refreshReviewAccount();

  return NextResponse.json({ ok: true, review });
}

/** The review account's refresh never fails the demo's: its outcome is reported, not thrown. */
async function refreshReviewAccount(): Promise<'skipped' | 'refreshed' | 'missing' | 'failed'> {
  const clerkUserId = process.env.REVIEW_CLERK_USER_ID?.trim();
  if (!clerkUserId) {
    return 'skipped';
  }
  const athlete = await prisma.athleteProfile.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });
  if (!athlete) {
    return 'missing';
  }
  try {
    await refreshReviewAthleteHistory(prisma, athlete.id);
    return 'refreshed';
  } catch (error) {
    console.error('[demo-reseed] review account refresh failed', error);
    return 'failed';
  }
}
