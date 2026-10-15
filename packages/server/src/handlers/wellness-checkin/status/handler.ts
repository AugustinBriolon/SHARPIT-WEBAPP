import { NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { getWellnessCheckInStatus } from '@sharpit/server/lib/journal/wellness-checkin';
import { awaitRequest } from '@sharpit/app/lib/next/await-request';

/**
 * GET /api/v1/wellness-checkin/status
 *
 * Answers only whether today's morning ressenti exists for the session athlete.
 * Response shape (iOS half-sheet):
 *   `{ "localDate": "YYYY-MM-DD", "completed": boolean }`
 *
 * Never returns mood / energy / soreness / stress / notes.
 * `localDate` uses the athlete training-day timezone (GoogleAccount.timeZone ??
 * Europe/Paris), same definition as the morning verdict / FeatureEngine day.
 */
export async function GET() {
  await awaitRequest();

  try {
    const athleteId = await getCurrentAthleteId();
    const status = await getWellnessCheckInStatus(athleteId);
    console.info('[wellness-checkin/status]', {
      completed: status.completed,
      hasLocalDate: Boolean(status.localDate),
    });
    return NextResponse.json(status);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';
    console.error(
      '[wellness-checkin/status] failed',
      error instanceof Error ? error.name : 'unknown',
      code,
    );
    return NextResponse.json(
      { error: 'Impossible de résoudre le statut du ressenti' },
      { status: 500 },
    );
  }
}
