import { NextRequest, NextResponse } from 'next/server';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { requirePro } from '@sharpit/server/lib/access/require-pro';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { analyzeBrick } from '@sharpit/server/lib/coach/plan/coach-analysis';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import { getBrickAnalysis, getBrickSessions, setBrickAnalysis } from '@sharpit/server/lib/queries';

function readBrickGroupId(body: unknown) {
  return typeof (body as { brickGroupId?: unknown })?.brickGroupId === 'string'
    ? (body as { brickGroupId: string }).brickGroupId
    : null;
}

async function validateBrickLegs(athleteId: string, groupId: string) {
  const legs = await getBrickSessions(athleteId, groupId);
  if (legs.length < 2) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Brick introuvable ou incomplet' }, { status: 404 }),
    };
  }
  if (legs.some((l) => !l.activity)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error:
            "Lie d'abord chaque sport du brick à son activité réalisée avant d'analyser l'enchaînement.",
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true as const, legs };
}

export async function GET(request: NextRequest) {
  // Read search params before try so Cache Components prerender interrupts propagate.
  const groupId = request.nextUrl.searchParams.get('groupId');
  if (!groupId) {
    return NextResponse.json({ error: 'groupId requis' }, { status: 400 });
  }

  try {
    const athleteId = await getCurrentAthleteId();
    const analysis = await getBrickAnalysis(athleteId, groupId);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('[brick/analyze][GET]', error);
    return NextResponse.json({ error: "Impossible de charger l'analyse" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isCoachConfigured()) {
      return NextResponse.json(
        { error: 'Coach IA non configuré. Ajoute AI_GATEWAY_API_KEY dans .env.' },
        { status: 503 },
      );
    }

    const athleteId = await getCurrentAthleteId();
    const proBlocked = await requirePro(athleteId);
    if (proBlocked) {
      return proBlocked;
    }
    const body = await request.json().catch(() => ({}));
    const groupId = readBrickGroupId(body);
    if (!groupId) {
      return NextResponse.json({ error: 'brickGroupId requis' }, { status: 400 });
    }

    const validation = await validateBrickLegs(athleteId, groupId);
    if (!validation.ok) {
      return validation.response;
    }

    const rateLimit = await checkRateLimit(rateLimiters.sessionAnalyze, athleteId, {
      failClosed: true,
    });
    if (!rateLimit.ok) {
      const limited = rateLimitJsonResponse(rateLimit);
      return NextResponse.json(limited.body, {
        status: limited.status,
      });
    }

    const analysis = await analyzeBrick(athleteId, groupId);
    if (!analysis) {
      return NextResponse.json({ error: 'Analyse impossible' }, { status: 500 });
    }

    const saved = await setBrickAnalysis(athleteId, groupId, analysis);
    return NextResponse.json({ analysis: saved });
  } catch (error) {
    console.error('[brick/analyze][POST]', error);
    return NextResponse.json({ error: "L'analyse du brick a échoué" }, { status: 500 });
  }
}
