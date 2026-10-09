import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  InvalidToolInputError,
  NoSuchToolError,
  ToolCallRepairError,
  streamText,
  toUIMessageStream,
  type FinishReason,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageStreamWriter,
} from 'ai';
import { after, NextResponse } from 'next/server';
import {
  COACH_EMPTY_ANSWER_RETRY_MODEL,
  COACH_MODEL,
  isCoachConfigured,
} from '@sharpit/server/lib/ai';
import type { buildCoachContext } from '@sharpit/server/lib/coach/context/coach-context';
import { createCoachTools } from '@sharpit/server/lib/coach/chat/tools/coach-tools';
import { getCurrentAthleteId } from '@sharpit/server/lib/auth/current-athlete';
import { recordAiUsage } from '@sharpit/server/lib/ai/usage';
import {
  RETRY_AFTER_HEADER,
  aiBudgetResponseBody,
  ensureFreeAiBudget,
  withAiBudgetWarningHeader,
} from '@sharpit/server/lib/access/ai-budget';
import { requireAiProcessingConsent } from '@sharpit/server/lib/privacy/consent-store';
import {
  checkRateLimit,
  rateLimitJsonResponse,
  rateLimiters,
} from '@sharpit/server/lib/rate-limit';
import { resolveCoachDiscussServerContext } from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-server-context';
import {
  startCoachChatTiming,
  type CoachChatTiming,
} from '@sharpit/server/lib/coach/chat/coach-chat-timing';
import {
  describeCoachChatError,
  describeCoachChatOutcome,
  type CoachChatOutcome,
} from '@sharpit/server/lib/coach/chat/coach-chat-outcome';
import { withCoachTrace } from '@sharpit/server/lib/ai/coach-trace';
import { lastCoachDiscussMetadata } from '@sharpit/server/lib/coach/chat/discuss/coach-discuss-metadata-parse';
import {
  classifyCoachIntent,
  coachRequestScope,
  isPlanningThread,
  lastUserText,
  type CoachRequestScope,
} from '@sharpit/server/lib/coach/chat/coach-request-scope';
import { buildCoachSystemPrompt } from '@sharpit/server/lib/coach/chat/coach-system-prompt';
import { coachChatGenerationSettings } from '@sharpit/server/lib/coach/chat/coach-chat-generation';
import { readCoachChatHistory } from '@sharpit/server/lib/coach/chat/coach-chat-history';
import { getConversation, saveConversationMessages } from '@sharpit/server/lib/coach/conversations';

/** What the athlete reads when the answer breaks mid-stream. */
export const COACH_STREAM_ERROR_COPY =
  "Le coach n'a pas pu terminer sa réponse. Réessaie dans un instant.";

/** What a proposal card reads when the model's call could not be run (bad input, unknown tool). */
export const COACH_TOOL_CALL_ERROR_COPY =
  "Cette action n'a pas pu être préparée par le coach. Redemande-la autrement.";

/**
 * The words for an error inside the stream. A tool call the model got wrong fails one card, not
 * the answer, so it does not say the answer broke. Errors a tool throws never get here: they come
 * back as `{ ok: false }` (`withCoachToolExecution`).
 */
export function coachStreamErrorCopy(error: unknown): string {
  const toolCallError =
    InvalidToolInputError.isInstance(error) ||
    NoSuchToolError.isInstance(error) ||
    ToolCallRepairError.isInstance(error);
  return toolCallError ? COACH_TOOL_CALL_ERROR_COPY : COACH_STREAM_ERROR_COPY;
}

/** What the athlete reads when the conversation asked for is not theirs, or no longer exists. */
export const COACH_CONVERSATION_NOT_FOUND_COPY =
  'Cette conversation est introuvable. Ouvre une nouvelle conversation.';

/** What the athlete reads when the conversation sent is malformed. */
export const COACH_UNREADABLE_HISTORY_COPY =
  'Cette conversation ne peut pas être relue par le coach. Ouvre une nouvelle conversation.';

type BudgetWarning = Awaited<ReturnType<typeof ensureFreeAiBudget>>['warning'];

/**
 * Consent, rate limit and free AI budget, answered in that order before any model work. The three
 * reads run at once: sequential, they cost ~840 ms of the athlete's wait. A refused consent still
 * spends one rate-limit token, which is harmless: without consent there is no coach to spam.
 */
