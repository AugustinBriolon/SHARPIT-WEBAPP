# ADR-114: Endurance sessions carry a joint warm-up and stretches

**Status:** Accepted
**Date:** 2026-10-26
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-017](./ADR-017-endurance-prescription-authoring.md), [ADR-068](./ADR-068-a-declared-zone-has-a-strategy-and-a-lifecycle.md), [ADR-112](./ADR-112-every-endurance-plan-carries-two-strength-sessions.md)

---

## Context

A run, ride or swim's prescription starts with easy minutes and ends with a cool-down: it warms
the heart, not the joints the session loads, and it never stretches them afterwards. Strength
sessions already open with an activation block and close with stretching (`STRENGTH_BLOCKS`).
The athlete asked for a warm-up before and stretches after every session, in service of reaching
the goal without injury.

Two ways to write them: a fixed library (consistent, free, available for every session already
planned) or the coach for each session (tailored, but tokens, schema weight and only new
sessions). The athlete asked for both.

---

## Decision

1. **A library per sport** in `@sharpit/app/lib/planned-session/routines/session-routines.ts`:
   RUN, BIKE and SWIM each get a warm-up (dynamic mobility, drills) and stretches (30–60 s holds),
   about a minute per move. Strength and other sports get none.
2. **Completed by the declared zones.** Moves are added for each catalog group a training zone
   loads (`getTrainingZoneNotes`, `catalogGroupsForRegion`): sciatic nerve glides and knees to chest
   for the back, soleus stretch for the lower legs, and so on, de-duplicated by name. « sciatique »
   now maps to the back group.
3. **The coach may write its own** through an optional `routines: { warmup, cooldown }` on each
   generated endurance session (3 to 8 moves each, each half nullable). The prompt asks for it only
   when the session calls for it (VO2, hills, a sensitive zone, a race); otherwise null. A malformed
   routine is dropped at normalization, never sinking the session. It is stored on
   `PlannedSession.routines` (JSONB, null → library) and round-trips through `/coach/plan/insert`.
4. **Served in the breakdown.** `buildPlannedSessionSteps` adds `routines` (resolved: coach's half
   when stored, library + zones otherwise, `source` telling which) to endurance breakdowns, in
   `GET /planned-sessions` and in generated proposals. Clients do not resolve anything.
5. **Shown, not sent.** The iPhone drawer shows « Avant » above the steps and « Après » below; the
   web's session dialog lists both. Routines are not pushed to the watch: they happen before the
   watch starts and after it stops.

---

## Consequences

- Every endurance session, past proposals included, now reads with a warm-up and stretches.
- The library is French copy in code, like the strength block guidance; an English reading would
  need a translation pass at the boundary (ADR-096).
- Adaptations (`/coach/adapt`) and the chat tools do not write routines yet; a session they modify
  keeps whatever it stored.
