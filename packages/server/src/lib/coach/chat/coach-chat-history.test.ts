import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  closeUnansweredProposals,
  COACH_CLIENT_THREAD_LIMITS,
  readCoachChatHistory,
  withIncomingMessage,
} from '@sharpit/server/lib/coach/chat/coach-chat-history';

const noStoredConversation = async () => null;

const proposal = {
  type: 'tool-createPlannedSession',
  toolCallId: 'call-1',
  state: 'approval-requested',
  input: { title: 'Seuil' },
  approval: { id: 'approval-1' },
};

function conversation(last: 'user' | 'assistant'): UIMessage[] {
  const messages = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Place un seuil jeudi' }] },
    { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Je propose :' }, proposal] },
  ] as UIMessage[];
  return last === 'user'
    ? [...messages, { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Et vendredi ?' }] }]
    : messages;
}

function proposalState(messages: UIMessage[]): string | undefined {
  const part = messages[1]!.parts[1] as { state?: string };
  return part.state;
}

describe('closeUnansweredProposals', () => {
  it('denies a proposal the athlete moved on from', () => {
    expect(proposalState(closeUnansweredProposals(conversation('user')))).toBe('output-denied');
  });

  it('keeps a proposal still waiting on the last coach turn', () => {
    expect(proposalState(closeUnansweredProposals(conversation('assistant')))).toBe(
      'approval-requested',
    );
  });
});

describe('readCoachChatHistory', () => {
  it('accepts a well-formed conversation, with its ignored proposals closed', async () => {
    const history = await readCoachChatHistory(
      { messages: conversation('user') },
      noStoredConversation,
    );
    expect(history).toMatchObject({ ok: true, conversationId: null });
    expect(history.ok && proposalState(history.messages)).toBe('output-denied');
  });

  it('refuses a body without messages', async () => {
    expect(await readCoachChatHistory({}, noStoredConversation)).toEqual({
      ok: false,
      reason: 'malformed',
    });
    expect(await readCoachChatHistory(null, noStoredConversation)).toMatchObject({ ok: false });
  });

  it('refuses a message without parts', async () => {
    expect(
      await readCoachChatHistory({ messages: [{ id: 'u1', role: 'user' }] }, noStoredConversation),
    ).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('withIncomingMessage', () => {
  it('appends a new question', () => {
    const stored = conversation('assistant');
    const question = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Et vendredi ?' }] };
    expect(withIncomingMessage(stored, question as UIMessage).map((m) => m.id)).toEqual([
      'u1',
      'a1',
      'u2',
    ]);
  });

  it('replaces the coach message whose proposals the athlete answered', () => {
    const stored = conversation('assistant');
    const answered = { ...stored[1]!, parts: [{ type: 'text', text: 'Je propose :' }] };
    const merged = withIncomingMessage(stored, answered as UIMessage);
    expect(merged.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(merged[1]!.parts).toHaveLength(1);
  });
});

describe('withIncomingMessage · regenerate', () => {
  it('drops the previous answer when a stored question is asked again', () => {
    const stored = conversation('user');
    expect(withIncomingMessage(stored, stored[0]!).map((m) => m.id)).toEqual(['u1']);
  });
});

describe('readCoachChatHistory · server history', () => {
  const question = { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Et vendredi ?' }] };

  it('answers the stored thread plus the new question, closing the ignored proposal', async () => {
    const history = await readCoachChatHistory(
      { conversationId: 'c1', message: question },
      async (id) => (id === 'c1' ? conversation('assistant') : null),
    );
    expect(history).toMatchObject({ ok: true, conversationId: 'c1' });
    expect(history.ok && history.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2']);
    expect(history.ok && proposalState(history.messages)).toBe('output-denied');
  });

  it('refuses a conversation the athlete does not own', async () => {
    expect(
      await readCoachChatHistory(
        { conversationId: 'c-foreign', message: question },
        async () => null,
      ),
    ).toEqual({ ok: false, reason: 'not-found' });
  });

  it('refuses a malformed message without reading the conversation', async () => {
    let read = false;
    const history = await readCoachChatHistory(
      { conversationId: 'c1', message: { id: 'u2', role: 'user' } },
      async () => {
        read = true;
        return [];
      },
    );
    expect(history).toEqual({ ok: false, reason: 'malformed' });
    expect(read).toBe(false);
  });

  it('starts from the message when the stored thread no longer validates', async () => {
    const history = await readCoachChatHistory(
      { conversationId: 'c1', message: question },
      async () => [{ id: 'broken' }],
    );
    expect(history.ok && history.messages.map((m) => m.id)).toEqual(['u2']);
  });
});

describe('readCoachChatHistory · client size limits', () => {
  const said = (id: string, text: string) => ({
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
  });

  it('refuses a client thread with too many messages', async () => {
    const messages = Array.from({ length: COACH_CLIENT_THREAD_LIMITS.messages + 1 }, (_, i) =>
      said(`u${i}`, 'ok'),
    );
    expect(await readCoachChatHistory({ messages }, noStoredConversation)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('refuses a client thread past the character limit', async () => {
    const messages = [said('u1', 'x'.repeat(COACH_CLIENT_THREAD_LIMITS.characters))];
    expect(await readCoachChatHistory({ messages }, noStoredConversation)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('refuses an oversized message without reading the stored conversation', async () => {
    let read = false;
    const message = said('u2', 'x'.repeat(COACH_CLIENT_THREAD_LIMITS.characters));
    const history = await readCoachChatHistory({ conversationId: 'c1', message }, async () => {
      read = true;
      return [];
    });
    expect(history).toEqual({ ok: false, reason: 'too-large' });
    expect(read).toBe(false);
  });

  it('accepts a long but real thread', async () => {
    const messages = Array.from({ length: 40 }, (_, i) => said(`u${i}`, 'x'.repeat(1_500)));
    expect((await readCoachChatHistory({ messages }, noStoredConversation)).ok).toBe(true);
  });
});
