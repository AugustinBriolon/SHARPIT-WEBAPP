import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import {
  generatePlan,
  preparePlanRequest,
  type PlanPayload,
} from '@sharpit/server/handlers/coach/plan/handler';
import {
  createPlanJob,
  getLatestPlanJob,
  getPlanJob,
  isPlanJobStoreConfigured,
  updatePlanJob,
} from '@sharpit/server/lib/coach/plan/plan-jobs';
import {
  coachGenerationErrorDetails,
  planGenerationErrorMessage,
} from '@sharpit/server/lib/coach/plan/plan-generation-errors';
import { sendPushToAthlete } from '@sharpit/server/lib/push/athlete-push';

/** What the app opens on the notification's tap: Plan, with its generator. */
export const PLAN_READY_PATH = '/plan/generator';

/** Drafts are written at most this often: Redis is not a stream. */
const DRAFT_WRITE_INTERVAL_MS = 1_500;

function draftSessions(partial: unknown): unknown[] {
  const sessions = (partial as { sessions?: unknown })?.sessions;
  return Array.isArray(sessions) ? sessions : [];
}

async function tellAthleteTheWeekIsReady(athleteId: string, plan: PlanPayload) {
  const count = plan.sessions.length;
  const delivery = await sendPushToAthlete(athleteId, {
    aps: {
      alert: {
        title: 'Ta semaine est prête',
        body: `J’ai préparé ${count} séance${count > 1 ? 's' : ''} pour toi. Jette un œil et garde celles qui te vont.`,
      },
      sound: 'default',
      'thread-id': 'plan-generation',
      category: 'PLAN_WEEK_READY',
    },
    url: PLAN_READY_PATH,
  }).catch((error) => {
    console.error('[coach/plan/jobs] push', error);
    return null;
  });
  console.info('[coach/plan/jobs] week ready push', delivery);
}

/**
 * Starts a week in the background and answers at once with its id. The generation runs after
 * the response (`after`), writing its drafts, then the week or the failure, where the app reads
 * them back — so leaving the app loses nothing, and a push says when the week is ready.
 */
export async function POST(req: NextRequest) {
  if (!isPlanJobStoreConfigured()) {
    return NextResponse.json(
      { error: 'Génération en arrière-plan indisponible.' },
      { status: 503 },
    );
  }
  const request = await preparePlanRequest(req);
  if (!request.ok) {
    return request.response;
  }
  const { athleteId, prepared } = request;
  const job = await createPlanJob(athleteId, prepared.goalId ?? null);

  after(async () => {
    let lastWrite = 0;
    try {
      const plan = await generatePlan(athleteId, prepared, {
        onPartial: (partial) => {
          const now = Date.now();
          if (now - lastWrite < DRAFT_WRITE_INTERVAL_MS) {
            return;
          }
          lastWrite = now;
          void updatePlanJob(athleteId, job.id, { drafts: draftSessions(partial) });
        },
      });
      await updatePlanJob(athleteId, job.id, { status: 'ready', plan, drafts: plan.sessions });
      await tellAthleteTheWeekIsReady(athleteId, plan);
    } catch (error) {
      const details = coachGenerationErrorDetails(error);
      console.error('[coach/plan/jobs]', error, details ? { zod: details } : undefined);
      await updatePlanJob(athleteId, job.id, {
        status: 'failed',
        error: planGenerationErrorMessage(error),
      });
    }
  });

  return NextResponse.json({ job }, { status: 202 });
}

/** The athlete's latest generation, to pick up after the app was closed. */
export async function GET() {
  const athleteId = await getCurrentAthleteId();
  return NextResponse.json({ job: await getLatestPlanJob(athleteId) });
}

export async function getJob(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const athleteId = await getCurrentAthleteId();
  const { id } = await params;
  const job = await getPlanJob(athleteId, id);
  return job
    ? NextResponse.json({ job })
    : NextResponse.json({ error: 'Génération introuvable.' }, { status: 404 });
}
