import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  generatedSessionPayload,
  type GeneratedSessionInput,
} from '@sharpit/app/lib/planned-session/generated-session-payload';
import { chooseKeySessions } from '@sharpit/app/lib/planned-session/key-sessions';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { createPlannedSessionFromBody } from '@sharpit/server/handlers/planned-sessions/handler';
import {
  activityTypeSchema,
  createPlannedSessionSchema,
  sessionIntensitySchema,
} from '@sharpit/server/lib/validators/planned-session';

const generatedSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().nullish(),
  type: activityTypeSchema,
  intensity: sessionIntensitySchema,
  title: z.string(),
  description: z.string().nullish(),
  strengthPrescription: z.unknown().nullish(),
  endurancePrescription: z.unknown().nullish(),
  durationMin: z.number(),
  load: z.number(),
  decisionId: z.string().nullish(),
  key: z.boolean().nullish(),
});

const insertBodySchema = z.object({
  goalId: z.string().nullish(),
  sessions: z.array(generatedSessionSchema).min(1).max(21),
});

/**
 * The key sessions as the proposal marked them; a client that did not send them back gets the
 * same rule applied here, so a week never lands without its key sessions.
 */
function keySessionsOf(sessions: z.infer<typeof generatedSessionSchema>[]): Set<number> {
  if (sessions.some((session) => session.key)) {
    return new Set(sessions.flatMap((session, index) => (session.key ? [index] : [])));
  }
  return chooseKeySessions(sessions);
}

/**
 * Adds a week the coach generated to the plan — the native twin of the web generator's
 * « Ajouter », which maps each session through `generatedSessionPayload` before creating it.
 * Every session is validated before the first is written, so a refused week leaves the plan
 * untouched and a retry never duplicates what went in.
 */
export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const parsed = insertBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const goalId = parsed.data.goalId ?? null;
    const keys = keySessionsOf(parsed.data.sessions);
    const payloads = parsed.data.sessions.map((session, index) =>
      generatedSessionPayload(
        {
          ...session,
          startTime: session.startTime ?? null,
          description: session.description ?? '',
          decisionId: session.decisionId ?? null,
          key: keys.has(index),
        } as GeneratedSessionInput,
        goalId,
      ),
    );
    const invalid = payloads.findIndex(
      ({ decisionId: _decisionId, ...body }) => !createPlannedSessionSchema.safeParse(body).success,
    );
    if (invalid !== -1) {
      return NextResponse.json(
        { error: 'Séance générée invalide', index: invalid },
        { status: 400 },
      );
    }

    const ids: string[] = [];
    for (const payload of payloads) {
      const created = await createPlannedSessionFromBody(athleteId, payload);
      if ('response' in created) {
        return created.response;
      }
      ids.push(created.session.id);
    }
    return NextResponse.json({ created: ids.length, ids }, { status: 201 });
  } catch (error) {
    console.error('[coach/plan/insert]', error);
    return NextResponse.json({ error: "Impossible d'ajouter la semaine au plan" }, { status: 500 });
  }
}
