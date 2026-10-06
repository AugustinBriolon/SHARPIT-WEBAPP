import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    convertToModelMessages: vi.fn().mockResolvedValue([]),
    streamText: vi.fn(() => ({ stream: new ReadableStream() })),
    toUIMessageStream: vi.fn(() => new ReadableStream()),
    createUIMessageStreamResponse: vi.fn(
      ({ headers }: { headers?: HeadersInit }) => new Response('stream', { headers }),
    ),
  };
});

vi.mock('@sharpit/server/lib/ai', () => ({
  COACH_MODEL: 'mock-model',
  COACH_EMPTY_ANSWER_RETRY_MODEL: 'mock-retry-model',
  COACH_MAX_OUTPUT_TOKENS: { conversational: 1 },
  COACH_REASONING_LEVEL: { conversational: 'low' },
  coachGatewayOptions: {},
  isCoachConfigured: () => true,
}));

vi.mock('@sharpit/server/lib/auth/current-athlete', () => ({
  getCurrentAthleteId: vi.fn().mockResolvedValue('athlete-1'),
}));

vi.mock('@sharpit/server/lib/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ ok: true }),
  rateLimitJsonResponse: vi.fn(),
  rateLimiters: { coachChat: {} },
}));

// Mocked wholesale — ai-budget.ts imports @/lib/prisma, which must not run here.
vi.mock('@sharpit/server/lib/access/ai-budget', () => ({
  ensureFreeAiBudget: vi
    .fn()
    .mockResolvedValue({ allowed: true, isPro: false, warning: false, retryAfterSeconds: null }),
  aiBudgetResponseBody: vi.fn(),
  withAiBudgetWarningHeader: (headers: Record<string, string>) => headers,
  RETRY_AFTER_HEADER: 'Retry-After',
}));

vi.mock('@sharpit/server/lib/privacy/consent-store', () => ({
  requireAiProcessingConsent: vi.fn().mockResolvedValue(null),
}));

vi.mock('@sharpit/server/lib/coach/context/coach-context', () => ({
  buildCoachContext: vi.fn().mockResolvedValue({ practicedSports: [] }),
  formatCoachContext: () => 'mock coach context',
}));

vi.mock('@sharpit/server/lib/coach/plan/calendar-availability', () => ({
  buildBusySummary: vi.fn().mockResolvedValue(null),
}));

vi.mock('@sharpit/server/lib/coach/memory/load-learning-memory-block', () => ({
  loadLearningMemoryBlock: vi.fn().mockResolvedValue(''),
}));

vi.mock('@sharpit/server/lib/coach/chat/tools/coach-tools', () => ({
  createCoachTools: vi.fn(() => ({})),
}));

vi.mock('@sharpit/server/lib/ai/usage', () => ({
  recordAiUsage: vi.fn(),
}));

vi.mock('@sharpit/server/lib/planned-session/strength/strength-session-template', () => ({
  formatStrengthSessionRules: () => '',
}));

vi.mock('@sharpit/server/lib/queries', () => ({
  getAthleteProfile: vi.fn(),
  getGoalById: vi.fn(),
}));

vi.mock('@sharpit/db/client', () => ({ prisma: {} }));

vi.mock('@sharpit/server/lib/coach/conversations', () => ({
  getConversation: vi.fn(),
  saveConversationMessages: vi.fn(),
}));

vi.mock('@sharpit/server/lib/journal/journal-habit-analysis-load', () => ({
  loadJournalHabitFindings: vi.fn().mockResolvedValue({ daysWithSignal: 3, findings: [] }),
}));

async function importRoute() {
  return await import('./handler');
}

function chatRequest(metadata?: Record<string, unknown>): Request {
  return new Request('http://localhost/api/coach/chat', {
    method: 'POST',
    body: JSON.stringify({
      messages: [
        {
          id: 'm-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Que dit mon journal ?' }],
          ...(metadata ? { metadata } : {}),
        },
      ],
    }),
  });
}

async function givenTier(tier: 'FREE' | 'PRO') {
  const { getAthleteProfile } = await import('@sharpit/server/lib/queries');
  vi.mocked(getAthleteProfile).mockResolvedValue({ tier } as never);
}

async function systemPromptSent(): Promise<string> {
  const { streamText } = await import('ai');
  const [call] = vi.mocked(streamText).mock.calls;
  return (call?.[0] as { system: string }).system;
}

