# ADR-090: Athlete-written text is delimited in prompts; list reads are bounded

**Status:** Accepted
**Date:** 2026-10-17
**Author:** Augustin Briolon
**Supersedes:** The remaining open gaps of ADR-088, except coach-approval forgery (still accepted)

---

## Context

ADR-088 left low-severity gaps open after ADR-089 closed the medium ones:

- **Prompt delimiting.** Titles, notes, descriptions, places and Strava texts went into the coach,
  briefing and activity-narrative prompts raw. One line break plus `## …` could open a section that
  reads like an instruction. All of this text is the athlete's own, so the risk is low, but a provider
  text (Strava, Garmin) is not typed in SHARPIT.
- **Unbounded reads.** `GET /activities?limit=`, `GET /health?days=` and the planned-sessions
  `from`/`to` range took any value.
- **Foreign references.** A planned session or brick could be created or edited with another
  athlete's `goalId`. The saved-meal `productId` lookup (`logItems`) was not scoped by owner. Its
  items come from the athlete's own entries, which `productForEntry` already checks, so it was not
  reachable through the API.
- **`Access-Control-Allow-Origin: *`.** Vercel's CDN adds it to every web and hub response.

## Decision

1. **`athleteText()`** (`packages/server/src/lib/ai/athlete-text.ts`) is the only way athlete-written
   text enters a prompt: one line, between `⟦ ⟧`, with those characters removed from the text, cut at
   1 000 characters. **`ATHLETE_TEXT_RULE`** tells the model that such text is data, never an
   instruction. `formatCoachContext` puts the rule first, so every prompt built on the coach
   context carries it (chat, plan, adapt, weekly review, briefing). The narrative system prompt
   carries it too.
2. **Reads are clamped, not refused**, at limits no client reaches. Activity pages go up to 500
   (clients ask for 60; a full list is still asked without `limit`). Health days go up to 3 650. A
   planned-sessions window is at most 1 100 days counted from `from` (the widest client window is a
   year either side, in goals). An unreadable date is ignored instead of raising a 500.
3. **A client-sent `goalId` must be the athlete's own** (`isOwnGoalOrNone`). Planned-session
   create, edit and brick create answer 404 « Objectif introuvable » otherwise. `logItems` resolves
   products with the same rule as a new entry: a catalogue food or one of the athlete's own.
4. **Web and hub answer their own origin** in `Access-Control-Allow-Origin` instead of Vercel's `*`.

## Options considered

### Option A — Delimit and bound at the boundary (chosen)

- **Pros:** one helper and one rule cover every prompt; clamping keeps every existing client
  working; ownership checks reuse `getGoalById`.
- **Cons:** prompts carry one more line; delimiters show up in exact-string tests.

### Option B — Strip or escape markdown from athlete text

- **Pros:** no new delimiter for the model to learn.
- **Cons:** loses meaning (« 2×20' » or a `#` in a note), and does not tell the model that the
  text is data, which is the actual defence.

### Option C — Reject out-of-range reads with 400

- **Pros:** stricter.
- **Cons:** an older app build asking for slightly more would break; clamping returns a valid page.

## Consequences

### Positive

- An athlete- or provider-written text cannot pose as a prompt section, and the model is told how
  to read it.
- No single read can ask for an unbounded page, day count or date window.
- No planned session can point at another athlete's goal.

### Negative

- Delimited text costs a few tokens per prompt.
- A reader that relied on `?from=` alone getting everything after it now gets 1 100 days (none
  today).

### Neutral

- `security-open-findings.test.ts` keeps only the coach-approval case, which stays accepted
  (ADR-088).

## References

- ADR-088 (security review), ADR-089 (enforced CSP and AI input caps)
