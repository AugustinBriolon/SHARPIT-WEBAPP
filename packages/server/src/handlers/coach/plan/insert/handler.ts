import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  generatedSessionPayload,
  type GeneratedSessionInput,
} from '@sharpit/app/lib/planned-session/generated-session-payload';
import { chooseKeySessions } from '@sharpit/app/lib/planned-session/key-sessions';
import { requirePro } from '@sharpit/server/lib/access/require-pro';
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
  routines: z.unknown().nullish(),
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

export type GeneratedWeekBody = z.infer<typeof insertBodySchema>;

/**
 * Writes a generated week into the plan. Every session is validated before the first is
 * written, so a refused week leaves the plan untouched and a retry never duplicates what went in.
 * Shared by the athlete's « Ajouter » and the plan horizon's automatic week.
 */
export async function insertGeneratedWeek(
  athleteId: string,
  body: GeneratedWeekBody,
): Promise<{ ids: string[] } | { response: NextResponse }> {
  const goalId = body.goalId ?? null;
  const keys = keySessionsOf(body.sessions);
  const payloads = body.sessions.map((session, index) =>
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
    ({ decisionId: _decisionId, ...payload }) =>
      !createPlannedSessionSchema.safeParse(payload).success,
  );
  if (invalid !== -1) {
    return {
      response: NextResponse.json(
        { error: 'Séance générée invalide', index: invalid },
        { status: 400 },
      ),
    };
  }

  const ids: string[] = [];
  for (const payload of payloads) {
    const created = await createPlannedSessionFromBody(athleteId, payload);
    if ('response' in created) {
      return { response: created.response };
    }
    ids.push(created.session.id);
  }
  return { ids };
}

/** Parses a generated week as `/coach/plan/insert` receives it; null when it does not hold. */
export function parseGeneratedWeek(raw: unknown): GeneratedWeekBody | null {
  const parsed = insertBodySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Adds a week the coach generated to the plan — the native twin of the web generator's
 * « Ajouter », which maps each session through `generatedSessionPayload` before creating it.
 */
export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    // The onboarding preview is free to read, not to keep: adding it is the Pro step (ADR-097).
    const proBlocked = await requirePro(athleteId);
    if (proBlocked) {
      return proBlocked;
    }
    const parsed = insertBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const inserted = await insertGeneratedWeek(athleteId, parsed.data);
    if ('response' in inserted) {
      return inserted.response;
    }
    return NextResponse.json({ created: inserted.ids.length, ids: inserted.ids }, { status: 201 });
  } catch (error) {
    console.error('[coach/plan/insert]', error);
    return NextResponse.json({ error: "Impossible d'ajouter la semaine au plan" }, { status: 500 });
  }
}
