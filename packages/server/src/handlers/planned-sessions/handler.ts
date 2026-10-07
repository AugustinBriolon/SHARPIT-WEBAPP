import { NextRequest, NextResponse } from 'next/server';
import { defaultExposureForActivityType } from '@sharpit/core/planned-session/defaults';
import { pushSessionToGoogle } from '@sharpit/server/lib/integrations/google/google-sync';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  createPlannedSession,
  getAthleteProfile,
  getPlannedSessionById,
  getPlannedSessions,
} from '@sharpit/server/lib/queries';
import {
  athleteThresholds,
  buildPlannedSessionSteps,
} from '@sharpit/server/lib/planned-session/session-steps';
import type { PlannedSession } from '@prisma/client';
import { refreshAndPersistPlannedSessionContext } from '@sharpit/server/lib/planned-session/resolve-context';
import { createPlannedSessionSchema } from '@sharpit/server/lib/validators/planned-session';
import {
  findCoachingDecisionById,
  findSessionPurposesByPlannedSessionIds,
  recordDecisionAction,
} from '@sharpit/server/lib/decision-memory/repository';

async function assertDecisionNotRejected(athleteId: string, decisionId: string) {
  const decision = await findCoachingDecisionById(athleteId, decisionId);
  if (decision?.gateResult.status !== 'REJECTED') {
    return null;
  }
  return NextResponse.json(
    { error: 'Cette proposition a été rejetée par le Gate et ne peut pas être appliquée.' },
    { status: 422 },
  );
}

async function recordAcceptedDecision(athleteId: string, decisionId: string, sessionId: string) {
  try {
    await recordDecisionAction(athleteId, {
      decisionId,
      actionType: 'ACCEPTED',
      source: 'PLAN_REVIEW_UI',
      resultingPlannedSessionId: sessionId,
    });
  } catch (decisionError) {
    console.error('[planned-sessions/decision-action]', decisionError);
  }
}

async function runPlannedSessionSideEffects(athleteId: string, session: PlannedSession) {
  await Promise.all([
    refreshAndPersistPlannedSessionContext(athleteId, session.id).catch((ctxError) => {
      console.error('[planned-sessions/context]', ctxError);
    }),
    pushSessionToGoogle(session).catch((syncError) => {
      console.error('Push Google Calendar échoué', syncError);
    }),
  ]);
}

export async function GET(request: NextRequest) {
  // Read search params before try so Cache Components prerender interrupts propagate.
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  try {
    const athleteId = await getCurrentAthleteId();
    const [sessions, profile] = await Promise.all([
      getPlannedSessions(athleteId, {
        from: fromParam ? new Date(fromParam) : undefined,
        to: toParam ? new Date(toParam) : undefined,
      }),
      getAthleteProfile(athleteId),
    ]);

    // Targets are stored relative to thresholds and resolved for reading, so the
    // breakdown a client shows is the one a watch push would send. Resolving it here
    // keeps that one calculation on the server instead of in every client.
    const thresholds = athleteThresholds(profile);
    const purposes = await findSessionPurposesByPlannedSessionIds(
      athleteId,
      sessions.map((session) => session.id),
    );

    return NextResponse.json(
      sessions.map((session) => ({
        ...session,
        // Decision Memory holds the coach's "why" — PlannedSession does not store prose.
        rationale: purposes.get(session.id) ?? null,
        breakdown: buildPlannedSessionSteps(session, thresholds, {
          defaultPoolLengthM: profile?.defaultPoolLengthM,
        }),
      })),
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de charger les séances planifiées' },
      { status: 500 },
    );
  }
}

/**
 * Validates and stores one planned session, as the POST body shapes it, with every side effect
 * of a creation. Shared by this route and the native week insert (`coach/plan/insert`).
 */
export async function createPlannedSessionFromBody(
  athleteId: string,
  body: unknown,
): Promise<{ session: PlannedSession } | { response: NextResponse }> {
  const { decisionId, ...sessionBody } = (body ?? {}) as { decisionId?: string | null };
  const parsed = createPlannedSessionSchema.safeParse(sessionBody);

  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: 'Données invalides', details: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  // A Gate-rejected proposal must never become a real PlannedSession — this is a
  // safety invariant, not merely a UI affordance. The client already disables the
  // control for REJECTED sessions, but the server is the enforcement boundary: a
  // direct API call must not be able to bypass the Gate's verdict.
  if (decisionId) {
    const rejected = await assertDecisionNotRejected(athleteId, decisionId);
    if (rejected) {
      return { response: rejected };
    }
  }

  const session = await createPlannedSession(athleteId, {
    ...(parsed.data as Parameters<typeof createPlannedSession>[1]),
    exposureSetting:
      parsed.data.exposureSetting ?? defaultExposureForActivityType(parsed.data.type),
  });

  // Records the athlete's acceptance of a coach recommendation (best-effort —
  // an invalid/unknown decisionId must never fail the session creation itself).
  if (decisionId) {
    await recordAcceptedDecision(athleteId, decisionId, session.id);
  }

  await runPlannedSessionSideEffects(athleteId, session);
  return { session };
}

export async function POST(request: NextRequest) {
  try {
    const athleteId = await getCurrentAthleteId();
    const created = await createPlannedSessionFromBody(athleteId, await request.json());
    if ('response' in created) {
      return created.response;
    }
    const fresh = await getPlannedSessionById(athleteId, created.session.id);
    return NextResponse.json(fresh ?? created.session, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Impossible de créer la séance planifiée' }, { status: 500 });
  }
}
