import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { consumeCoachProgressStream } from '@sharpit/app/lib/coach/chat/transcript/coach-progress-stream';
import type { PlanPayload } from './handler';
import { decisionState, physicalHealthData } from '@sharpit/server/lib/plan-gate/test-fixtures';

vi.mock('@sharpit/server/lib/ai', () => ({
  COACH_MODEL: 'mock-model',
  COACH_REASONING_LEVEL: { structured: 'medium', plan: 'low' },
  coachGatewayOptions: {},
  isCoachConfigured: () => true,
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('default'),
}));

vi.mock('@sharpit/server/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitJsonResponse: vi.fn((result) => ({
    body: { error: 'limited', retryAfterSeconds: result.retryAfterSeconds },
    status: result.cause === 'unavailable' ? 503 : 429,
  })),
  rateLimiters: { coachPlan: {} },
}));

vi.mock('@sharpit/server/lib/coach/stream-structured-generation', () => ({
  runStructuredCoachStream: vi.fn(),
}));

vi.mock('@sharpit/server/lib/coach/context/coach-context', () => ({
  buildCoachContext: vi.fn().mockResolvedValue({ trainingZones: [] }),
  formatCoachContext: () => 'mock coach context',
}));

vi.mock('@sharpit/server/lib/integrations/google/google-sync', () => ({
  getUpcomingBusy: vi.fn().mockResolvedValue([]),
  getGoogleAccount: vi.fn().mockResolvedValue(null),
}));

vi.mock('@sharpit/server/lib/queries', () => ({
  getGoalById: vi.fn().mockResolvedValue(null),
  getActivitiesList: vi.fn().mockResolvedValue([]),
  getPlannedSessions: vi.fn().mockResolvedValue([]),
  getActiveTrainingPlan: vi.fn().mockResolvedValue(null),
  getAthleteProfile: vi.fn().mockResolvedValue(null),
  getTrainingZoneNotes: vi.fn().mockResolvedValue([]),
}));

