# ADR-106: Planned sessions reach the watch through the Training API

**Status:** Accepted  
**Date:** 2026-10-25  
**Author:** Augustin Briolon (with Claude Code)  
**Follows:** [ADR-105](./ADR-105-garmin-connects-through-the-developer-program-oauth-and-push.md), [ADR-016](./ADR-016-endurance-prescription-relative-targets.md)

---

## Context

ADR-105 left one Garmin feature for later: sending planned sessions to the watch. The athlete
grants `WORKOUT_IMPORT` on Garmin's consent page, and the Starter tier includes the Training API
V2 (`docs/garmin/Training API V2 2.0`). SharpIt once sent sessions through Connect's internal API.
That path was retired with the old integration (`90989228`), but the `PlannedSession`
receipt columns (`garminWorkoutId`, `garminWorkoutScheduledDate`, `garminWorkoutPushedAt`,
`garminWorkoutThresholds`) and the endurance prescription with relative targets (ADR-016)
remain.

What the spec imposes:

- A workout is created (`POST /workoutportal/workout/v2`), then scheduled on a day
  (`POST /training-api/schedule`). The watch picks it up on its next sync.
- Starter allows 200 calls per athlete a day and 100 per minute for the whole app. A send costs
  two calls, a resend three.
- One sport holds at most 100 steps. A pool step takes no primary target: pace goes in the
  secondary `PACE_ZONE`, in m/s, and needs the pool unit.
- 412 means the athlete did not grant the import, 429 means the quota is spent.

---

## Decision

1. **Endurance first, sent by hand.** `POST /api/garmin/workouts/from-planned-session`
   (and its `/api/v1` twin) sends one run, ride or pool session. Strength and bricks
   (`MULTI_SPORT`) come later. Nothing is sent automatically.
2. **Pro-only.** The route answers `pro_required` to a Free athlete (ADR-097).
3. **Targets resolved at send time** against the current thresholds, which are stored with the
   receipt so `garminPushStaleness` can flag a session whose references moved (ADR-016).
4. **A second send is explicit.** A session already sent is refused (409 `already_pushed`)
   unless `replace` is set. Replacing deletes the previous workout first. A workout that cannot be
   scheduled is deleted again and no receipt is written.
5. **Refusals carry a code** (`permission`, `not_connected`, `rate_limited`, `reconnect`…). A lost
   Garmin session answers 403 `reconnect`, never 401, which the clients read as a lost SharpIt
   session.

---

## Rationale

- Manual sends keep the athlete in control and spend a known number of calls. An automatic
  week sync would use the daily quota quickly on a busy plan.
- Endurance is what a triathlete runs every day. Strength needs the Garmin exercise taxonomy
  (Appendix B) mapped and checked; bricks need the segment and transition rules. Each is its
  own change.
- The receipt columns and the staleness logic already exist, so the change only adds the V2
  payload and the HTTP client.

---

## Alternatives Considered

### Alternative 1: Send the whole week automatically

**Pros:** nothing to tap.

**Cons:** 2 to 3 calls per session against 200 a day, and every re-plan resends.

**Rejected because:** the quota and the re-plans make it a separate design, with a budget.

### Alternative 2: Update the workout in place (`PUT`) on a resend

**Pros:** one call less, the workout id stays.

**Cons:** the schedule id is not stored, so a moved session would need its schedule found and
updated too.

**Rejected because:** delete and create covers a changed date and a changed structure with
the same code.

---

## Consequences

### Positive

- A Pro athlete sends a run, a ride or a pool session to the watch in one tap, with today's
  pace, power or heart-rate bands.

### Negative

- Strength sessions and bricks cannot be sent yet.
- Editing or deleting a session does not update the watch. The receipt shows a moved date, a
  threshold change shows as stale, and the athlete resends.
- The create URL differs from the rest of the spec (`workoutportal`). It is used as written and
  checked on the first real send.

### Neutral

- The deleted workout's schedule is assumed to go with it, as in Connect (`shortcut:` in
  `garmin-training-api.ts`).
