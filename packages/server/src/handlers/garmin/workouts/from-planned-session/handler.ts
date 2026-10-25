import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePro } from '@sharpit/server/lib/access/require-pro';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { GarminWorkoutPushError } from '@sharpit/server/lib/integrations/garmin/garmin-training-api';
import { pushPlannedSessionToGarmin } from '@sharpit/server/lib/integrations/garmin/garmin-workout-push';
import { isProviderAuthFailure } from '@sharpit/server/lib/integrations/shared/connection-status';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

const bodySchema = z.object({
  plannedSessionId: z.string().min(1),
  /** Deletes the workout sent before and sends the session again. */
  replace: z.boolean().optional(),
});

/**
 * Sends a planned session to the athlete's watch (Training API V2, ADR-106). Pro-only:
 * pushing to the watch is what SharpIt adds (ADR-097). A refusal carries a `code` so the
 * clients can say what to do; a lost Garmin session is a 403, never a 401, which would sign
 * the athlete out of SharpIt.
 */
export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const refused = await requirePro(athleteId);
    if (refused) {
      return refused;
    }
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
    }
    return NextResponse.json(await pushPlannedSessionToGarmin(athleteId, parsed.data));
  } catch (error) {
    if (error instanceof GarminWorkoutPushError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    if (isProviderAuthFailure(error)) {
      return NextResponse.json({ error: error.message, code: 'reconnect' }, { status: 403 });
    }
    logSafeError('api/garmin/workouts/from-planned-session', error);
    return NextResponse.json(
      { error: 'Envoi vers Garmin impossible pour le moment.', code: 'garmin_unavailable' },
      { status: 502 },
    );
  }
}
