import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  athleteFeedbackSchema,
  recordAthleteFeedback,
} from '@sharpit/server/lib/feedback/athlete-feedback';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';

/** « Donner un avis » from the iPhone app: a note the athlete writes to the team. */
export async function POST(request: NextRequest) {
  const parsed = athleteFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Écris quelques mots avant d’envoyer.' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    const rateLimit = await checkRateLimit(rateLimiters.feedback, athleteId);
    if (!rateLimit.ok) {
      const limited = rateLimitJsonResponse(rateLimit);
      return NextResponse.json(limited.body, { status: limited.status });
    }
    const saved = await recordAthleteFeedback(athleteId, parsed.data);
    return NextResponse.json({ apiVersion: 1, id: saved.id }, { status: 201 });
  } catch (error) {
    console.error('[api/v1/feedback]', error);
    return NextResponse.json({ error: 'Envoi de ton avis impossible' }, { status: 500 });
  }
}
