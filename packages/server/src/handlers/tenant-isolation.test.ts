import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Tenant isolation, against a real Postgres: athlete A calls every `[id]` handler with athlete B's
 * record ids. Each call must answer without B's data and leave B's rows as they were.
 *
 * Runs only when `TENANT_ISOLATION_DATABASE_URL` names a disposable database with the current
 * schema (the suite creates and deletes its two athletes):
 *
 *   docker exec sharpit-webapp-postgres-1 psql -U sharpit -c 'CREATE DATABASE sharpit_tenant_test'
 *   DATABASE_URL=postgresql://sharpit:sharpit@localhost:5432/sharpit_tenant_test yarn api db:push
 *   TENANT_ISOLATION_DATABASE_URL=postgresql://sharpit:sharpit@localhost:5432/sharpit_tenant_test \
 *     yarn workspace @sharpit/server vitest run tenant-isolation
 */
const databaseUrl = process.env.TENANT_ISOLATION_DATABASE_URL;
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

const ATHLETE_A = 'tenant-isolation-a';
const ATHLETE_B = 'tenant-isolation-b';
/** Written into every text field of B's rows: any response carrying it leaked B's data. */
const SECRET = 'TENANT-B-SECRET';

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn(async () => ATHLETE_A),
}));
vi.mock('@sharpit/app/lib/auth/admin', () => ({ isCurrentUserAdmin: vi.fn(async () => false) }));
vi.mock('@sharpit/app/lib/demo/demo-session', () => ({ isDemoSession: vi.fn(async () => false) }));
vi.mock('@sharpit/server/lib/privacy/consent-store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireAiProcessingConsent: vi.fn(async () => null),
}));
vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => ({
  pushSessionToGoogle: vi.fn(),
  deleteSessionFromGoogle: vi.fn(),
  pushBrickToGoogleInBackground: vi.fn(),
}));
vi.mock('@sharpit/app/lib/next/await-request', () => ({ awaitRequest: vi.fn() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

type Ids = Record<
  | 'activity'
  | 'goal'
  | 'plannedSession'
  | 'physicalNote'
  | 'conversation'
  | 'foodLogEntry'
  | 'customFood'
  | 'savedMeal'
  | 'trainingPlan'
  | 'travelContext'
  | 'habitExperiment',
  string
>;

let prisma: PrismaClient;
let ids: Ids;

async function seedAthleteB(db: PrismaClient): Promise<Ids> {
  const day = new Date('2026-09-01T00:00:00.000Z');
  const data = { athleteId: ATHLETE_B };
  const [activity, goal, physicalNote, conversation, foodLogEntry, customFood] = await Promise.all([
    db.activity.create({ data: { ...data, type: 'RUN', date: day, title: SECRET } }),
    db.goal.create({ data: { ...data, title: SECRET } }),
    db.physicalNote.create({ data: { ...data, title: SECRET, description: SECRET } }),
    db.conversation.create({
      data: {
        ...data,
        title: SECRET,
        messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: SECRET }] }],
      },
    }),
    db.foodLogEntry.create({
      data: {
        ...data,
        date: day,
        meal: 'LUNCH',
        name: SECRET,
        grams: 100,
        kcal: 1,
        protein: 1,
        carbs: 1,
        fat: 1,
      },
    }),
    db.foodProduct.create({
      data: {
        source: 'CUSTOM',
        ownerId: ATHLETE_B,
        name: SECRET,
        kcalPer100g: 100,
        proteinPer100g: 1,
        carbsPer100g: 1,
        fatPer100g: 1,
      },
    }),
  ]);
  const [plannedSession, savedMeal, trainingPlan, travelContext, habitExperiment] =
    await Promise.all([
      db.plannedSession.create({ data: { ...data, type: 'RUN', date: day, title: SECRET } }),
      db.savedMeal.create({
        data: {
          ...data,
          name: SECRET,
          items: [
            { name: SECRET, grams: 100, kcal: 1, protein: 1, carbs: 1, fat: 1, productId: null },
          ],
        },
      }),
      db.trainingPlan.create({ data: { ...data, raceDate: day, startDate: day } }),
      db.athleteTravelContext.create({
        data: { ...data, startDate: day, endDate: day, note: SECRET },
      }),
      db.journalHabitExperiment.create({
        data: { ...data, factorId: 'alcohol', intent: 'REMOVE', startDayId: '2026-09-01' },
      }),
    ]);
  return {
    activity: activity.id,
    goal: goal.id,
    plannedSession: plannedSession.id,
    physicalNote: physicalNote.id,
    conversation: conversation.id,
    foodLogEntry: foodLogEntry.id,
    customFood: customFood.id,
    savedMeal: savedMeal.id,
    trainingPlan: trainingPlan.id,
    travelContext: travelContext.id,
    habitExperiment: habitExperiment.id,
  };
}

