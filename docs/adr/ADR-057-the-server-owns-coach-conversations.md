# ADR-057: The server owns coach conversations

**Status:** Accepted
**Date:** 2026-09-30
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (follows [ADR-056](./ADR-056-coach-chat-survives-what-breaks-it.md))

---

## Context

The chat route kept nothing. Each client (web and iOS) stored the thread and sent all of it with every
question. After each answer, the client saved the whole thread with a `PUT` to
`/api/coach/conversations/:id`:

- **Two persistence logics.** The web saved on finish, when idle and on unmount; iOS saved after the
  answer, retrying. Each had its own rules for ignored proposals.
- **A payload growing with the thread**, sent on every question and every approval.
- **Answers lost.** An answer still streaming when the screen closed was never saved.
- **An open door.** The route had to trust a history written by the client. ADR-056 added validation, but
  the client stayed the source of truth.

The `Conversation` table already held the thread (`messages`, JSON), so no migration was needed.

---

## Decision

Make the chat route the writer of stored conversations:

1. **A stored conversation sends `{ conversationId, message }`.** The route reads the thread from a
   conversation the athlete owns, and answers 404 otherwise. It adds the message, validates the result
   and answers it. A message already stored takes its place and ends the thread: that is how a coach
   message carrying the athlete's approvals comes back, and how « régénérer » asks a question again.
2. **The route saves the thread in the UI stream's `onEnd`.** `consumeSseStream: consumeStream` lets
   `onEnd` run when the client aborts (partial save). Generation is tied to `req.signal` — stop cancels
   the model call; the server does **not** keep generating behind the athlete's back via `after`.
3. **The coach message carries the server's id.** The route names the answer in its `start` chunk. The
   web already adopted it; iOS now does too, so a later approval reaches the stored message.
4. **Clients stop saving after a turn.**
   - The web invalidates the conversation queries when a turn ends. Its client persistence helpers are
     removed.
   - iOS creates the conversation from the first question, then sends only the turn. Its `save` is
     removed.
5. **`{ messages }` still works.** It serves installed app versions, web drafts not yet stored and
   previews. The server keeps nothing for them.

---

## Rationale

- **One writer.** The server already had the conversation and the answer. Making it the writer removes
  two client implementations and their divergence.
- **Robust to leaving.** Only the server sees the whole stream whatever the client does.
- **No migration, no breaking change.** The table existed, and the old shape stays accepted.

---

## Alternatives Considered

### Alternative 1: Keep client persistence and fix its gaps

**Description:** Keep the `PUT` after each turn and add the missing cases to each client.

**Pros:**

- No change to the route's contract.

**Cons:**

- Still two implementations, still a thread sent in full, still an answer lost when the screen closes
  mid-stream.

**Rejected because:** it treats symptoms in two places instead of removing the cause.

### Alternative 2: A new messages table, one row per message

**Description:** Store messages as rows and append them instead of rewriting the JSON.

**Pros:**

- Appends instead of rewrites, and room for per-message metadata.

**Cons:**

- A migration and a data move, for threads that stay short.

**Rejected because:** the JSON column already serves reads and writes well at this size. It can be revisited
if threads grow long.

---

## Consequences

### Positive

- A question sends one message instead of the whole thread.
- Web and iOS share one persistence rule, the server's.
- Stop aborts the model request; history keeps the user turn and any partial already streamed.

### Negative

- Closing the screen mid-stream no longer finishes a full answer in the background (Live Activity /
  reopen may show a partial or stopped turn).
- The route now does one more read (the stored thread) before answering, in the same region as the
  database.
- Installed app versions keep the old path until they update.

### Scientific debt created

- None.

---

## Review Criteria

- When no installed app version sends `{ messages }` for stored conversations anymore, keep that shape
  only for drafts and previews.
- If a conversation's JSON grows past a few hundred kilobytes, revisit Alternative 2.
- If `[coach-chat] save` errors appear in the logs, make the save retry or fail the turn visibly.
