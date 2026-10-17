# ADR-093: Physical-health conditions are read and written per athlete

**Status:** Accepted
**Date:** 2026-10-18
**Author:** Augustin Briolon

---

## Context

A new strength-only account with no declared pain received a first week padded with pelvic and
foot prehab (clamshells, dead bugs, calf raises, psoas stretches), and its one goal-specific
session was rejected on `PHYSICAL_HEALTH_LIMITED`.

Its Digital Twin's `physicalHealthState` held six conditions it never entered — « Pied en
canard », « Bassin rétroversé », « Nerf sciatique »… — owned by two other athletes. The cause was
`PrismaConditionRepository`:

- `findAllForInference` and `getConditionHistoryForFeatures` ran `condition.findMany` with no
  `athleteId` filter, so every physical-health and feature run read **every** athlete's conditions;
- `applyInferredUpdates` wrote the inferred state back by condition id alone, across athletes.

On 2026-10-18 all ten Digital Twins in production carried foreign conditions (50 entries), and
the plan coach, the Gate and the coach context had been reading them. One more lookup had the
same shape: `PrismaSessionStreamProvider.getSessionStream` matched an activity by Garmin or Strava
id alone, ids that are unique per athlete only.

## Decision

- The Core port `ConditionRepository` takes the athlete id on every method
  (`findAllForInference(athleteId, day)`, `getConditionHistoryForFeatures(athleteId, day)`,
  `applyInferredUpdates(athleteId, updates)`). Core is frozen; this is a correctness and privacy
  fix to a port signature, not a new engine.
- The Prisma adapter filters every read by `athleteId` and writes with
  `updateMany({ where: { id, athleteId } })`, so a foreign row can never be touched.
- The session stream lookup adds `athleteId` to its provider-id match.
- The polluted `physicalHealthState` rows are cleared in production so the next run recomputes
  them from each athlete's own conditions (a one-off data fix, run with the owner's approval).

## Options considered

### Option A — Scope the port and the adapter (chosen)

Pros: the athlete scope is part of the contract, so a future adapter cannot forget it; the
compiler finds every caller. Cons: touches a frozen Core interface.

### Option B — Scope inside the adapter only, constructing one repository per athlete

Pros: Core untouched. Cons: the repositories are singletons wired once per process; making them
per-athlete changes the engines' lifecycle, and the port would still allow an unscoped adapter.

## Consequences

### Positive

- An athlete's physical-health state, the coach context and the Gate only see that athlete's
  conditions.
- `prisma-condition-repository.test.ts` pins the filter on all three methods.

### Negative

- Plans, coaching decisions and coach answers produced before the fix may have been shaped by
  another athlete's conditions; they are not rewritten.

### Neutral

- The tenant-isolation suite (ADR-088) covered route handlers, not engine adapters; this class of
  bug sat below it.

## References

- `packages/core/src/physical-health/repository.ts`
- `packages/server/src/infrastructure/physical-health/prisma-condition-repository.ts`
- `packages/server/src/infrastructure/features/prisma-session-stream-provider.ts`
