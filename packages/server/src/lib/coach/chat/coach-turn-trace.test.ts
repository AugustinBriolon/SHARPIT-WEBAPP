import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { coachTurnFromMessages, coachTurnOutcome, coachTurnTraceRecord } from './coach-turn-trace';

// The coach evals replay the turns recorded here, so a turn's outcome and numbers must match
// what the athlete got (ADR-117).
describe('coachTurnOutcome', () => {
  it('reads a finished answer as ok', () => {
    expect(coachTurnOutcome({ isAborted: false, finishedWithoutAnswer: false })).toBe('ok');
  });

  it('reads a finished turn with no text and no tool call as empty', () => {
    expect(coachTurnOutcome({ isAborted: false, finishedWithoutAnswer: true })).toBe('empty');
  });

  it('reads a turn the athlete stopped as aborted, even when a model had answered', () => {
    expect(coachTurnOutcome({ isAborted: true, finishedWithoutAnswer: false })).toBe('aborted');
  });

  it('reads a turn no model attempt finished as an error', () => {
    expect(coachTurnOutcome({ isAborted: false, finishedWithoutAnswer: null })).toBe('error');
  });
});

describe('coachTurnTraceRecord', () => {
  const base = {
    athleteId: 'athlete-b',
    conversationId: 'conv-1',
    intent: 'plan',
    systemPrompt: 'system',
    turn: null,
    outcome: 'ok' as const,
    model: 'gateway/model',
    finishReason: 'stop',
  };

  it('maps the handler measures onto the stored columns', () => {
    const record = coachTurnTraceRecord({
      ...base,
      measures: {
        steps: 3,
        inputTokens: 1200,
        cachedInputTokens: 900,
        outputTokens: 80,
        firstTextMs: 2100,
        totalMs: 4800,
        promptChars: 14000,
      },
    });

    expect(record).toMatchObject({
      steps: 3,
      inputTokens: 1200,
      cachedInputTokens: 900,
      outputTokens: 80,
      firstTextMs: 2100,
      latencyMs: 4800,
    });
  });

  it('counts a missing measure as zero, and a missing first-text time as null', () => {
    const record = coachTurnTraceRecord({ ...base, measures: { totalMs: 900 } });

    expect(record).toMatchObject({
      steps: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      firstTextMs: null,
      latencyMs: 900,
    });
  });

  it('keeps the prompt the model saw and the athlete it belongs to', () => {
    const record = coachTurnTraceRecord({ ...base, measures: {} });

    expect(record.systemPrompt).toBe('system');
    expect(record.athleteId).toBe('athlete-b');
    expect(record.conversationId).toBe('conv-1');
  });
});

describe('coachTurnFromMessages', () => {
  const user: UIMessage = { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Mon TSB ?' }] };

  it('keeps the text and each tool call with its input, output and state', () => {
    const answer = {
      id: 'a',
      role: 'assistant',
      parts: [
        {
          type: 'tool-explainDayScores',
          toolCallId: 't1',
          state: 'output-available',
          input: { day: 'today' },
          output: { tsb: -12 },
        },
        { type: 'text', text: 'Ton TSB est ' },
        { type: 'text', text: 'de -12.' },
      ],
    } as UIMessage;

    expect(coachTurnFromMessages([user, answer])).toEqual({
      text: 'Ton TSB est de -12.',
      tools: [
        {
          name: 'explainDayScores',
          input: { day: 'today' },
          output: { tsb: -12 },
          state: 'output-available',
        },
      ],
    });
  });

  it('reads the last assistant message, not an earlier one', () => {
    const earlier = { id: 'a0', role: 'assistant', parts: [{ type: 'text', text: 'avant' }] };
    const last = { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'après' }] };

    expect(coachTurnFromMessages([earlier, user, last] as UIMessage[])?.text).toBe('après');
  });

  it('returns null when the thread holds no assistant message', () => {
    expect(coachTurnFromMessages([user])).toBeNull();
  });
});