describe('POST /api/coach/chat · journal analyses gate', () => {
  beforeAll(async () => {
    await importRoute();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a FREE athlete before loading any journal finding', async () => {
    await givenTier('FREE');
    const { streamText } = await import('ai');
    const { loadJournalHabitFindings } =
      await import('@sharpit/server/lib/journal/journal-habit-analysis-load');

    const { POST } = await importRoute();
    const response = await POST(chatRequest({ discussKind: 'journal-analyses' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'La lecture coach du journal est réservée à Pro.',
    });
    expect(loadJournalHabitFindings).not.toHaveBeenCalled();
    expect(streamText).not.toHaveBeenCalled();
  });

  it('hands a PRO athlete’s journal reading to the coach', async () => {
    await givenTier('PRO');

    const { POST } = await importRoute();
    const response = await POST(chatRequest({ discussKind: 'journal-analyses' }));

    expect(response.status).toBe(200);
    const system = await systemPromptSent();
    expect(system).toContain('## Analyses journal');
    expect(system).toContain('3/7 jours avec signal');
  });

  it('leaves ordinary conversations untouched and skips the tier lookup', async () => {
    const { getAthleteProfile } = await import('@sharpit/server/lib/queries');

    const { POST } = await importRoute();
    const response = await POST(chatRequest());

    expect(response.status).toBe(200);
    expect(getAthleteProfile).not.toHaveBeenCalled();
    expect(await systemPromptSent()).not.toContain('## Analyses journal');
  });
});

describe('POST /api/coach/chat · discuss target context', () => {
  const race = {
    title: 'Half Ironman',
    kind: 'RACE',
    targetDate: null,
    location: 'Vichy',
    achieved: false,
    notes: null,
    priority: 'A',
    raceFormat: null,
    targetPerformance: null,
    currentValue: null,
    targetValue: null,
    unit: null,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getGoalById } = await import('@sharpit/server/lib/queries');
    // Mirrors the real query: the goal is only found under its owner's id.
    vi.mocked(getGoalById).mockImplementation((async (athleteId: string, id: string) =>
      athleteId === 'athlete-1' && id === 'g-1' ? race : null) as never);
  });

  it('names the discussed goal in the system prompt', async () => {
    const { getGoalById } = await import('@sharpit/server/lib/queries');

    const { POST } = await importRoute();
    const response = await POST(chatRequest({ discussKind: 'goal', goalId: 'g-1' }));

    expect(response.status).toBe(200);
    expect(getGoalById).toHaveBeenCalledWith('athlete-1', 'g-1');
    const system = await systemPromptSent();
    expect(system).toContain('## Objectif discuté');
    expect(system).toContain('Course : Half Ironman (Vichy)');
  });

  it('adds nothing for a goal the athlete does not own', async () => {
    const { POST } = await importRoute();
    const response = await POST(chatRequest({ discussKind: 'goal', goalId: 'g-foreign' }));

    expect(response.status).toBe(200);
    expect(await systemPromptSent()).not.toContain('## Objectif discuté');
  });

  it('treats malformed discuss metadata as an ordinary conversation', async () => {
    const { getGoalById, getAthleteProfile } = await import('@sharpit/server/lib/queries');

    const { POST } = await importRoute();
    const response = await POST(chatRequest({ discussKind: 'goal', goalId: ['g-1'] }));

    expect(response.status).toBe(200);
    expect(getGoalById).not.toHaveBeenCalled();
    expect(getAthleteProfile).not.toHaveBeenCalled();
  });
});