/** Every row of B the suite seeded, as stored: compared before and after each call. */
async function snapshotB(db: PrismaClient) {
  const where = { athleteId: ATHLETE_B };
  return Promise.all([
    db.athleteProfile.findUnique({ where: { id: ATHLETE_B } }),
    db.activity.findMany({ where }),
    db.goal.findMany({ where }),
    db.plannedSession.findMany({ where }),
    db.physicalNote.findMany({ where, include: { checkins: true } }),
    db.conversation.findMany({ where }),
    db.foodLogEntry.findMany({ where }),
    db.foodProduct.findMany({ where: { ownerId: ATHLETE_B } }),
    db.savedMeal.findMany({ where }),
    db.trainingPlan.findMany({ where }),
    db.athleteTravelContext.findMany({ where }),
    db.journalHabitExperiment.findMany({ where }),
  ]);
}

type Call = {
  name: string;
  route: () => Promise<Record<string, unknown>>;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  param?: string;
  id: (ids: Ids) => string;
  body?: unknown;
};

const calls: Call[] = [
  ...(['GET', 'PATCH', 'DELETE'] as const).map((method) => ({
    name: `activities/[id] ${method}`,
    route: () => import('./activities/[id]/handler'),
    method,
    id: (i: Ids) => i.activity,
    body: { title: 'hijacked' },
  })),
  {
    name: 'activities/[id]/streams GET',
    route: () => import('./activities/[id]/streams/handler'),
    method: 'GET',
    id: (i) => i.activity,
  },
  {
    name: 'activities/[id]/multisport-streams GET',
    route: () => import('./activities/[id]/multisport-streams/handler'),
    method: 'GET',
    id: (i) => i.activity,
  },
  {
    name: 'activities/[id]/narrative POST',
    route: () => import('./activities/[id]/narrative/handler'),
    method: 'POST',
    id: (i) => i.activity,
    body: {},
  },
  {
    name: 'web/activity-detail/[id] GET',
    route: () => import('./web/activity-detail/[id]/handler'),
    method: 'GET',
    id: (i) => i.activity,
  },
  {
    name: 'admin/athletes/[id]/tier PATCH',
    route: () => import('./admin/athletes/[id]/tier/handler'),
    method: 'PATCH',
    id: () => ATHLETE_B,
    body: { tier: 'PRO' },
  },
  ...(['GET', 'PATCH', 'DELETE'] as const).map((method) => ({
    name: `coach-memory/[id] ${method}`,
    route: () => import('./coach-memory/[id]/handler'),
    method,
    id: (i: Ids) => i.travelContext,
    body: { note: 'hijacked' },
  })),
  ...(['GET', 'PUT', 'PATCH', 'DELETE'] as const).map((method) => ({
    name: `coach/conversations/[id] ${method}`,
    route: () => import('./coach/conversations/[id]/handler'),
    method,
    id: (i: Ids) => i.conversation,
    body:
      method === 'PUT'
        ? { messages: [{ id: 'x', role: 'user', parts: [{ type: 'text', text: 'hijacked' }] }] }
        : { title: 'hijacked' },
  })),
  ...(['PATCH', 'DELETE'] as const).map((method) => ({
    name: `food-log/[id] ${method}`,
    route: () => import('./food-log/[id]/handler'),
    method,
    id: (i: Ids) => i.foodLogEntry,
    body: { grams: 1 },
  })),
  ...(['PATCH', 'DELETE'] as const).map((method) => ({
    name: `food-log/foods/[id] ${method}`,
    route: () => import('./food-log/foods/[id]/handler'),
    method,
    id: (i: Ids) => i.customFood,
    body: { name: 'hijacked' },
  })),
  {
    name: 'food-log/meals/[id] DELETE',
    route: () => import('./food-log/meals/[id]/handler'),
    method: 'DELETE',
    id: (i) => i.savedMeal,
  },
  {
    name: 'food-log/meals/[id]/log POST',
    route: () => import('./food-log/meals/[id]/log/handler'),
    method: 'POST',
    id: (i) => i.savedMeal,
    body: { trainingDayId: '2026-09-02', meal: 'LUNCH' },
  },
  {
    name: 'food-log/recipes/[id] PUT',
    route: () => import('./food-log/recipes/[id]/handler'),
    method: 'PUT',
    id: (i) => i.customFood,
    body: {
      name: 'hijacked',
      servings: 1,
      items: [{ name: 'x', grams: 1, kcal: 1, protein: 1, carbs: 1, fat: 1 }],
    },
  },
  ...(['GET', 'PATCH', 'DELETE'] as const).map((method) => ({
    name: `goals/[id] ${method}`,
    route: () => import('./goals/[id]/handler'),
    method,
    id: (i: Ids) => i.goal,
    body: { title: 'hijacked' },
  })),
  {
    name: 'journal/habit-experiments/[id] PATCH',
    route: () => import('./journal/habit-experiments/[id]/handler'),
    method: 'PATCH',
    id: (i) => i.habitExperiment,
    body: {},
  },
  {
    name: 'physical-notes/[id]/checkins POST',
    route: () => import('./physical-notes/[id]/checkins/handler'),
    method: 'POST',
    id: (i) => i.physicalNote,
    body: { severity: 3, comment: 'hijacked' },
  },
  ...(['PATCH', 'DELETE'] as const).map((method) => ({
    name: `physical-notes/[id] ${method}`,
    route: () => import('./physical-notes/[id]/handler'),
    method,
    id: (i: Ids) => i.physicalNote,
    body: { title: 'hijacked' },
  })),
  {
    name: 'planned-sessions/[id]/analyze POST',
    route: () => import('./planned-sessions/[id]/analyze/handler'),
    method: 'POST',
    id: (i) => i.plannedSession,
    body: {},
  },
  ...(['GET', 'PATCH', 'DELETE'] as const).map((method) => ({
    name: `planned-sessions/[id] ${method}`,
    route: () => import('./planned-sessions/[id]/handler'),
    method,
    id: (i: Ids) => i.plannedSession,
    body: { title: 'hijacked' },
  })),
  {
    name: 'planned-sessions/[id]/link POST (B session)',
    route: () => import('./planned-sessions/[id]/link/handler'),
    method: 'POST',
    id: (i) => i.plannedSession,
    body: { activityId: null },
  },
  {
    name: 'presentation/planned-session/[id] GET',
    route: () => import('./presentation/planned-session/[id]/handler'),
    method: 'GET',
    id: (i) => i.plannedSession,
  },
  {
    name: 'presentation/session-rationale/[plannedSessionId] GET',
    route: () => import('./presentation/session-rationale/[plannedSessionId]/handler'),
    method: 'GET',
    param: 'plannedSessionId',
    id: (i) => i.plannedSession,
  },
  {
    name: 'training-plans/[id] DELETE',
    route: () => import('./training-plans/[id]/handler'),
    method: 'DELETE',
    id: (i) => i.trainingPlan,
  },
  {
    name: 'travel-context/[id] DELETE',
    route: () => import('./travel-context/[id]/handler'),
    method: 'DELETE',
    id: (i) => i.travelContext,
  },
];

