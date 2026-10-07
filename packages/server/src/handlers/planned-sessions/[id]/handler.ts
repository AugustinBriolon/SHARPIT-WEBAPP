import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import type { z } from 'zod';
import {
  deleteSessionFromGoogle,
  pushSessionToGoogle,
} from '@sharpit/server/lib/integrations/google/google-sync';
import {
  deletePlannedSession,
  getPlannedSessionById,
  updatePlannedSession,
} from '@sharpit/server/lib/queries';
import { refreshAndPersistPlannedSessionContext } from '@sharpit/server/lib/planned-session/resolve-context';
import { updatePlannedSessionSchema } from '@sharpit/server/lib/validators/planned-session';
import {
  findCoachingDecisionById,
  findDecisionForPlannedSession,
  findSessionPurposeForPlannedSession,
  recordDecisionAction,
} from '@sharpit/server/lib/decision-memory/repository';
import { garminPushClearOnSessionChange } from '@sharpit/server/lib/integrations/garmin/garmin-workout-push-state';
import { enduranceSportFromActivityType } from '@sharpit/app/lib/planned-session/endurance/endurance-prescription';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const session = await getPlannedSessionById(athleteId, id);
    if (!session) {
      return NextResponse.json({ error: 'Séance planifiée introuvable' }, { status: 404 });
    }
    const rationale = await findSessionPurposeForPlannedSession(athleteId, id);
    return NextResponse.json({ ...session, rationale });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de charger la séance planifiée' },
      { status: 500 },
    );
  }
}

/** Fields that change what the session actually asks the athlete to do. */
const SESSION_DEFINING_FIELDS = [
  'intensity',
  'durationMin',
  'load',
  'type',
  'date',
  'strengthPrescription',
  'endurancePrescription',
] as const;

function changesSessionDefiningField(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  return SESSION_DEFINING_FIELDS.some((field) => {
    if (!(field in patch)) {
      return false;
    }
    const before = existing[field];
    const after = patch[field];
    if (before instanceof Date || after instanceof Date) {
      return (
        new Date(before as Date | string).getTime() !== new Date(after as Date | string).getTime()
      );
    }
    return before !== after;
  });
}

type UpdatePlannedSessionInput = z.infer<typeof updatePlannedSessionSchema>;

function invalidPatchResponse(error: string, status: number, details?: unknown) {
  return NextResponse.json(details ? { error, details } : { error }, { status });
}

async function validateRejectedDecision(athleteId: string, decisionId?: string) {
  if (!decisionId) {
    return null;
  }
  const decision = await findCoachingDecisionById(athleteId, decisionId);
  if (decision?.gateResult.status !== 'REJECTED') {
    return null;
  }
  return invalidPatchResponse(
    'Cette proposition a été rejetée par le Gate et ne peut pas être appliquée.',
    422,
  );
}

function validateEnduranceSportMatch(
  parsed: UpdatePlannedSessionInput,
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>,
) {
  const effectiveType = parsed.type ?? existing.type;
  const effectiveSport = enduranceSportFromActivityType(effectiveType);
  const patchedSport = parsed.endurancePrescription?.sport;
  if (!patchedSport || !effectiveSport || patchedSport === effectiveSport) {
    return null;
  }
  return invalidPatchResponse(
    `Le déroulé structuré est en ${patchedSport} mais la séance est en ${effectiveType}.`,
    400,
  );
}

async function validatePatchRequest(
  athleteId: string,
  id: string,
  body: unknown,
): Promise<
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      decisionId?: string;
      parsed: UpdatePlannedSessionInput;
      existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>;
    }
> {
  const { decisionId, ...sessionBody } = body as { decisionId?: string };
  const parsed = updatePlannedSessionSchema.safeParse(sessionBody);
  if (!parsed.success) {
    return {
      ok: false,
      response: invalidPatchResponse('Données invalides', 400, parsed.error.flatten()),
    };
  }

  const existing = await getPlannedSessionById(athleteId, id);
  if (!existing) {
    return { ok: false, response: invalidPatchResponse('Séance planifiée introuvable', 404) };
  }

  const rejectedResponse = await validateRejectedDecision(athleteId, decisionId);
  if (rejectedResponse) {
    return { ok: false, response: rejectedResponse };
  }

  const sportMismatchResponse = validateEnduranceSportMatch(parsed.data, existing);
  if (sportMismatchResponse) {
    return { ok: false, response: sportMismatchResponse };
  }

  return { ok: true, decisionId, parsed: parsed.data, existing };
}