vi.mock('@sharpit/server/lib/training/pmc/pmc-server', () => ({
  loadAthletePmcAnchor: vi.fn().mockResolvedValue(null),
  loadDailyTrainingStressEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock('@sharpit/server/lib/athlete-state/snapshot-service', () => ({
  getOrBuildAthleteSnapshot: vi.fn(),
}));

vi.mock('@sharpit/server/lib/decision-memory/repository', () => ({
  createCoachingDecision: vi.fn().mockResolvedValue({ id: 'mock-decision-id' }),
}));

// Mocked wholesale — ai-budget.ts imports @/lib/prisma, which must not run here.
// withAiBudgetWarningHeader/aiBudgetResponseBody are trivial, so re-implementing
// them stays truthful without importActual pulling prisma init back in.
vi.mock('@sharpit/server/lib/access/ai-budget', () => ({
  ensureFreeAiBudget: vi
    .fn()
    .mockResolvedValue({ allowed: true, isPro: false, warning: false, retryAfterSeconds: null }),
  aiBudgetResponseBody: (retryAfterSeconds: number) => ({
    error: 'quota_exceeded',
    retryAfterSeconds,
  }),
  withAiBudgetWarningHeader: (headers: Record<string, string>, warning: boolean) =>
    warning ? { ...headers, 'X-Ai-Budget-Warning': '1' } : headers,
  RETRY_AFTER_HEADER: 'Retry-After',
}));

vi.mock('@sharpit/server/lib/privacy/consent-store', () => ({
  requireAiProcessingConsent: vi.fn().mockResolvedValue(null),
  athleteHasAiProcessingConsent: vi.fn().mockResolvedValue(true),
}));

async function importRoute() {
  return await import('./handler');
}

describe('POST /api/coach/plan', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAiProcessingConsent } =
      await import('@sharpit/server/lib/privacy/consent-store');
    vi.mocked(requireAiProcessingConsent).mockResolvedValue(null);
  });

  beforeAll(async () => {
    await importRoute();
  });

  it('takes out a session the Gate rejects before the athlete sees it, keeping its decision', async () => {
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    const { getOrBuildAthleteSnapshot } =
      await import('@sharpit/server/lib/athlete-state/snapshot-service');
    const { createCoachingDecision } =
      await import('@sharpit/server/lib/decision-memory/repository');

    vi.mocked(runStructuredCoachStream).mockResolvedValue({
      output: {
        summary: 'Bloc de reprise',
        sessions: [
          {
            dayOffset: 1,
            startTime: null,
            type: 'RUN',
            intensity: 'THRESHOLD',
            title: 'Seuil',
            description: 'Corps de séance seuil',
            durationMin: 45,
            load: 70,
            rationale: 'Progression',
          },
          {
            dayOffset: 2,
            startTime: null,
            type: 'RUN',
            intensity: 'RECOVERY',
            title: 'Footing très facile',
            description: 'Footing en aisance respiratoire',
            durationMin: 25,
            load: 15,
            rationale: 'Récupérer',
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    } as never);

    vi.mocked(getOrBuildAthleteSnapshot).mockResolvedValue({
      snapshotId: 'snap-1',
      confidence: 0.8,
      decision: decisionState({ overallVerdict: 'RECOVER' }),
      physicalHealth: physicalHealthData(),
      fatigue: { trainingCapacity: 'FULL' },
      todaysDecision: 'RECOVER',
    } as never);

    const { POST } = await importRoute();
    const response = await POST(
      new Request('http://localhost/api/coach/plan', {
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      }),
    );
    const body = await consumeCoachProgressStream<PlanPayload, unknown>(response);

    expect(response.status).toBe(200);
    expect(body.sessions.map((session) => session.title)).toEqual(['Footing très facile']);
    // A proposal opens on the steps it would store, derived here from duration + intensity.
    expect(body.sessions[0].breakdown.derived).toBe(true);
    expect(body.sessions[0].breakdown.steps.length).toBeGreaterThan(0);
    expect(body.gate.sessions).toHaveLength(1);
    expect(body.gate.sessions[0].status).not.toBe('REJECTED');
    // Both proposals are remembered, the rejected one included.
    expect(vi.mocked(createCoachingDecision)).toHaveBeenCalledTimes(2);
  });

  it('accepts a session when nothing in the context conflicts with it', async () => {
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    const { getOrBuildAthleteSnapshot } =
      await import('@sharpit/server/lib/athlete-state/snapshot-service');

    vi.mocked(runStructuredCoachStream).mockResolvedValue({
      output: {
        summary: 'Semaine calme',
        sessions: [
          {
            dayOffset: 1,
            startTime: null,
            type: 'RUN',
            intensity: 'ENDURANCE',
            title: 'Endurance facile',
            description: 'Footing',
            durationMin: 40,
            load: 35,
            rationale: 'Reprise progressive',
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    } as never);

    vi.mocked(getOrBuildAthleteSnapshot).mockResolvedValue({
      snapshotId: 'snap-2',
      confidence: 0.8,
      decision: decisionState(),
      physicalHealth: physicalHealthData(),
      fatigue: { trainingCapacity: 'FULL' },
      todaysDecision: 'TRAIN_SMART',
    } as never);

    const { POST } = await importRoute();
    const response = await POST(
      new Request('http://localhost/api/coach/plan', {
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      }),
    );
    const body = await consumeCoachProgressStream<PlanPayload, unknown>(response);

    expect(response.status).toBe(200);
    expect(body.gate.sessions[0].status).toBe('ACCEPTED');
  });

  it('carries the near-limit warning header when the budget check flags one', async () => {
    const { ensureFreeAiBudget } = await import('@sharpit/server/lib/access/ai-budget');
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    const { getOrBuildAthleteSnapshot } =
      await import('@sharpit/server/lib/athlete-state/snapshot-service');

    vi.mocked(ensureFreeAiBudget).mockResolvedValueOnce({
      allowed: true,
      isPro: false,
      warning: true,
      retryAfterSeconds: null,
    });
    vi.mocked(runStructuredCoachStream).mockResolvedValue({
      output: { summary: 'Semaine calme', sessions: [] },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    } as never);
    vi.mocked(getOrBuildAthleteSnapshot).mockResolvedValue({
      snapshotId: 'snap-3',
      confidence: 0.8,
      decision: decisionState(),
      physicalHealth: physicalHealthData(),
      fatigue: { trainingCapacity: 'FULL' },
      todaysDecision: 'TRAIN_SMART',
    } as never);

    const { POST } = await importRoute();
    const response = await POST(
      new Request('http://localhost/api/coach/plan', {
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      }),
    );

    expect(response.headers.get('X-Ai-Budget-Warning')).toBe('1');
  });

  it('answers 402 with a Retry-After header once the budget is exhausted', async () => {
    const { ensureFreeAiBudget } = await import('@sharpit/server/lib/access/ai-budget');

    vi.mocked(ensureFreeAiBudget).mockResolvedValueOnce({
      allowed: false,
      isPro: false,
      warning: false,
      retryAfterSeconds: 5_400,
    });

    const { POST } = await importRoute();
    const response = await POST(
      new Request('http://localhost/api/coach/plan', {
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(response.headers.get('Retry-After')).toBe('5400');
    expect(body.retryAfterSeconds).toBe(5_400);
  });

  it('carries an authored endurance structure through to the proposal', async () => {
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    const { getOrBuildAthleteSnapshot } =
      await import('@sharpit/server/lib/athlete-state/snapshot-service');
    const { createCoachingDecision } =
      await import('@sharpit/server/lib/decision-memory/repository');

    vi.mocked(runStructuredCoachStream).mockResolvedValue({
      output: {
        summary: 'Bloc seuil',
        sessions: [
          {
            dayOffset: 3,
            startTime: null,
            type: 'RUN',
            intensity: 'THRESHOLD',
            title: '6×1000 m',
            description: 'Séance seuil',
            durationMin: 60,
            load: 75,
            rationale: 'Développer le seuil',
            endurancePrescription: {
              blocks: [
                { steps: [{ kind: 'warmup', minutes: 20 }] },
                {
                  times: 6,
                  steps: [
                    { kind: 'interval', meters: 1000, effort: 'THRESHOLD' },
                    { kind: 'recovery', minutes: 2 },
                  ],
                },
                { steps: [{ kind: 'cooldown', minutes: 10 }] },
              ],
            },
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    } as never);

    vi.mocked(getOrBuildAthleteSnapshot).mockResolvedValue({
      snapshotId: 'snap-4',
      confidence: 0.9,
      decision: decisionState(),
      physicalHealth: physicalHealthData(),
      fatigue: { trainingCapacity: 'FULL' },
      todaysDecision: 'TRAIN_SMART',
    } as never);

    const { POST } = await importRoute();
    const body = await consumeCoachProgressStream<PlanPayload, unknown>(
      await POST(
        new Request('http://localhost/api/coach/plan', {
          method: 'POST',
          body: JSON.stringify({ days: 7 }),
        }),
      ),
    );

    expect(body.sessions[0].endurancePrescription?.blocks).toHaveLength(3);
    const [[, call]] = vi.mocked(createCoachingDecision).mock.calls;
    expect(call.proposal.endurancePrescription?.blocks?.[1]?.times).toBe(6);
  });

  it('persists a CoachingDecision with the exact proposal, gate result, and frozen snapshot context', async () => {
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    const { getOrBuildAthleteSnapshot } =
      await import('@sharpit/server/lib/athlete-state/snapshot-service');
    const { createCoachingDecision } =
      await import('@sharpit/server/lib/decision-memory/repository');

    vi.mocked(runStructuredCoachStream).mockResolvedValue({
      output: {
        summary: 'Bloc',
        sessions: [
          {
            dayOffset: 2,
            startTime: null,
            type: 'BIKE',
            intensity: 'ENDURANCE',
            title: 'Vélo',
            description: 'Sortie',
            durationMin: 90,
            load: 60,
            rationale: 'Volume',
          },
        ],
      },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    } as never);

    vi.mocked(getOrBuildAthleteSnapshot).mockResolvedValue({
      snapshotId: 'snap-3',
      confidence: 0.9,
      decision: decisionState(),
      physicalHealth: physicalHealthData(),
      fatigue: { trainingCapacity: 'FULL' },
      todaysDecision: 'TRAIN_SMART',
    } as never);

    const { POST } = await importRoute();
    // The route answers with a stream: the Gate and the decision writes only run
    // once it is drained, so consume it before asserting on the side effects.
    await consumeCoachProgressStream(
      await POST(
        new Request('http://localhost/api/coach/plan', {
          method: 'POST',
          body: JSON.stringify({ days: 7 }),
        }),
      ),
    );

    expect(createCoachingDecision).toHaveBeenCalledTimes(1);
    const [[, call]] = vi.mocked(createCoachingDecision).mock.calls;
    expect(call.source).toBe('PLAN_GENERATOR');
    expect(call.proposal.type).toBe('BIKE');
    expect(call.proposal.intensity).toBe('ENDURANCE');
    expect(call.snapshotIdAtRecommendation).toBe('snap-3');
    expect(call.snapshotContext.overallVerdict).toBe('TRAIN_SMART');
  });

  it('generates against the loose schema and recovers invented strength enums', async () => {
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    const { getOrBuildAthleteSnapshot } =
      await import('@sharpit/server/lib/athlete-state/snapshot-service');
    const { coachPlanGenerationSchema } = await import('@sharpit/app/lib/validators/coach');

    vi.mocked(runStructuredCoachStream).mockResolvedValue({
      output: {
        summary: 'Semaine légère',
        sessions: [
          {
            dayOffset: 1.4,
            startTime: '9:05',
            type: 'STRENGTH',
            intensity: 'RECOVERY',
            title: 'Renfo',
            description: 'Hanche',
            durationMin: 40.6,
            load: 25.2,
            rationale: 'Prévention',
            strengthPrescription: {
              sets: [
                {
                  exercise: 'Clamshell',
                  intent: 'STRENGTH',
                  pattern: 'HIP_FLEXION_FAKE',
                  sets: 3,
                  reps: 12,
                },
              ],
            },
          },
        ],
      },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    } as never);

    // A strength session is only proposed to an athlete who practises it (Gate).
    const { getAthleteProfile } = await import('@sharpit/server/lib/queries');
    vi.mocked(getAthleteProfile).mockResolvedValue({
      practicedSports: { version: 1, sports: ['run', 'strength'] },
    } as never);

    vi.mocked(getOrBuildAthleteSnapshot).mockResolvedValue({
      snapshotId: 'snap-loose',
      confidence: 0.8,
      decision: decisionState(),
      physicalHealth: physicalHealthData(),
      fatigue: { trainingCapacity: 'FULL' },
      todaysDecision: 'TRAIN_SMART',
    } as never);

    const { POST } = await importRoute();
    const body = await consumeCoachProgressStream<PlanPayload, unknown>(
      await POST(
        new Request('http://localhost/api/coach/plan', {
          method: 'POST',
          body: JSON.stringify({ days: 7 }),
        }),
      ),
    );

    expect(vi.mocked(runStructuredCoachStream).mock.calls[0]?.[0]?.schema).toBe(
      coachPlanGenerationSchema,
    );
    expect(body.sessions[0].startTime).toBe('09:05');
    expect(body.sessions[0].durationMin).toBe(41);
    expect(body.sessions[0].strengthPrescription?.sets[0]?.pattern).toBeNull();
    vi.mocked(getAthleteProfile).mockResolvedValue(null);
  });

  it('streams a precise FR error when structured generation fails the schema', async () => {
    const { runStructuredCoachStream } =
      await import('@sharpit/server/lib/coach/stream-structured-generation');
    vi.mocked(runStructuredCoachStream).mockRejectedValue(
      new Error('No object generated: response did not match schema.'),
    );

    const { POST } = await importRoute();
    const response = await POST(
      new Request('http://localhost/api/coach/plan', {
        method: 'POST',
        body: JSON.stringify({ days: 7 }),
      }),
    );

    await expect(consumeCoachProgressStream(response)).rejects.toThrow(
      /pas pu terminer ta semaine/i,
    );
  });
});