async function guardCoachChat(
  athleteId: string,
): Promise<{ blocked: Response } | { budgetWarning: BudgetWarning }> {
  const [aiBlocked, rateLimit, budget] = await Promise.all([
    requireAiProcessingConsent(athleteId),
    checkRateLimit(rateLimiters.coachChat, athleteId, { failClosed: true }),
    ensureFreeAiBudget(athleteId),
  ]);
  if (aiBlocked) {
    return { blocked: aiBlocked };
  }
  if (!rateLimit.ok) {
    const limited = rateLimitJsonResponse(rateLimit);
    return { blocked: NextResponse.json(limited.body, { status: limited.status }) };
  }
  if (!budget.allowed) {
    return {
      blocked: NextResponse.json(aiBudgetResponseBody(budget.retryAfterSeconds!, budget.isPro), {
        status: 402,
        headers: { [RETRY_AFTER_HEADER]: String(budget.retryAfterSeconds) },
      }),
    };
  }
  return { budgetWarning: budget.warning };
}

type CoachReplyInput = {
  athleteId: string;
  system: string;
  messages: UIMessage[];
  practicedSports: Awaited<ReturnType<typeof buildCoachContext>>['practicedSports'];
  budgetWarning: BudgetWarning;
  timing: CoachChatTiming;
  scope: CoachRequestScope;
  /** Set when the server owns the thread: the answer is saved to it when it ends. */
  conversationId: string | null;
};

/** One model call of a coach turn: the first, or the retry of an answer that came back empty. */
type CoachAttempt = {
  name: 'first' | 'empty-answer-retry';
  model: string;
  reasoning: CoachRequestScope['reasoning'] | 'none';
};

type CoachAttemptEnd = { outcome: CoachChatOutcome; finishReason: FinishReason };

/**
 * A reasoning model can spend its whole turn thinking and write nothing: measured in production,
 * 13 s for 1 024 reasoning tokens and no text. The athlete then faced an empty bubble. The retry
 * asks another model, without reasoning, once; its facts are all in the prompt.
 */
const EMPTY_ANSWER_RETRY: CoachAttempt = {
  name: 'empty-answer-retry',
  model: COACH_EMPTY_ANSWER_RETRY_MODEL,
  reasoning: 'none',
};

async function streamCoachReply(input: CoachReplyInput): Promise<Response> {
  const generate = await coachGenerator(input);
  const stream = createUIMessageStream({
    originalMessages: input.messages,
    onError: () => COACH_STREAM_ERROR_COPY,
    onEnd: ({ messages }) => saveServerHistory(input, messages),
    execute: async ({ writer }) => {
      const first = generate({
        name: 'first',
        model: COACH_MODEL,
        reasoning: input.scope.reasoning,
      });
      await pipeAttempt(writer, first.stream, { sendFinish: false });
      const end = first.end();
      if (end?.outcome.emptyAnswer) {
        await pipeAttempt(writer, generate(EMPTY_ANSWER_RETRY).stream, { sendStart: false });
        return;
      }
      writer.write({ type: 'finish', finishReason: end?.finishReason });
    },
  });
  return createUIMessageStreamResponse({
    stream,
    headers: withAiBudgetWarningHeader({}, input.budgetWarning),
    // Read to the end on the server too, kept alive past the response by `after`: an athlete who
    // closes the screen still finds the answer saved in the conversation.
    consumeSseStream: ({ stream: copy }) => {
      after(consumeStream({ stream: copy }));
    },
  });
}

async function saveServerHistory(input: CoachReplyInput, messages: UIMessage[]): Promise<void> {
  if (!input.conversationId) {
    return;
  }
  try {
    await saveConversationMessages(input.athleteId, input.conversationId, messages);
  } catch (error) {
    console.error('[coach-chat] save', describeCoachChatError(error));
  }
}

async function loadStoredMessages(athleteId: string, conversationId: string) {
  const conversation = await getConversation(athleteId, conversationId);
  return conversation && Array.isArray(conversation.messages)
    ? (conversation.messages as unknown[])
    : null;
}

/**
 * Chunk by chunk rather than `writer.merge`: merged streams are piped concurrently, and the
 * turn's finish must not overtake the first attempt's last words.
 */
async function pipeAttempt(
  writer: UIMessageStreamWriter,
  stream: ReadableStream<TextStreamPart<ToolSet>>,
  options: { sendStart?: boolean; sendFinish?: boolean },
): Promise<void> {
  // The SDK default is an English « An error occurred. »; the cause is in the logs.
  const chunks = toUIMessageStream({ stream, onError: coachStreamErrorCopy, ...options });
  const reader = chunks.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    writer.write(next.value);
  }
}

