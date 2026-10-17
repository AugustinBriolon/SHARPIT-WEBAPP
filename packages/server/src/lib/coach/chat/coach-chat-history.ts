import { safeValidateUIMessages, type UIMessage } from 'ai';
import { dismissUnresolvedCalendarTools } from '@sharpit/app/lib/coach/chat/tools/coach-tool-parts';

/**
 * The conversation a coach turn answers, made safe to hand to the model.
 *
 * Two request shapes:
 * - **server history** — `{ conversationId, message }`: the server reads the stored conversation,
 *   adds the new message (or the coach message whose proposals the athlete just answered), and
 *   saves the result when the answer ends. The client sends one message, not the whole thread.
 * - **client history** — `{ messages }`: the client sends the whole thread, as every client did
 *   before, and saves it itself. Kept for app versions already installed and for conversations
 *   that are never stored (a demo, an ephemeral thread).
 */
export type CoachChatHistory =
  | { ok: true; messages: UIMessage[]; conversationId: string | null }
  | { ok: false; reason: 'malformed' | 'not-found' | 'too-large' };

/**
 * What a client may send in one request, measured before any model work: a thread past this costs
 * one oversized model call before the AI budget can refuse the next. Far above a real thread
 * (a long one is ~40 messages, ~60 k characters with its tool results).
 */
export const COACH_CLIENT_THREAD_LIMITS = { messages: 120, characters: 300_000 } as const;

function exceedsClientLimits(messages: unknown[]): boolean {
  return (
    messages.length > COACH_CLIENT_THREAD_LIMITS.messages ||
    JSON.stringify(messages).length > COACH_CLIENT_THREAD_LIMITS.characters
  );
}

/** Reads the messages of a conversation the athlete owns; null when there is none. */
export type LoadStoredConversation = (conversationId: string) => Promise<unknown[] | null>;

/**
 * A new question closes the calendar proposals left unanswered, as the web composer already does
 * before sending. Without it, a proposal the athlete ignored reaches the model as a tool call with
 * no result, which the provider rejects: the answer breaks before its first word.
 */
export function closeUnansweredProposals(messages: UIMessage[]): UIMessage[] {
  return messages.at(-1)?.role === 'user' ? dismissUnresolvedCalendarTools(messages) : messages;
}

/**
 * The stored thread with the client's message. A message already stored takes its place and ends
 * the thread: a coach message now carrying the athlete's approvals, or a question asked again
 * (« régénérer »), whose previous answer goes. Anything else is appended.
 */
export function withIncomingMessage(stored: UIMessage[], incoming: UIMessage): UIMessage[] {
  const index = stored.findIndex((message) => message.id === incoming.id);
  return index === -1 ? [...stored, incoming] : [...stored.slice(0, index), incoming];
}

async function validated(messages: unknown): Promise<UIMessage[] | null> {
  const result = await safeValidateUIMessages({ messages });
  return result.success ? closeUnansweredProposals(result.data) : null;
}

async function readServerHistory(
  conversationId: string,
  message: unknown,
  loadStored: LoadStoredConversation,
): Promise<CoachChatHistory> {
  if (exceedsClientLimits([message])) {
    return { ok: false, reason: 'too-large' };
  }
  const [incoming] = (await validated([message])) ?? [];
  if (!incoming) {
    return { ok: false, reason: 'malformed' };
  }
  const stored = await loadStored(conversationId);
  if (!stored) {
    return { ok: false, reason: 'not-found' };
  }
  // A stored thread that no longer validates is not the athlete's fault: start from the message.
  const thread = (await validated(stored)) ?? [];
  const messages = await validated(withIncomingMessage(thread, incoming));
  return messages ? { ok: true, messages, conversationId } : { ok: false, reason: 'malformed' };
}

/** Reads a coach chat request body into the thread to answer: a malformed one is refused. */
export async function readCoachChatHistory(
  body: unknown,
  loadStored: LoadStoredConversation,
): Promise<CoachChatHistory> {
  const { conversationId, message, messages } = (body ?? {}) as {
    conversationId?: unknown;
    message?: unknown;
    messages?: unknown;
  };
  if (typeof conversationId === 'string' && conversationId && message !== undefined) {
    return readServerHistory(conversationId, message, loadStored);
  }
  if (Array.isArray(messages) && exceedsClientLimits(messages)) {
    return { ok: false, reason: 'too-large' };
  }
  const thread = await validated(messages);
  return thread
    ? { ok: true, messages: thread, conversationId: null }
    : { ok: false, reason: 'malformed' };
}
