import type { UIMessage } from 'ai';
import { prisma } from '@sharpit/db/client';
import type { Prisma } from '@prisma/client';
import type { CoachTurn } from '@sharpit/server/lib/coach/evals/turn-checks';
import { logSafeError } from '@sharpit/server/lib/privacy/safe-log';

export type CoachTurnOutcome = 'ok' | 'empty' | 'error' | 'aborted';

/** The measures the chat handler already collects for a turn, as its timing summary holds them. */
export type CoachTurnMeasures = Record<string, number>;

export type CoachTurnTraceRecord = {
  athleteId: string;
  conversationId: string | null;
  intent: string;
  model: string | null;
  systemPrompt: string;
  turn: CoachTurn | null;
  outcome: CoachTurnOutcome;
  finishReason: string | null;
  steps: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  latencyMs: number;
  firstTextMs: number | null;
};

const TOOL_PART_PREFIX = 'tool-';

/**
 * The answer in the shape the evals read (`checkTurn`): its text and every tool call with the
 * input the model wrote and the output the server returned. Null when no assistant message exists.
 */
export function coachTurnFromMessages(messages: readonly UIMessage[]): CoachTurn | null {
  const answer = messages.findLast((message) => message.role === 'assistant');
  if (!answer) {
    return null;
  }
  const text = answer.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
  const tools = answer.parts.flatMap((part) => {
    if (!part.type.startsWith(TOOL_PART_PREFIX)) {
      return [];
    }
    const call = part as { input?: unknown; output?: unknown; state?: string };
    return [
      {
        name: part.type.slice(TOOL_PART_PREFIX.length),
        input: call.input,
        output: call.output,
        state: call.state ?? 'unknown',
      },
    ];
  });
  return { text, tools };
}

/** A turn that ended without an attempt that finished was cut by the athlete or failed. */
export function coachTurnOutcome(input: {
  isAborted: boolean;
  finishedWithoutAnswer: boolean | null;
}): CoachTurnOutcome {
  if (input.isAborted) {
    return 'aborted';
  }
  if (input.finishedWithoutAnswer === null) {
    return 'error';
  }
  return input.finishedWithoutAnswer ? 'empty' : 'ok';
}

/** Missing measures count as zero: the turn may have ended before the model reported them. */
export function coachTurnTraceRecord(input: {
  athleteId: string;
  conversationId: string | null;
  intent: string;
  systemPrompt: string;
  turn: CoachTurn | null;
  outcome: CoachTurnOutcome;
  model: string | null;
  finishReason: string | null;
  measures: CoachTurnMeasures;
}): CoachTurnTraceRecord {
  const { measures } = input;
  return {
    athleteId: input.athleteId,
    conversationId: input.conversationId,
    intent: input.intent,
    model: input.model,
    systemPrompt: input.systemPrompt,
    turn: input.turn,
    outcome: input.outcome,
    finishReason: input.finishReason,
    steps: measures.steps ?? 0,
    inputTokens: measures.inputTokens ?? 0,
    cachedInputTokens: measures.cachedInputTokens ?? 0,
    outputTokens: measures.outputTokens ?? 0,
    latencyMs: measures.totalMs ?? 0,
    firstTextMs: measures.firstTextMs ?? null,
  };
}

/** Never fails the turn: a trace that cannot be written is logged and the answer still goes out. */
export async function saveCoachTurnTrace(record: CoachTurnTraceRecord): Promise<void> {
  try {
    const turn = (record.turn ?? undefined) as Prisma.InputJsonValue | undefined;
    await prisma.coachTurnTrace.create({ data: { ...record, turn } });
  } catch (error) {
    logSafeError('coach/turn-trace', error, { athleteId: record.athleteId });
  }
}
