import { inAnswerLanguage } from '@sharpit/server/lib/locale/locale-context';
import {
  NoObjectGeneratedError,
  Output,
  parsePartialJson,
  streamText,
  type LanguageModelUsage,
} from 'ai';
import { z } from 'zod';
import {
  COACH_REASONING_LEVEL,
  COACH_STRUCTURED_MODEL,
  coachStructuredGatewayOptions,
} from '@sharpit/server/lib/ai';

/**
 * Runs a structured coach generation while reporting progress.
 *
 * `plan` and `adapt` both ask the model for one large object. Awaiting it whole
 * meant 37s and 55s of blank screen, most of it spent streaming reasoning the
 * athlete never saw. Reading `fullStream` lets us forward the deliberation as it
 * arrives and rebuild the object incrementally from the JSON deltas.
 *
 * Only `fullStream` is consumed, so there is a single reader on the underlying
 * stream and no ambiguity about which of the SDK's views owns it.
 */

/** Re-parsing on every token is wasted work — wait for a meaningful chunk. */
const PARTIAL_PARSE_STRIDE_CHARS = 48;

/**
 * Emitting a full SSE frame on every tiny JSON growth floods the browser
 * (thousands of frames for a 2-week plan). Prefer list-length progress; otherwise
 * wait for a larger stride before re-sending the whole object.
 */
const PARTIAL_EMIT_STRIDE_CHARS = 400;

/** Batch reasoning deltas so one SSE frame carries a readable fragment. */
const REASONING_FLUSH_CHARS = 160;

/** Count of top-level list items the UI shows as generation progress. */
export function progressListLength(value: unknown): number {
  if (typeof value !== 'object' || value === null) {
    return 0;
  }
  const record = value as Record<string, unknown>;
  for (const key of ['sessions', 'changes'] as const) {
    const list = record[key];
    if (Array.isArray(list)) {
      return list.length;
    }
  }
  return 0;
}

/** Decide whether a newly parsed partial is worth pushing on the wire. */
export function shouldEmitCoachPartial(args: {
  previousSnapshot: string;
  nextValue: unknown;
  previousListLength: number;
  charsSinceEmit: number;
  minCharsBetweenEmits: number;
}): { emit: boolean; snapshot: string; listLength: number } {
  const snapshot = JSON.stringify(args.nextValue);
  const listLength = progressListLength(args.nextValue);
  if (snapshot === args.previousSnapshot) {
    return { emit: false, snapshot, listLength };
  }
  if (listLength > args.previousListLength) {
    return { emit: true, snapshot, listLength };
  }
  if (args.charsSinceEmit >= args.minCharsBetweenEmits) {
    return { emit: true, snapshot, listLength };
  }
  return { emit: false, snapshot, listLength };
}

/** Raw payloads worth re-parsing, most authoritative first. */
function recoveryCandidates(error: unknown, streamedJsonText: string): string[] {
  const candidates: string[] = [];
  if (NoObjectGeneratedError.isInstance(error) && typeof error.text === 'string' && error.text) {
    candidates.push(error.text);
  }
  if (streamedJsonText) {
    candidates.push(streamedJsonText);
  }
  return candidates;
}

/**
 * When Output.object rejects a near-valid payload, the raw text is often still
 * recoverable — callers run their own normalize step afterwards.
 */
export async function recoverObjectFromGenerationFailure(
  error: unknown,
  streamedJsonText: string,
): Promise<unknown | undefined> {
  for (const text of recoveryCandidates(error, streamedJsonText)) {
    const parsed = await parsePartialJson(text);
    if (
      (parsed.state === 'successful-parse' || parsed.state === 'repaired-parse') &&
      parsed.value !== undefined
    ) {
      return parsed.value;
    }
  }
  return undefined;
}

type StreamPartialState = {
  jsonText: string;
  lastEmitted: string;
  lastListLength: number;
  emittedUpTo: number;
};

