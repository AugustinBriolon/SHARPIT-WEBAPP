# ADR-120: Today names a trip the plan no longer fits

**Status:** Accepted
**Date:** 2026-11-06
**Author:** Augustin Briolon
**Related:** [ADR-040](./ADR-040-ios-product-canonical-api-v1.md), [ADR-095](./ADR-095-the-plan-never-runs-out-mid-training-plan.md), [ADR-097](./ADR-097-free-is-the-athletes-data-coaching-is-pro-only.md), iOS ADR 0029

---

## Context

A trip or a constraint (`AthleteTravelContext`, type `TRAVEL` / `CONSTRAINT`) says that training changes on some days: paused (`NONE`), lighter (`REDUCED`), narrowed to some sports (`allowedDisciplines`), or mobility only. Saving one tags the planned sessions it covers with its place, but it changes none of them. A run planned on a paused day stays in the plan until the athlete asks the coach to adjust it.

The iPhone first opened the plan adapter by itself after each such save (iOS ADR 0028). The athlete found it intrusive: a sheet reshaping the week came up with no warning. What they asked for instead was to be told on Résumé that a trip and the plan disagree, and to choose when to adjust.

Telling whether a session does not fit belongs on the server. That is where the trips and the sessions live, and where `findTravelSessionViolation` already refuses writes that break a window.

## Decision

- `GET /api/v1/today` carries `travelConflict` for today (null on any other day), read alongside `planHorizon`. It is either null or `{ travelId, type, name, startDate, endDate, trainingConstraint, sessionCount }`.
- `readTravelConflictView` reads the trips and constraints that overlap the next 14 days (the adapter's default horizon, `TRAVEL_CONFLICT_HORIZON_DAYS`), and the sessions not yet done in that window. It returns the earliest window with at least one session that does not fit.
- A session does not fit a window when either holds:
  - `findTravelSessionViolation` refuses it: a pause, or a sport off the allowed list. This is the rule the plan's writes already obey.
  - The window is `REDUCED` and the session is key (`isKey`) or hard (`HARD_SESSION_INTENSITIES`, the plan gate's set).
- The conflict is recomputed on every read and no state is stored. Once the sessions fit, the conflict is gone. A read that fails logs and answers null, so Today is never refused because of it.
- The field is data about the athlete's own plan, so it is not Pro-gated (ADR-097 gates the coaching). Only the adjustment it leads to is Pro.

## Options considered

### Option A — Compute the conflict on the iPhone

The app already reads trips and sessions. Cons: it duplicates the violation rule in Swift, the web cannot show it, and Résumé would need two more reads.

### Option B — A conflict field on `/api/v1/today`, recomputed on read (chosen)

One rule, shared with the write guard. It is free to show on the web later. It clears itself once the plan is fixed, with no dismiss state. Cons: two more queries on today's read (in parallel with the plan horizon, bounded to 14 days).

### Option C — Store a conflict when a trip is saved

Cons: it goes stale as soon as a session moves, is deleted or is added by the coach. It would have to be invalidated on every plan write.

## Consequences

### Positive

- The athlete is told about a trip the plan does not fit, on Résumé, without any sheet opening by itself.
- The card leaves on its own once the sessions fit, whoever changed them (the adapter, a hand edit, the coach in chat).

### Negative

- A conflict the athlete chooses to keep (they refuse the adapter's changes) stays shown until the trip ends. There is no « Ignorer » yet.
- `REDUCED` is judged by intensity and the key flag, not by load. A long easy session on a lighter day is not flagged.

### Neutral

- `INJURY` windows are not read: they are not trips, and the athlete does not set them from the trips list.
- The web shows nothing yet; the field is ready for it.

## References

- `packages/server/src/lib/travel-context/travel-conflict.ts`
- `packages/server/src/lib/travel-context/session-compatibility.ts`
- `packages/server/src/handlers/v1/today/handler.ts`
