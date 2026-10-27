import { describe, expect, it } from 'vitest';
import { coachTurnOutcome, coachTurnTraceRecord } from './coach-turn-trace';

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