/** The shared parts of every attempt of this turn, built once: history, tools, logging. */
async function coachGenerator(input: CoachReplyInput) {
  const { athleteId, timing, scope } = input;
  // A tool call a stream left without result (a cut connection) is dropped rather than sent:
  // the provider would reject the whole request.
  const messages = await convertToModelMessages(input.messages, {
    ignoreIncompleteToolCalls: true,
  });
  const tools = createCoachTools(athleteId, { practicedSports: input.practicedSports });
  return (attempt: CoachAttempt) => {
    let end: CoachAttemptEnd | undefined;
    const result = streamText({
      model: attempt.model,
      system: input.system,
      messages,
      tools,
      ...coachChatGenerationSettings(scope),
      reasoning: attempt.reasoning,
      telemetry: { functionId: 'coach-chat' },
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          timing.firstText();
        }
      },
      onError: ({ error }) => {
        console.error('[coach-chat] stream error', {
          attempt: attempt.name,
          ...describeCoachChatError(error),
          ...timing.summary(),
        });
      },
      onAbort: () => {
        console.info('[coach-chat] aborted', { attempt: attempt.name, ...timing.summary() });
      },
      onEnd: (event) => {
        const { usage, steps } = event;
        void recordAiUsage(athleteId, 'coach', usage);
        timing.note('steps', steps.length);
        timing.note('inputTokens', usage.inputTokens ?? 0);
        // Read from the provider's prompt cache: whether consecutive turns reuse their prefix.
        timing.note('cachedInputTokens', usage.inputTokenDetails?.cacheReadTokens ?? 0);
        timing.note('outputTokens', usage.outputTokens ?? 0);
        timing.note('reasoningTokens', usage.outputTokenDetails?.reasoningTokens ?? 0);
        end = { outcome: describeCoachChatOutcome(event), finishReason: event.finishReason };
        logCoachChatEnd(end.outcome, timing, attempt.name);
      },
    });
    return { stream: result.stream, end: () => end };
  };
}

/** An empty answer is logged as a warning so the log level alone finds it. */
function logCoachChatEnd(
  outcome: CoachChatOutcome,
  timing: CoachChatTiming,
  attempt: CoachAttempt['name'],
): void {
  const line = { attempt, ...timing.summary(), ...outcome };
  if (outcome.emptyAnswer) {
    console.warn('[coach-chat] empty answer', line);
    return;
  }
  console.info('[coach-chat] timing', line);
}

export async function POST(req: Request) {
  if (!isCoachConfigured()) {
    return NextResponse.json(
      {
        error: 'Coach IA non configuré. Ajoute une clé AI_GATEWAY_API_KEY dans .env.',
      },
      { status: 503 },
    );
  }

  const timing = startCoachChatTiming();
  const athleteId = await getCurrentAthleteId();
  const history = await readCoachChatHistory(await req.json().catch(() => null), (id) =>
    loadStoredMessages(athleteId, id),
  );
  if (!history.ok) {
    return history.reason === 'not-found'
      ? NextResponse.json({ error: COACH_CONVERSATION_NOT_FOUND_COPY }, { status: 404 })
      : NextResponse.json({ error: COACH_UNREADABLE_HISTORY_COPY }, { status: 400 });
  }
  const { messages, conversationId } = history;

  // Discuss metadata is client-supplied: entitlements are settled here, before
  // any kind-specific data is read or any model call is made.
  const discuss = await resolveCoachDiscussServerContext(athleteId, messages);
  if (discuss.status === 'forbidden') {
    return NextResponse.json({ error: discuss.error }, { status: 403 });
  }

  const scope = coachRequestScope(
    classifyCoachIntent({
      lastUserText: lastUserText(messages),
      discussKind: lastCoachDiscussMetadata(messages)?.discussKind ?? null,
      isPlanningThread: isPlanningThread(messages),
    }),
  );

  // The guard (consent, rate limit, budget) and the prompt's reads run together: nothing
  // reaches the model before the guard has passed, but neither waits on the other.
  const prompt = buildCoachSystemPrompt(athleteId, discuss.loadBlock, scope, timing);
  prompt.catch(() => undefined);
  const guard = await guardCoachChat(athleteId);
  timing.mark('guard');
  if ('blocked' in guard) {
    return guard.blocked;
  }
  const { system, practicedSports } = await prompt;
  timing.mark('prompt');
  timing.note('promptChars', system.length);
  timing.note('messages', messages.length);
  console.info('[coach-chat] scope', { intent: scope.intent, tools: scope.tools?.length ?? 'all' });
  return withCoachTrace({ traceName: 'coach-chat', athleteId, tags: ['chat', scope.intent] }, () =>
    streamCoachReply({
      athleteId,
      system,
      messages,
      practicedSports,
      budgetWarning: guard.budgetWarning,
      timing,
      scope,
      conversationId,
    }),
  );
}
