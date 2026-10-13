# ADR-078: One race, one activity — multisport unification and goal link

**Status:** Accepted
**Date:** 2026-10-12
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (extends ADR-027 / ADR-054 provider merging and ADR-059 brick views)

---

## Context

On 2026-10-11 the athlete raced a triathlon set as a RACE goal. The same effort landed as seven
activities: Apple Health's `.swimBikeRun` mapped to OTHER (« Séance », duration only), Garmin's
multisport parent as TRIATHLON with `multisportLegs`, and Strava's split recording as five rows
(swim, T1, bike, T2, run). `findMatchingActivity` only compares rows of the same `type`, so none
merged. `stravaId` is `@unique`, so five Strava ids cannot sit on one row. Nothing linked an
activity to a goal directly (only `GoalAchievement`, one per goal, or via `PlannedSession.goalId`),
and the iOS Résumé payload carried no goal at all, so race day looked like any other day.

---

## Decision

- **Hide, don't delete.** `Activity.mergedIntoId` (self relation, `onDelete: SetNull`) marks a row
  absorbed into a multisport parent. Reads go through `visibleActivityWhere` (`{ mergedIntoId: null }`).
  External-id lookups still find absorbed rows, so a re-synced Strava leg stays hidden.
  Records deliberately keep absorbed legs: a hidden Strava run/bike leg is the only per-sport row
  of that race, never a duplicate.
- **When to unify** (`lib/activity/multisport/unify-multisport.ts`, after each Strava, Garmin and
  Apple Health sync, per athlete and day):
  - A provider TRIATHLON row exists → it absorbs SWIM/BIKE/RUN rows, STRENGTH/OTHER rows ≤ 15 min,
    and whole-race OTHER/TRIATHLON copies inside its window ± 5 min.
  - No parent → a new TRIATHLON parent is built from a swim → bike → run chain (gaps ≤ 10 min) only
    when a RACE goal falls that day or Strava recorded both T1 and T2 as their own rows. A plain
    training brick without a goal is never touched.
  - Title: goal title on race day, else « Triathlon » + format (XS/S/M/L/XL from distances).
    User-written titles are never replaced.
- **Concurrency.** Load, plan and apply run in one interactive `prisma.$transaction` holding
  `pg_advisory_xact_lock(hashtext('<athleteId>:<dayKey>'))`.
- **Goal link.** `Activity.goalId` (many activities per goal), set automatically on the race day
  (single-sport races only when distance is within ±15 % of the race distance) and editable via
  `PATCH /api/v1/activities/[id]`. The linked activity feeds the `_performance` achievement.
- **Race moment.** `selectRaceMoment` exposes `race` (`raceDay` on the goal date, `postRace` the day
  after only, when a linked activity exists — first 3 days, cut to 1 on 2026-10-13) on the iOS and web Today payloads.
- **Deletion.** Deleting a parent deletes its absorbed legs too (no tombstone exists; a provider
  re-import rebuilds the race).
- **Athlete model.** Core SESSION observations of absorbed rows the parent doesn't stand on are
  dropped, so load is not counted twice.

---

## Options considered

### Option A — Hidden rows with `mergedIntoId` (chosen)

Reversible, keeps per-leg streams and provider ids for re-sync idempotency. Cost: every activity
read must apply `visibleActivityWhere`; a missed read leaks duplicates.

### Option B — Physically delete absorbed rows

No read filter needed. Irreversible, loses Strava leg streams (the only per-sport data of a
Strava-built race), and the next sync re-imports the rows since there is no tombstone.

### Option C — Store extra provider ids on the parent (`stravaIds String[]`)

Avoids hidden rows, but breaks the `@unique` external-id lookup every sync relies on and still
needs the leg data stored somewhere.

### Option D — Cross-type matching in `findMatchingActivity`

Smallest diff, but a pairwise matcher cannot express "five rows form one race", and loosening the
type check would merge unrelated same-time sessions.

---

## Consequences

### Positive

- One visible activity per race; load, PMC, lists and coach context stop counting it up to 7×.
- The Résumé shows race day and a post-race review card; activity detail shows the race result.
- Backfill (`yarn workspace @sharpit/api db:unify:multisport`, dry-run by default, `--apply` needs
  `--athlete` or `--all`) repairs past races.

### Negative

- New activity reads must remember `visibleActivityWhere`.
- Day features computed before observations were dropped stay stale until the next recompute.
- Planned sessions linked to legs other than the first stay linked to hidden rows.
- First interactive transaction in the codebase (supported by `@prisma/adapter-neon` 6.19.3).

### Neutral

- An app build sending `TRIATHLON` from Apple Health needs this server deployed first.
- Hidden rows remain readable by id (records and leg links open them).

---

## References

- `packages/db/prisma/migrations/20261012100000_activity_merge_and_goal_link`
- `packages/server/src/lib/activity/multisport/`
- `packages/app/src/lib/goals/race-moment.ts`
- `apps/api/scripts/unify-multisport.ts`
- ADR-027, ADR-054, ADR-059
