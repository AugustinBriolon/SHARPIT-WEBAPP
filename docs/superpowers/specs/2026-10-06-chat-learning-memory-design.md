# Chat learning memory injection (P3b) — Design

**Date:** 2026-10-06  
**Status:** Approved for implementation  
**Depends on:** P2 `loadLearningMemoryBlock`

## Goal

Inject the same Decision Memory learning prompt block used by plan/adapt into the coach **chat** system prompt.

## Non-goals

- Knowledge RAG in chat (P1/P3a stay plan/adapt only)
- Persisted calibration signals
- Changing chat tools or scope logic

## Design

In `buildCoachSystemPrompt`:

1. Load `loadLearningMemoryBlock(athleteId)` in the existing `Promise.all` (alongside context / agenda / discuss).
2. Append the block after `formatCoachContext(...)` when non-empty.
3. Empty string → no section (typed refuse).

## Success criteria

- [ ] Unit test: mocked loader returning a sentence appears in `system`
- [ ] Unit test: empty loader → no "Apprentissages Decision Memory" header
