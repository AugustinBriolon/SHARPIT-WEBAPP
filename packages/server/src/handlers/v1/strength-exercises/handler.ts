import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  MAX_EXERCISE_NAME,
  MAX_EXERCISE_NOTE,
  loadExerciseHistory,
  loadExerciseSessions,
  saveAthleteExerciseNote,
} from '@sharpit/server/lib/strength/exercise-history';

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

const noteSchema = z.object({
  name: z.string().trim().min(1).max(MAX_EXERCISE_NAME),
  note: z.string().max(MAX_EXERCISE_NOTE),
});

/** The athlete's standing note on one exercise (ADR-146); an empty note removes it. */
export async function PUT(request: NextRequest) {
  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    await saveAthleteExerciseNote(athleteId, parsed.data.name, parsed.data.note);
    return NextResponse.json({ apiVersion: 1, note: parsed.data.note.trim() || null });
  } catch (error) {
    console.error('[api/v1/strength-exercises] note', { ok: false, hasError: Boolean(error) });
    return NextResponse.json({ error: 'Note non enregistrée' }, { status: 500 });
  }
}

/** `?name=` — the days one exercise was done, oldest first, for its progression screen. */
export async function GET_PROGRESSION(request: NextRequest) {
  const name = new URL(request.url).searchParams.get('name')?.trim() ?? '';
  if (!name || name.length > MAX_EXERCISE_NAME) {
    return NextResponse.json({ error: 'Exercice manquant' }, { status: 400 });
  }
  try {
    const athleteId = await getCurrentAthleteId();
    return NextResponse.json({
      apiVersion: 1,
      sessions: await loadExerciseSessions(athleteId, name),
    });
  } catch (error) {
    console.error('[api/v1/strength-exercises/progression]', {
      ok: false,
      hasError: Boolean(error),
    });
    return NextResponse.json({ error: 'Impossible de lire la progression' }, { status: 500 });
  }
}