async function invoke(call: Call): Promise<{ status: number; text: string }> {
  const { NextRequest } = await import('next/server');
  const id = call.id(ids);
  const handler = (await call.route())[call.method] as (
    request: InstanceType<typeof NextRequest>,
    context: { params: Promise<Record<string, string>> },
  ) => Promise<Response>;
  const request = new NextRequest(`http://localhost/api/tenant-isolation/${id}`, {
    method: call.method,
    ...(call.body !== undefined && call.method !== 'GET'
      ? { body: JSON.stringify(call.body) }
      : {}),
  });
  const response = await handler(request, {
    params: Promise.resolve({ [call.param ?? 'id']: id }),
  });
  return { status: response.status, text: await response.text() };
}

describe.skipIf(!databaseUrl)("tenant isolation: athlete A against B's records", () => {
  beforeAll(async () => {
    ({ prisma } = await import('@sharpit/db/client'));
    await prisma.athleteProfile.deleteMany({ where: { id: { in: [ATHLETE_A, ATHLETE_B] } } });
    await prisma.athleteProfile.createMany({
      data: [
        { id: ATHLETE_A, clerkUserId: ATHLETE_A },
        { id: ATHLETE_B, clerkUserId: ATHLETE_B },
      ],
    });
    // A owns an activity of its own, so a link to B's planned session is a real attempt.
    await prisma.activity.create({
      data: { athleteId: ATHLETE_A, type: 'RUN', date: new Date('2026-09-01T00:00:00.000Z') },
    });
    ids = await seedAthleteB(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.foodProduct.deleteMany({ where: { ownerId: { in: [ATHLETE_A, ATHLETE_B] } } });
    await prisma?.athleteProfile.deleteMany({ where: { id: { in: [ATHLETE_A, ATHLETE_B] } } });
    await prisma?.$disconnect();
  });

  it.each(calls.map((call) => [call.name, call] as const))(
    '%s neither reveals nor changes B’s data',
    async (_name, call) => {
      const before = await snapshotB(prisma);
      const { status, text } = await invoke(call);
      expect(text).not.toContain(SECRET);
      expect(await snapshotB(prisma)).toEqual(before);
      // Writes may answer an idempotent no-op (a delete of nothing); a read must not find it
      // (404, or 503 for streams, which cannot tell « not yours » from « not fetched yet »).
      if (call.method === 'GET') {
        expect([404, 503]).toContain(status);
      }
    },
    30_000,
  );

  it("refuses to link A's planned session to B's activity", async () => {
    const own = await prisma.plannedSession.create({
      data: { athleteId: ATHLETE_A, type: 'RUN', date: new Date('2026-09-01T00:00:00.000Z') },
    });
    const { POST } = await import('./planned-sessions/[id]/link/handler');
    const { NextRequest } = await import('next/server');
    const response = await POST(
      new NextRequest('http://localhost/api/planned-sessions/link', {
        method: 'POST',
        body: JSON.stringify({ activityId: ids.activity }),
      }),
      { params: Promise.resolve({ id: own.id }) },
    );
    expect(response.status).toBe(404);
    const stored = await prisma.plannedSession.findUnique({ where: { id: own.id } });
    expect(stored?.activityId).toBeNull();
  });
});