function createPartialEmitter(onPartial: (value: unknown) => void) {
  const state: StreamPartialState = {
    jsonText: '',
    lastEmitted: '',
    lastListLength: 0,
    emittedUpTo: 0,
  };

  const emitPartial = async (force = false) => {
    // A fenced reply still shows its sessions as they come.
    const parsed = await parsePartialJson(unwrapJsonReply(state.jsonText));
    if (parsed.state !== 'successful-parse' && parsed.state !== 'repaired-parse') {
      return;
    }
    const decision = shouldEmitCoachPartial({
      previousSnapshot: state.lastEmitted,
      nextValue: parsed.value,
      previousListLength: state.lastListLength,
      charsSinceEmit: state.jsonText.length - state.emittedUpTo,
      minCharsBetweenEmits: force ? 0 : PARTIAL_EMIT_STRIDE_CHARS,
    });
    if (!decision.emit && !force) {
      return;
    }
    if (decision.snapshot === state.lastEmitted) {
      return;
    }
    state.lastEmitted = decision.snapshot;
    state.lastListLength = decision.listLength;
    state.emittedUpTo = state.jsonText.length;
    onPartial(parsed.value);
  };

  return { state, emitPartial };
}

function createReasoningFlusher(onReasoning: (delta: string) => void) {
  let reasoningBuf = '';
  const flushReasoning = () => {
    if (!reasoningBuf) {
      return;
    }
    onReasoning(reasoningBuf);
    reasoningBuf = '';
  };
  const appendReasoning = (text: string) => {
    reasoningBuf += text;
    if (reasoningBuf.length >= REASONING_FLUSH_CHARS) {
      flushReasoning();
    }
  };
  return { flushReasoning, appendReasoning };
}

async function consumeCoachFullStream(
  fullStream: AsyncIterable<{ type: string; text?: string }>,
  onReasoning: (delta: string) => void,
  onPartial: (value: unknown) => void,
): Promise<string> {
  const { state, emitPartial } = createPartialEmitter(onPartial);
  const { flushReasoning, appendReasoning } = createReasoningFlusher(onReasoning);
  let parsedUpTo = 0;

  for await (const part of fullStream) {
    if (part.type === 'reasoning-delta' && typeof part.text === 'string') {
      appendReasoning(part.text);
      continue;
    }
    if (part.type !== 'text-delta' || typeof part.text !== 'string') {
      continue;
    }

    flushReasoning();
    state.jsonText += part.text;
    if (state.jsonText.length - parsedUpTo < PARTIAL_PARSE_STRIDE_CHARS) {
      continue;
    }
    parsedUpTo = state.jsonText.length;
    await emitPartial();
  }

  flushReasoning();
  await emitPartial(true);
  return state.jsonText;
}

async function resolveStructuredOutput(
  result: { output: PromiseLike<unknown>; totalUsage: PromiseLike<LanguageModelUsage> },
  jsonText: string,
): Promise<{ output: unknown; usage: LanguageModelUsage }> {
  try {
    return { output: await result.output, usage: await result.totalUsage };
  } catch (error) {
    const recovered = await recoverObjectFromGenerationFailure(error, jsonText);
    if (recovered !== undefined) {
      return { output: recovered, usage: await result.totalUsage };
    }
    throw error;
  }
}

/** A reply that came back but did not hold a valid object — worth one more try. */
export function isStructuredOutputFailure(error: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(error)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /No object generated|did not match schema|Type validation failed/i.test(message);
}