async function recordOverrideDecision(athleteId: string, sessionId: string) {
  const priorDecision = await findDecisionForPlannedSession(athleteId, sessionId);
  if (!priorDecision) {
    return;
  }
  await recordDecisionAction(athleteId, {
    decisionId: priorDecision.id,
    actionType: 'OVERRIDDEN',
    source: 'CALENDAR_EDIT',
    resultingPlannedSessionId: sessionId,
  });
}

async function recordPlannedSessionDecisionAction(input: {
  athleteId: string;
  sessionId: string;
  decisionId?: string;
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>;
  patch: UpdatePlannedSessionInput;
}) {
  const { athleteId, sessionId, decisionId, existing, patch } = input;
  try {
    if (decisionId) {
      await recordDecisionAction(athleteId, {
        decisionId,
        actionType: 'ACCEPTED',
        source: 'PLAN_REVIEW_UI',
        resultingPlannedSessionId: sessionId,
      });
      return;
    }
    if (
      !changesSessionDefiningField(
        existing as unknown as Record<string, unknown>,
        patch as Record<string, unknown>,
      )
    ) {
      return;
    }
    await recordOverrideDecision(athleteId, sessionId);
  } catch (decisionError) {
    console.error('[planned-sessions/decision-action]', decisionError);
  }
}

async function applyPlannedSessionPatch(
  athleteId: string,
  id: string,
  parsed: UpdatePlannedSessionInput,
  existing: NonNullable<Awaited<ReturnType<typeof getPlannedSessionById>>>,
) {
  const patchedSport = parsed.endurancePrescription?.sport;
  const effectiveSport = enduranceSportFromActivityType(parsed.type ?? existing.type);
  const clearGarminPush = garminPushClearOnSessionChange(parsed);
  return updatePlannedSession(athleteId, id, {
    ...(parsed as Parameters<typeof updatePlannedSession>[2]),
    ...(patchedSport && !effectiveSport ? { endurancePrescription: Prisma.DbNull } : {}),
    ...(clearGarminPush ?? {}),
  });
}

/**
 * Validates and applies a patch to one of the athlete's planned sessions, with its decision
 * action and side effects. Shared by PATCH and the coach adjustment's apply route.
 */
export async function patchPlannedSessionFromBody(
  athleteId: string,
  id: string,
  body: unknown,
): Promise<{ response: NextResponse } | { session: unknown }> {
  const validation = await validatePatchRequest(athleteId, id, body);
  if (!validation.ok) {
    return { response: validation.response };
  }

  const { decisionId, parsed, existing } = validation;
  const session = await applyPlannedSessionPatch(athleteId, id, parsed, existing);
  if (!session) {
    return {
      response: NextResponse.json({ error: 'Séance planifiée introuvable' }, { status: 404 }),
    };
  }

  await recordPlannedSessionDecisionAction({
    athleteId,
    sessionId: id,
    decisionId,
    existing,
    patch: parsed,
  });

  // Context refresh + Google push are independent best-effort side effects.
  await Promise.all([
    refreshAndPersistPlannedSessionContext(athleteId, id).catch((ctxError) => {
      console.error('[planned-sessions/context]', ctxError);
    }),
    pushSessionToGoogle(session).catch((syncError) => {
      console.error('Push Google Calendar échoué', syncError);
    }),
  ]);

  return { session: (await getPlannedSessionById(athleteId, id)) ?? session };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const patched = await patchPlannedSessionFromBody(athleteId, id, await request.json());
    return 'response' in patched ? patched.response : NextResponse.json(patched.session);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de mettre à jour la séance planifiée' },
      { status: 500 },
    );
  }
}

/** Deletes one of the athlete's planned sessions and its Google event (best-effort). */
export async function deletePlannedSessionWithEvent(athleteId: string, id: string) {
  const existing = await getPlannedSessionById(athleteId, id);
  if (existing?.googleEventId) {
    try {
      await deleteSessionFromGoogle(existing);
    } catch (syncError) {
      console.error('Suppression Google Calendar échouée', syncError);
    }
  }
  await deletePlannedSession(athleteId, id);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    await deletePlannedSessionWithEvent(athleteId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Impossible de supprimer la séance planifiée' },
      { status: 500 },
    );
  }
}
