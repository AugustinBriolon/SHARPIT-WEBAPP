import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { runActivityNarrativeAnalysis } from '@sharpit/server/lib/activity/narrative/activity-narrative';
import { canGenerateNarrativeForActivity } from '@sharpit/server/lib/access/narrative-trial';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import { requireAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import { prisma } from '@sharpit/db/client';
import { getActivityById } from '@sharpit/server/lib/queries';
import { loadRaceAnalysis } from '@sharpit/server/lib/activity/multisport/load-race-analysis';
import { narrativeReadsActivityType } from '@sharpit/app/lib/activity/narrative/activity-narrative-config';

type RouteContext = { params: Promise<{ id: string }> };

const narrativeRequestSchema = z.object({
  force: z.boolean().optional(),
  wait: z.boolean().optional(),
});

async function checkNarrativeRateLimit(
  athleteId: string,
  activityId: string,
): Promise<NextResponse | null> {
  const rateLimit = await checkRateLimit(
    rateLimiters.activityNarrative,
    `${athleteId}:${activityId}`,
    { failClosed: true },
  );
  if (rateLimit.ok) {
    return null;
  }
  const limited = rateLimitJsonResponse(rateLimit);
  return NextResponse.json(limited.body, { status: limited.status });
}

// The athlete asked for it: the today-only rule and the endurance-only list are for the
// automatic ingest path, not this one.
function narrativeOptions(force: boolean) {
  return { force, allowHistorical: true, onRequest: true };
}

async function runNarrativeAndRespond(athleteId: string, id: string, force: boolean) {
  const ok = await runActivityNarrativeAnalysis(athleteId, id, narrativeOptions(force));
  if (!ok) {
    return NextResponse.json({ error: 'Synthèse impossible' }, { status: 500 });
  }
  // Same shape as GET /activities/[id]: the client swaps its whole detail for this answer.
  const activity = await getActivityById(athleteId, id);
  if (!activity) {
    return NextResponse.json({ error: 'Activité introuvable' }, { status: 404 });
  }
  return NextResponse.json({
    ...activity,
    raceAnalysis: await loadRaceAnalysis(athleteId, activity, { cacheOnly: true }),
  });
}

async function validateNarrativePost(
  athleteId: string,
  id: string,
  request: NextRequest,
): Promise<{ force: boolean; wait: boolean; activityDate: Date } | NextResponse> {
  if (!isCoachConfigured()) {
    return NextResponse.json(
      { error: 'Coach IA non configuré. Ajoute AI_GATEWAY_API_KEY dans .env.' },
      { status: 503 },
    );
  }

  const existing = await prisma.activity.findFirst({
    where: { id, athleteId },
    select: { id: true, date: true, type: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Activité introuvable' }, { status: 404 });
  }
  if (!narrativeReadsActivityType(existing.type, true)) {
    return NextResponse.json(
      { error: 'Le coach ne sait pas encore analyser ce type de séance.' },
      { status: 422 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = narrativeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
  }

  return {
    force: parsed.data.force ?? false,
    wait: parsed.data.wait ?? false,
    activityDate: existing.date,
  };
}

/** Generate or refresh the coach narrative for an activity (survives client leave via after). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const aiBlocked = await requireAiProcessingConsent(athleteId);
    if (aiBlocked) {
      return aiBlocked;
    }
    const validated = await validateNarrativePost(athleteId, id, request);
    if (validated instanceof NextResponse) {
      return validated;
    }
    const { force, wait, activityDate } = validated;

    // Pre-check so a FREE athlete outside their free window (old activity, or
    // already used today's free analysis) gets a clean "locked" response
    // instead of a generic 500 from deep inside runActivityNarrativeAnalysis.
    const access = await canGenerateNarrativeForActivity(athleteId, activityDate);
    if (!access.allowed) {
      return NextResponse.json({ error: 'locked' }, { status: 402 });
    }

    // A real re-roll (force) is rate-limited per activity — the auto-triggered,
    // non-force path (new imports) is unaffected.
    if (force) {
      const limited = await checkNarrativeRateLimit(athleteId, id);
      if (limited) {
        return limited;
      }
    }

    if (wait) {
      return runNarrativeAndRespond(athleteId, id, force);
    }

    after(async () => {
      try {
        await runActivityNarrativeAnalysis(athleteId, id, narrativeOptions(force));
      } catch (error) {
        console.error('[activities/narrative]', id, error);
      }
    });

    return NextResponse.json({ ok: true, status: 'scheduled' });
  } catch (error) {
    console.error('[activities/narrative]', error);
    return NextResponse.json({ error: 'Impossible de lancer la synthèse' }, { status: 500 });
  }
}