describe('POST /api/coach/chat · stream outcome', () => {
  type EndCallback = (end: Record<string, unknown>) => void;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function streamTextOptions() {
    const { streamText } = await import('ai');
    const [call] = vi.mocked(streamText).mock.calls;
    return call?.[0] as unknown as { onEnd: EndCallback; onError: (e: { error: unknown }) => void };
  }

  function endEvent(text: string) {
    const usage = {
      inputTokens: 10,
      inputTokenDetails: { cacheReadTokens: 8 },
      outputTokens: 5,
      outputTokenDetails: { reasoningTokens: 5 },
    };
    return {
      usage,
      finishReason: 'length',
      rawFinishReason: 'MAX_TOKENS',
      steps: [{ text, toolCalls: [] }],
      finalStep: { response: { modelId: 'google/gemini-3-flash' } },
    };
  }

  it('shows the athlete a French message when the stream breaks', async () => {
    const { POST } = await importRoute();
    await POST(chatRequest());

    const { toUIMessageStream } = await import('ai');
    const [call] = vi.mocked(toUIMessageStream).mock.calls;
    const { onError } = call?.[0] as { onError: (error: unknown) => string };
    const { COACH_STREAM_ERROR_COPY } = await importRoute();
    expect(onError(new Error('upstream 503'))).toBe(COACH_STREAM_ERROR_COPY);
  });

  it('logs the cause of a stream error on the server', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { POST } = await importRoute();
    await POST(chatRequest());

    (await streamTextOptions()).onError({
      error: Object.assign(new Error('Service Unavailable'), { statusCode: 503 }),
    });
    expect(error).toHaveBeenCalledWith(
      '[coach-chat] stream error',
      expect.objectContaining({ message: 'Service Unavailable', statusCode: 503 }),
    );
    error.mockRestore();
  });

  it('warns when the answer ends without any text', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { POST } = await importRoute();
    await POST(chatRequest());

    (await streamTextOptions()).onEnd(endEvent(''));
    expect(warn).toHaveBeenCalledWith(
      '[coach-chat] empty answer',
      expect.objectContaining({
        emptyAnswer: true,
        finishReason: 'length',
        servedModel: 'google/gemini-3-flash',
      }),
    );
    warn.mockRestore();
  });

  it('logs an answered turn as timing, with the served model', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { POST } = await importRoute();
    await POST(chatRequest());

    (await streamTextOptions()).onEnd(endEvent('Ta nuit était courte.'));
    expect(info).toHaveBeenCalledWith(
      '[coach-chat] timing',
      expect.objectContaining({
        emptyAnswer: false,
        servedModel: 'google/gemini-3-flash',
        cachedInputTokens: 8,
      }),
    );
    info.mockRestore();
  });
});

describe('POST /api/coach/chat · conversation sent by the client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a malformed conversation before any model call', async () => {
    const { streamText } = await import('ai');
    const { POST, COACH_UNREADABLE_HISTORY_COPY } = await importRoute();

    const response = await POST(
      new Request('http://localhost/api/coach/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [{ id: 'm-1', role: 'user' }] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: COACH_UNREADABLE_HISTORY_COPY });
    expect(streamText).not.toHaveBeenCalled();
  });

  it('refuses a body that is not JSON', async () => {
    const { POST } = await importRoute();
    const response = await POST(
      new Request('http://localhost/api/coach/chat', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });

  it('drops tool calls a cut stream left without result', async () => {
    const { convertToModelMessages } = await import('ai');
    const { POST } = await importRoute();
    await POST(chatRequest());

    expect(convertToModelMessages).toHaveBeenCalledWith(expect.any(Array), {
      ignoreIncompleteToolCalls: true,
    });
  });
});

describe('POST /api/coach/chat · empty answer retry', () => {
  type StreamOptions = {
    model: string;
    reasoning: string;
    onEnd: (end: Record<string, unknown>) => void;
  };

  function endWith(text: string) {
    return {
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
      rawFinishReason: undefined,
      steps: [{ text, toolCalls: [] }],
      finalStep: { response: { modelId: 'model' } },
    };
  }

  /** Each model answers with the given text; its UI chunks record the options they were sent with. */
  async function givenAnswers(textByModel: Record<string, string>) {
    const ai = await import('ai');
    vi.mocked(ai.streamText).mockImplementation(((options: StreamOptions) => {
      options.onEnd(endWith(textByModel[options.model] ?? ''));
      return { stream: options.model };
    }) as never);
    vi.mocked(ai.toUIMessageStream).mockImplementation(
      ((options: { stream: string; sendStart?: boolean; sendFinish?: boolean }) =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({
              type: 'data-attempt',
              data: { model: options.stream, start: options.sendStart, finish: options.sendFinish },
            });
            controller.close();
          },
        })) as never,
    );
  }

  async function chunksSent(): Promise<unknown[]> {
    const { createUIMessageStreamResponse } = await import('ai');
    const [call] = vi.mocked(createUIMessageStreamResponse).mock.calls;
    const reader = (call?.[0] as { stream: ReadableStream }).stream.getReader();
    const chunks: unknown[] = [];
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      chunks.push(next.value);
    }
    return chunks;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    const ai = await import('ai');
    vi.mocked(ai.streamText).mockImplementation((() => ({
      stream: new ReadableStream(),
    })) as never);
    vi.mocked(ai.toUIMessageStream).mockImplementation((() => new ReadableStream()) as never);
  });

  it('asks the retry model, without reasoning, when the answer comes back empty', async () => {
    await givenAnswers({ 'mock-model': '', 'mock-retry-model': 'Nuit courte.' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { POST } = await importRoute();
    await POST(chatRequest());

    expect(await chunksSent()).toEqual([
      { type: 'data-attempt', data: { model: 'mock-model', start: undefined, finish: false } },
      {
        type: 'data-attempt',
        data: { model: 'mock-retry-model', start: false, finish: undefined },
      },
    ]);
    const { streamText } = await import('ai');
    const retry = vi.mocked(streamText).mock.calls[1]?.[0] as unknown as StreamOptions;
    expect(retry).toMatchObject({ model: 'mock-retry-model', reasoning: 'none' });
    warn.mockRestore();
  });

  it('closes the turn itself when the first answer has text', async () => {
    await givenAnswers({ 'mock-model': 'Nuit courte.' });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { POST } = await importRoute();
    await POST(chatRequest());

    expect(await chunksSent()).toEqual([
      { type: 'data-attempt', data: { model: 'mock-model', start: undefined, finish: false } },
      { type: 'finish', finishReason: 'stop' },
    ]);
    const { streamText } = await import('ai');
    expect(streamText).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});

describe('POST /api/coach/chat · guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts the consent, rate limit and budget reads together', async () => {
    const { requireAiProcessingConsent } =
      await import('@sharpit/server/lib/privacy/consent-store');
    const { checkRateLimit } = await import('@sharpit/server/lib/rate-limit');
    const { ensureFreeAiBudget } = await import('@sharpit/server/lib/access/ai-budget');
    let grantConsent: (value: null) => void = () => undefined;
    vi.mocked(requireAiProcessingConsent).mockReturnValueOnce(
      new Promise((resolve) => {
        grantConsent = resolve;
      }),
    );

    const { POST } = await importRoute();
    const pending = POST(chatRequest());
    await vi.waitFor(() => expect(ensureFreeAiBudget).toHaveBeenCalled());
    expect(checkRateLimit).toHaveBeenCalled();

    grantConsent(null);
    expect((await pending).status).toBe(200);
  });

  it('answers a missing consent first, even when the other checks refuse too', async () => {
    const { requireAiProcessingConsent } =
      await import('@sharpit/server/lib/privacy/consent-store');
    const { checkRateLimit } = await import('@sharpit/server/lib/rate-limit');
    const { ensureFreeAiBudget } = await import('@sharpit/server/lib/access/ai-budget');
    vi.mocked(requireAiProcessingConsent).mockResolvedValueOnce(
      new Response(null, { status: 403 }) as never,
    );
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ ok: false } as never);
    vi.mocked(ensureFreeAiBudget).mockResolvedValueOnce({ allowed: false } as never);

    const { POST } = await importRoute();
    expect((await POST(chatRequest())).status).toBe(403);
  });
});

