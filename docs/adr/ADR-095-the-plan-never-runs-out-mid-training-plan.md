# ADR-095: The plan never runs out in the middle of a training plan

**Status:** Accepted
**Date:** 2026-10-19
**Author:** Augustin Briolon

---

## Context

An athlete's week is generated on demand (« Remplir ma semaine », `/api/v1/coach/plan/jobs`). Once
the last generated session is past, nothing is planned: no session reminder, no « Dommage pour
hier », no « Ta séance t'attend » — the pushes that bring the athlete back all hang on planned
sessions. The macro plan (`TrainingPlan`, its `PlanWeek` loads and phases) still runs toward the
race, but the athlete who forgets to generate the next week gets silence and stops opening the
app. Nothing on the server noticed the plan was about to end.

## Decision

A daily cron, `/api/cron/plan-horizon` (06:00 UTC), looks after every athlete with an `ACTIVE`
training plan whose race is ahead, an `active` activity status and the AI-processing consent. For
each, a pure function (`planHorizonStep`) picks one step from the day after the last planned
session (the next week's start):

1. **Three days before it starts — write it.** The next seven days are generated on the server
   with the macro week's target load, phase and focus and the plan's goal, as a background plan
   job (the same Redis job the app's generator reads, kept five days). Push « Ta semaine est
   prête », which opens the generator, where the athlete keeps what suits them.
2. **Two days before — one reminder** if nothing was kept.
3. **The day before — add it as written**, through the same insertion as the app's « Ajouter »
   (`insertGeneratedWeek`), then push « Ta semaine est dans ton plan ».

The steps stop as soon as any session exists on or after the week's start. A failed or expired
generation is tried again the next day. The generation records its tokens as the AI feature
`autoplan`: the athlete did not ask, so it never counts against their coach budget, and it skips
the request rate limit. The pushes follow the athlete's `sessionReminder` preference; the
insertion does not — it is the safety net.

The app shows the waiting week on Résumé (`planHorizon` on `/api/v1/today`, today only: « Ta
semaine est prête »), and the weekly review ends with « Préparer ma semaine », which opens the
generator.

## Options considered

### Option A — The weekly review as the ritual, nothing automatic

The Sunday review asks to prepare the week. Cheap and habit-forming, but an athlete who ignores
the push is back to an empty plan: the gap this ADR closes stays open.

### Option B — Reminders only

A card two days before the plan ends, then pushes. The athlete keeps full control, but nothing
guarantees a planned week: the silence returns after the last reminder.

### Option C — A durable draft status on `PlannedSession`

Write the automatic week as `PlannedSession` rows marked as drafts. Survives any cache, shows in
Plan directly, but needs a migration, a status every reader of planned sessions must filter
(reminders, calendar sync, the Gate, compliance) and a validation flow of its own. The Redis plan
job already carries a generated week to the generator; reusing it costs nothing new.

### Option D — A setting « Automatique / Je valide / Manuel »

Lets each athlete pick. Deferred until someone asks: the default chosen here (propose, remind,
then add) serves the athlete who forgets, and the athlete who plans by hand is never touched since
the steps stop as soon as a session exists.

**Chosen:** Option B's reminders backed by an automatic generation and insertion, plus Option A's button in the review; not C, not D yet.

## Consequences

### Positive

- An athlete in the middle of a plan always has a planned week, so the session pushes keep coming.
- The week follows the macro plan (load, phase, focus) instead of a generic seven days.
- No schema change; the generator, the Gate and the insertion are the ones the athlete already uses.

### Negative

- One LLM generation per athlete-week on the server's bill, recorded as `autoplan`.
- The cron runs athletes one at a time under a 300 s limit: fine at the current athlete count,
  to batch (or fan out per athlete) as the number of running plans grows.
- A week the athlete never opened lands as the coach proposed it; they adjust it in Plan.

### Neutral

- A plan whose race is past is left alone; proposing the next goal is a separate step.
- An athlete marked injured, on holiday or unavailable gets no automatic week.

## References

- `packages/server/src/lib/coach/plan/plan-horizon-step.ts`, `plan-horizon.ts`
- `packages/server/src/handlers/cron/plan-horizon/handler.ts`
- SHARPIT-APP `PlanHorizonCard`, `WeeklyReviewView` « Préparer ma semaine »
