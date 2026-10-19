import { NextRequest, NextResponse, after } from 'next/server';
import { isCoachConfigured } from '@sharpit/server/lib/ai';
import { requirePro } from '@sharpit/server/lib/access/require-pro';
import { withAnalysisRun } from '@sharpit/server/lib/analysis/analysis-run-store';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { analyzePlannedSession } from '@sharpit/server/lib/coach/plan/coach-analysis';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import { getPlannedSessionById, setPlannedSessionAnalysis } from '@sharpit/server/lib/queries';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Schedules the compliance analysis and returns immediately (ADR-036).
 *
 * The model call used to block this request: leaving the page abandoned it, and
 * a failure surfaced only as a page that polled forever. The run now carries the
 * outcome, and the shell watcher announces it — success or failure.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

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
    const existing = await getPlannedSessionById(athleteId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Séance planifiée introuvable' }, { status: 404 });
    }
    if (!existing.activity) {
      return NextResponse.json({ error: 'Aucune activité liée à analyser' }, { status: 400 });
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

    after(async () => {
      try {
        await withAnalysisRun({ athleteId, kind: 'SESSION_COMPLIANCE', targetId: id }, async () => {
          const analysis = await analyzePlannedSession(athleteId, id);
          if (!analysis) {
            throw new Error('Analyse impossible');
          }
          await setPlannedSessionAnalysis(athleteId, id, analysis);
        });
      } catch (error) {
        console.error('[planned-sessions/analyze]', id, error);
      }
    });

    return NextResponse.json({ ok: true, status: 'scheduled' }, { status: 202 });
  } catch (error) {
    console.error('[planned-sessions/analyze]', error);
    return NextResponse.json({ error: "Impossible de lancer l'analyse" }, { status: 500 });
  }
}