describe('POST /api/coach/chat · server-owned conversation', () => {
  const question = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Et vendredi ?' }] };
  const stored = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Comment était ma nuit ?' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Courte.' }] },
  ];

  function serverHistoryRequest(conversationId: string): Request {
    return new Request('http://localhost/api/coach/chat', {
      method: 'POST',
      body: JSON.stringify({ conversationId, message: question }),
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    const { getConversation } = await import('@sharpit/server/lib/coach/conversations');
    vi.mocked(getConversation).mockImplementation((async (athleteId: string, id: string) =>
      athleteId === 'athlete-1' && id === 'c1' ? { id, messages: stored } : null) as never);
  });

  it('answers the stored thread with the new question', async () => {
    const { POST } = await importRoute();
    expect((await POST(serverHistoryRequest('c1'))).status).toBe(200);

    const { convertToModelMessages } = await import('ai');
    const [sent] = vi.mocked(convertToModelMessages).mock.calls[0]!;
    expect((sent as unknown as Array<{ id: string }>).map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
  });

  it('refuses a conversation that is not the athlete’s', async () => {
    const { streamText } = await import('ai');
    const { POST, COACH_CONVERSATION_NOT_FOUND_COPY } = await importRoute();

    const response = await POST(serverHistoryRequest('c-foreign'));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: COACH_CONVERSATION_NOT_FOUND_COPY });
    expect(streamText).not.toHaveBeenCalled();
  });

  it('saves the thread with the answer when the stream ends', async () => {
    const ai = await import('ai');
    vi.mocked(ai.streamText).mockImplementation(((options: {
      onEnd: (end: Record<string, unknown>) => void;
    }) => {
      options.onEnd({
        usage: {},
        finishReason: 'stop',
        steps: [{ text: 'Vendredi est libre.', toolCalls: [] }],
        finalStep: { response: { modelId: 'model' } },
      });
      return { stream: 'model' };
    }) as never);
    vi.mocked(ai.toUIMessageStream).mockImplementation(
      (() =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start' });
            controller.enqueue({ type: 'text-start', id: 't1' });
            controller.enqueue({ type: 'text-delta', id: 't1', delta: 'Vendredi est libre.' });
            controller.enqueue({ type: 'text-end', id: 't1' });
            controller.close();
          },
        })) as never,
    );
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const { POST } = await importRoute();
    await POST(serverHistoryRequest('c1'));
    const [call] = vi.mocked(ai.createUIMessageStreamResponse).mock.calls;
    const reader = (call?.[0] as { stream: ReadableStream }).stream.getReader();
    while (!(await reader.read()).done) {
      // drain
    }

    const { saveConversationMessages } = await import('@sharpit/server/lib/coach/conversations');
    await vi.waitFor(() => expect(saveConversationMessages).toHaveBeenCalled());
    const [athleteId, id, saved] = vi.mocked(saveConversationMessages).mock.calls[0]!;
    expect([athleteId, id]).toEqual(['athlete-1', 'c1']);
    const thread = saved as Array<{ id: string; role: string; parts: Array<{ text?: string }> }>;
    expect(thread.slice(0, 3).map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
    expect(thread[3]).toMatchObject({ role: 'assistant' });
    expect(thread[3]!.parts.some((p) => p.text === 'Vendredi est libre.')).toBe(true);

    vi.mocked(ai.streamText).mockImplementation((() => ({
      stream: new ReadableStream(),
    })) as never);
    vi.mocked(ai.toUIMessageStream).mockImplementation((() => new ReadableStream()) as never);
  });

  it('saves nothing for a thread the client owns', async () => {
    const { POST } = await importRoute();
    await POST(chatRequest());
    const { saveConversationMessages } = await import('@sharpit/server/lib/coach/conversations');
    expect(saveConversationMessages).not.toHaveBeenCalled();
  });
});