type StructuredCoachStreamArgs = {
  schema: z.ZodType;
  system: string;
  prompt: string;
  /** Called with each reasoning fragment, in order. */
  onReasoning: (delta: string) => void;
  /** Called with the object rebuilt so far, only when it actually changed. */
  onPartial: (value: unknown) => void;
  /** How long the model deliberates; `structured` unless the workload was measured apart. */
  reasoning?: (typeof COACH_REASONING_LEVEL)[keyof typeof COACH_REASONING_LEVEL];
  /**
   * Hand the schema to the model as text and ask for JSON, instead of constraining the decoding
   * with it. Measured on a week (`plan`): the constrained reply took 45–70 s before its first
   * character, the same week asked this way 18–26 s — valid 4/4 once normalized. The caller's
   * normalize step stays the authority on shape either way.
   */
  schemaInPrompt?: boolean;
};

/**
 * The system prompt with the schema appended, for a reply read as plain JSON. Compact: an
 * indented reply spent thousands of tokens on spaces — time the athlete waits for.
 */
export function withSchemaInstruction(system: string, schema: z.ZodType): string {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema, { io: 'input' }));
  return `${system}\n\nRéponds UNIQUEMENT par un objet JSON compact (sans indentation ni retour à la ligne), conforme à ce JSON Schema, sans bloc de code ni texte autour :\n${jsonSchema}`;
}

/**
 * The JSON inside a reply. Gemini wraps it in a ```json fence now and then — a two-week plan
 * failed twice on it — whatever it is told; the fence is taken off rather than trusted away.
 */
export function unwrapJsonReply(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
}

const jsonReplyGatewayOptions = {
  ...coachStructuredGatewayOptions,
  google: { ...coachStructuredGatewayOptions.google, responseMimeType: 'application/json' },
};

async function resolveJsonReply(
  usage: PromiseLike<LanguageModelUsage>,
  jsonText: string,
): Promise<{ output: unknown; usage: LanguageModelUsage }> {
  const output = await recoverObjectFromGenerationFailure(undefined, unwrapJsonReply(jsonText));
  if (output === undefined) {
    throw new Error('No object generated: the reply held no JSON object.');
  }
  return { output, usage: await usage };
}

async function runStructuredCoachStreamOnce({
  schema,
  system,
  prompt,
  onReasoning,
  onPartial,
  reasoning = COACH_REASONING_LEVEL.structured,
  schemaInPrompt = false,
}: StructuredCoachStreamArgs): Promise<{ output: unknown; usage: LanguageModelUsage }> {
  const result = streamText({
    model: COACH_STRUCTURED_MODEL,
    ...(schemaInPrompt ? {} : { output: Output.object({ schema }) }),
    system: inAnswerLanguage(schemaInPrompt ? withSchemaInstruction(system, schema) : system),
    prompt,
    // No maxOutputTokens here on purpose — see COACH_MAX_OUTPUT_TOKENS.
    reasoning,
    providerOptions: schemaInPrompt ? jsonReplyGatewayOptions : coachStructuredGatewayOptions,
    telemetry: {
      functionId: 'coach-structured',
    },
  });

  const jsonText = await consumeCoachFullStream(result.fullStream, onReasoning, onPartial);
  return schemaInPrompt
    ? resolveJsonReply(result.totalUsage, jsonText)
    : resolveStructuredOutput(result, jsonText);
}

/**
 * Resolves with the raw model output plus its token usage (for cost logging —
 * see src/lib/ai/usage.ts). Callers re-validate the output with their own
 * narrower schema (the generation schema the model sees is deliberately looser
 * than the one the app persists), so widening to `unknown` here loses nothing.
 *
 * A reply that holds no valid object even after recovery is asked again once: the athlete
 * used to be told to retry by hand, which usually worked. Each partial is the whole object so
 * far, so the second attempt's partials simply replace the first's on screen.
 */
export async function runStructuredCoachStream(
  args: StructuredCoachStreamArgs,
): Promise<{ output: unknown; usage: LanguageModelUsage }> {
  try {
    return await runStructuredCoachStreamOnce(args);
  } catch (error) {
    if (!isStructuredOutputFailure(error)) {
      throw error;
    }
    console.warn('[coach-structured] invalid object, retrying once');
    return runStructuredCoachStreamOnce(args);
  }
}
