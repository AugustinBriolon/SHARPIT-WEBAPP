import { NextRequest, NextResponse, after } from 'next/server';
import { enrichActivityObservedContext } from '@sharpit/server/lib/activity/detail/enrich-observed-context';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { analyzeLinkedPlannedSessions } from '@sharpit/server/lib/planned-session/linking/session-linking';
import { prisma } from '@sharpit/db/client';
import { getPlannedSessionById, linkPlannedSessionActivity } from '@sharpit/server/lib/queries';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Link responds immediately. Compliance analysis runs in `after()` so it survives
 * the client leaving the page — no dependency on a live browser tab.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const athleteId = await getCurrentAthleteId();
    const body = await request.json().catch(() => ({}));
    const activityId: string | null = body?.activityId ?? null;

    const existing = await getPlannedSessionById(athleteId, id);
    if (!existing) {
      return NextResponse.json({ error: 'Séance planifiée introuvable' }, { status: 404 });
    }

    const session = await linkPlannedSessionActivity(athleteId, id, activityId);
    if (!session) {
      return NextResponse.json({ error: 'Activité introuvable' }, { status: 404 });
    }
    if (activityId) {
      after(async () => {
        try {
          await enrichActivityObservedContext(prisma, athleteId, activityId);
        } catch (error) {
          console.error('[planned-sessions/link/enrich]', error);
        }
        await analyzeLinkedPlannedSessions(athleteId, [id]);
      });
    }
    return NextResponse.json(session);
  } catch (error) {
    console.error('[planned-sessions/link]', error);
    return NextResponse.json({ error: 'Impossible de lier la séance' }, { status: 500 });
  }
}
