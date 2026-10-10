import { NextResponse } from 'next/server';
import { coachQuota } from '@sharpit/server/lib/access/ai-budget';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';

/** What is left of the athlete's coach budget, in questions (ADR-077). */
export async function GET() {
  // Outside try: the Cache Components prerender interrupt must not be swallowed.
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    return NextResponse.json(await coachQuota(athleteId));
  } catch (error) {
    console.error('[api/coach/quota]', error);
    return NextResponse.json({ error: 'Impossible de lire ton quota coach' }, { status: 500 });
  }
}
