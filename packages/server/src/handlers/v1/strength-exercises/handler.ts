import { NextResponse } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { loadExerciseHistory } from '@sharpit/server/lib/strength/exercise-history';

/**
 * The athlete's own exercises for native clients (ADR-040): each one's last session and best
 * figures, read from the sets already logged. The app proposes them as a new set's defaults and
 * as the first results of its exercise search.
 */
export async function GET() {
  try {
    const athleteId = await getCurrentAthleteId();
    return NextResponse.json({ apiVersion: 1, exercises: await loadExerciseHistory(athleteId) });
  } catch (error) {
    console.error('[api/v1/strength-exercises]', { ok: false, hasError: Boolean(error) });
    return NextResponse.json({ error: 'Impossible de lire tes exercices' }, { status: 500 });
  }
}
