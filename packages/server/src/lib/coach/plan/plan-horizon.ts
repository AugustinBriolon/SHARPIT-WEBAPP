import { prisma } from '@sharpit/db/client';
import { dayKeyFromDate } from '@sharpit/app/lib/date/day-key';
import { todayIsoDate } from '@sharpit/app/lib/health/activity-status';
import {
  generatePlan,
  prepareScheduledPlan,
  type PlanPayload,
} from '@sharpit/server/handlers/coach/plan/handler';
import {
  insertGeneratedWeek,
  parseGeneratedWeek,
} from '@sharpit/server/handlers/coach/plan/insert/handler';
import {
  createPlanJob,
  getPlanJob,
  updatePlanJob,
  type PlanJob,
} from '@sharpit/server/lib/coach/plan/plan-jobs';
import {
  planHorizonStep,
  type PlanHorizonState,
  type PlanHorizonStep,
} from '@sharpit/server/lib/coach/plan/plan-horizon-step';
import { getActivityStatusStoreDb } from '@sharpit/server/lib/health/activity-status-service';
import { resolveNotificationPrefs } from '@sharpit/server/lib/notifications/notification-prefs';
import { athleteHasAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import { sendPushToAthlete } from '@sharpit/server/lib/push/athlete-push';
import { redis } from '@sharpit/server/lib/redis';

/** The automatic week lives until it starts: three days to look, a little more for safety. */
const HORIZON_TTL_SECONDS = 5 * 24 * 3600;
const WEEK_DAYS = 7;
/** Where a tap on the horizon's pushes lands: Plan, with the generator holding the week. */
const GENERATOR_PATH = '/plan/generator';
const PLAN_PATH = '/plan';

const stateKey = (athleteId: string) => `plan-horizon:${athleteId}`;

async function readState(athleteId: string): Promise<PlanHorizonState | null> {
  return redis ? redis.get<PlanHorizonState>(stateKey(athleteId)) : null;
}

async function writeState(athleteId: string, state: PlanHorizonState): Promise<void> {
  await redis?.set(stateKey(athleteId), state, { ex: HORIZON_TTL_SECONDS });
}

/** Athletes the horizon looks after: a plan still running toward its race. */
async function athletesWithRunningPlan(today: string): Promise<string[]> {
  const plans = await prisma.trainingPlan.findMany({
    where: { status: 'ACTIVE', raceDate: { gte: new Date(`${today}T00:00:00Z`) } },
    select: { athleteId: true },
    distinct: ['athleteId'],
  });
  return plans.map((plan) => plan.athleteId);
}

async function lastPlannedDay(athleteId: string, today: string): Promise<string | null> {
  const last = await prisma.plannedSession.findFirst({
    where: { athleteId, date: { gte: new Date(`${today}T00:00:00Z`) } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  return last ? dayKeyFromDate(last.date) : null;
}

/** The macro week the new week falls in: its load, phase and focus steer the coach. */
async function macroWeekFor(athleteId: string, startDate: string) {
  const plan = await prisma.trainingPlan.findFirst({
    where: { athleteId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: {
      goalId: true,
      weeks: {
        where: { weekStart: { lte: new Date(`${startDate}T00:00:00Z`) } },
        orderBy: { weekStart: 'desc' },
        take: 1,
        select: { targetLoad: true, phase: true, focus: true },
      },
    },
  });
  const week = plan?.weeks[0];
  return {
    goalId: plan?.goalId ?? null,
    targetLoad: week?.targetLoad ?? null,
    planPhase: week?.phase ?? null,
    planFocus: week?.focus ?? null,
  };
}

async function mayNotify(athleteId: string): Promise<boolean> {
  const profile = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { notificationPrefs: true },
  });
  return resolveNotificationPrefs(profile?.notificationPrefs).sessionReminder;
}

async function push(athleteId: string, title: string, body: string, url: string) {
  if (!(await mayNotify(athleteId))) {
    return;
  }
  await sendPushToAthlete(athleteId, {
    aps: { alert: { title, body }, sound: 'default', 'thread-id': 'plan-horizon' },
    url,
  }).catch((error) => console.error('[plan-horizon] push', error));
}

function frenchDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function sessionsWord(count: number): string {
  return `${count} séance${count > 1 ? 's' : ''}`;
}

async function generateWeek(athleteId: string, startDate: string): Promise<void> {
  const macro = await macroWeekFor(athleteId, startDate);
  const prepared = await prepareScheduledPlan(athleteId, {
    startDate: new Date(`${startDate}T00:00:00`),
    days: WEEK_DAYS,
    goalId: macro.goalId,
    targetLoad: macro.targetLoad,
    planPhase: macro.planPhase,
    planFocus: macro.planFocus,
  });
  const job = await createPlanJob(athleteId, macro.goalId, { ttlSeconds: HORIZON_TTL_SECONDS });
  await writeState(athleteId, { jobId: job.id, startDate, remindedAt: null, appliedAt: null });
  try {
    const plan = await generatePlan(athleteId, prepared, { onPartial: () => {} }, 'autoplan');
    await updatePlanJob(athleteId, job.id, { status: 'ready', plan, drafts: plan.sessions });
    await push(
      athleteId,
      'Ta semaine est prête',
      `Ton plan arrive au bout : j’ai préparé ${sessionsWord(plan.sessions.length)} à partir de ${frenchDay(startDate)}. Garde celles qui te vont.`,
      GENERATOR_PATH,
    );
  } catch (error) {
    console.error('[plan-horizon] generate', athleteId, error);
    await updatePlanJob(athleteId, job.id, { status: 'failed', error: 'generation failed' });
  }
}

async function applyWeek(athleteId: string, state: PlanHorizonState, job: PlanJob): Promise<void> {
  const plan = job.plan as PlanPayload | null;
  const body = parseGeneratedWeek({ goalId: job.goalId, sessions: plan?.sessions ?? [] });
  if (!body) {
    console.error('[plan-horizon] apply: unreadable week', athleteId, job.id);
    return;
  }
  const inserted = await insertGeneratedWeek(athleteId, body);
  if ('response' in inserted) {
    console.error('[plan-horizon] apply refused', athleteId, inserted.response.status);
    return;
  }
  await writeState(athleteId, { ...state, appliedAt: new Date().toISOString() });
  await push(
    athleteId,
    'Ta semaine est dans ton plan',
    `J’ai ajouté les ${sessionsWord(inserted.ids.length)} de la semaine telles que je les avais proposées. Tu peux les ajuster dans Plan.`,
    PLAN_PATH,
  );
}

async function remind(athleteId: string, state: PlanHorizonState): Promise<void> {
  await writeState(athleteId, { ...state, remindedAt: new Date().toISOString() });
  await push(
    athleteId,
    'Ta semaine t’attend',
    `Elle commence ${frenchDay(state.startDate)}. Garde les séances qui te vont, sinon je l’ajoute telle quelle demain.`,
    GENERATOR_PATH,
  );
}

async function weekAlreadyPlanned(
  athleteId: string,
  state: PlanHorizonState | null,
): Promise<boolean> {
  if (!state) {
    return false;
  }
  const count = await prisma.plannedSession.count({
    where: { athleteId, date: { gte: new Date(`${state.startDate}T00:00:00Z`) } },
  });
  return count > 0;
}

/** Reads one athlete's facts and takes today's step; never throws past one athlete. */
export async function runPlanHorizonFor(
  athleteId: string,
  today: string,
): Promise<PlanHorizonStep['kind'] | 'skipped'> {
  const status = await getActivityStatusStoreDb(prisma, athleteId, today);
  if (status.status !== 'active' || !(await athleteHasAiProcessingConsent(athleteId))) {
    return 'skipped';
  }
  const [last, state] = await Promise.all([lastPlannedDay(athleteId, today), readState(athleteId)]);
  const job = state ? await getPlanJob(athleteId, state.jobId) : null;
  const step = planHorizonStep({
    today,
    lastPlannedDay: last,
    state,
    jobStatus: job?.status ?? null,
    weekAlreadyPlanned: await weekAlreadyPlanned(athleteId, state),
  });
  switch (step.kind) {
    case 'generate':
      await generateWeek(athleteId, step.startDate);
      break;
    case 'remind':
      await remind(athleteId, state!);
      break;
    case 'apply':
      await applyWeek(athleteId, state!, job!);
      break;
    case 'none':
      break;
  }
  return step.kind;
}

/** The daily pass: every athlete with a running plan, one at a time (each may ask the coach). */
export async function runPlanHorizon(now: Date = new Date()) {
  const today = todayIsoDate(now);
  const summary: Record<string, number> = {};
  for (const athleteId of await athletesWithRunningPlan(today)) {
    const kind = await runPlanHorizonFor(athleteId, today).catch((error) => {
      console.error('[plan-horizon]', athleteId, error);
      return 'error' as const;
    });
    summary[kind] = (summary[kind] ?? 0) + 1;
  }
  return summary;
}

/** What Résumé says about the plan's end: a written week waiting, or nothing to say. */
export type PlanHorizonView = { startDate: string; sessionCount: number } | null;

export async function readPlanHorizonView(
  athleteId: string,
  today: string = todayIsoDate(),
): Promise<PlanHorizonView> {
  const state = await readState(athleteId);
  if (!state || state.appliedAt || state.startDate <= today) {
    return null;
  }
  const [job, planned] = await Promise.all([
    getPlanJob(athleteId, state.jobId),
    weekAlreadyPlanned(athleteId, state),
  ]);
  const plan = job?.status === 'ready' ? (job.plan as PlanPayload | null) : null;
  if (!plan || planned) {
    return null;
  }
  return { startDate: state.startDate, sessionCount: plan.sessions.length };
}