describe('POST /api/coach/chat · continuation after an approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('continues the coach message under its own id rather than starting a new one', async () => {
    const ai = await import('ai');
    vi.mocked(ai.streamText).mockImplementation(((options: {
      onEnd: (end: Record<string, unknown>) => void;
    }) => {
      options.onEnd({
        usage: {},
        finishReason: 'stop',
        steps: [{ text: "C'est fait.", toolCalls: [] }],
        finalStep: { response: { modelId: 'model' } },
      });
      return { stream: 'model' };
    }) as never);
    vi.mocked(ai.toUIMessageStream).mockImplementation(
      (() =>
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'start' });
            controller.close();
          },
        })) as never,
    );
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const { POST } = await importRoute();
    await POST(
      new Request('http://localhost/api/coach/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: [
            { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Décale jeudi' }] },
            { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Je propose :' }] },
          ],
        }),
      }),
    );
    const [call] = vi.mocked(ai.createUIMessageStreamResponse).mock.calls;
    const reader = (call?.[0] as { stream: ReadableStream }).stream.getReader();
    const { value: start } = await reader.read();

    // A new id here made the web store every continuation as a separate coach message.
    expect(start).toMatchObject({ type: 'start', messageId: 'a1' });

    vi.mocked(ai.streamText).mockImplementation((() => ({
      stream: new ReadableStream(),
    })) as never);
    vi.mocked(ai.toUIMessageStream).mockImplementation((() => new ReadableStream()) as never);
  });
});

describe('coachStreamErrorCopy', () => {
  it('says a tool call failed, not the answer, when the model got a call wrong', async () => {
    const { InvalidToolInputError, NoSuchToolError } = await import('ai');
    const { coachStreamErrorCopy, COACH_TOOL_CALL_ERROR_COPY } = await importRoute();

    expect(
      coachStreamErrorCopy(
        new InvalidToolInputError({
          toolName: 'updatePlannedSession',
          toolInput: '{}',
          cause: 'x',
        }),
      ),
    ).toBe(COACH_TOOL_CALL_ERROR_COPY);
    expect(coachStreamErrorCopy(new NoSuchToolError({ toolName: 'moveSession' }))).toBe(
      COACH_TOOL_CALL_ERROR_COPY,
    );
  });

  it('keeps the broken-answer message for anything else', async () => {
    const { coachStreamErrorCopy, COACH_STREAM_ERROR_COPY } = await importRoute();
    expect(coachStreamErrorCopy(new Error('upstream 503'))).toBe(COACH_STREAM_ERROR_COPY);
  });
});
