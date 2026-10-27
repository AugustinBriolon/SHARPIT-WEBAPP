# ADR-116: Many-row queries on athlete data must name the athlete

**Status:** Accepted
**Date:** 2026-10-27
**Author:** Augustin Briolon

---

## Context

ADR-093 scoped `PrismaConditionRepository` after an unscoped `condition.findMany` fed one
athlete's conditions into every other athlete's physical-health state. The 2026-10-27 audit
(`docs/audits/2026-10-27-coach-phase-0-error-analysis.md`) measured what that bug had left:

- 173 day snapshots, 1,466 decision records, 520 feature sets and 10 weekly reviews across nine
  accounts carried another athlete's conditions, from 2026-08-26 to 2026-10-17;
- four accounts received morning briefings that named those conditions (« ta gêne au genou
  droit »), and a new account's first coach answer planned around them;
- the leak went both ways: the demo athlete's seeded knee pain reached the main athlete too.

ADR-093 fixed one repository. Nothing stops the next one. A static scan of the server for
many-row queries on models that carry `athleteId` found two more with no filter at all:
`googleAccount.findFirst({ select: { timeZone: true } })` in the Today state and in the daily
strain handler, which read whichever athlete's Google time zone came first.

The tenant-isolation suite (ADR-088) calls route handlers with another athlete's ids; it does
not see queries that never take an id, like these.

## Decision

- `@sharpit/db/client` wraps the Prisma client in a query extension (`athleteScopeExtension`,
  `packages/db/src/athlete-scope.ts`). Before a many-row operation (`findMany`, `findFirst`,
  `count`, `aggregate`, `groupBy`, `updateMany`, `deleteMany`…) on a model with an `athleteId`
  field, it checks that `where` names the athlete: `athleteId`, the `athlete` relation, a row
  `id`, an `AND` holding one of those, or an `OR` whose every branch does. `athleteId: undefined`
  counts as absent, since Prisma drops it and matches every row.
- The list of athlete-owned models is read from the Prisma datamodel, not kept by hand.
- Outside production the guard throws; in production it logs `[athlete-scope] …` and lets the
  query run. `SHARPIT_ATHLETE_SCOPE=enforce|report|off` overrides the default.
- Work that has to span athletes runs inside `acrossAthletes(reason, work)`. Today that is the
  two Garmin pushes keyed by Garmin's own user id.
- The two Google time-zone reads become `findUnique({ where: { athleteId } })`.
- The contaminated rows are deleted in production, after a backup branch, as a one-off data fix
  run by the owner.

## Options considered

### Option A — Query extension, enforced outside production (chosen)

Pros: every query goes through it, including ones written later; the rule lives in one place;
the model list follows the schema. Cons: a runtime check, so it only catches queries that run.
The unit suites fake Prisma, so it bites in development and in the real-database
tenant-isolation suite, not in most tests.

### Option B — Postgres row-level security

Pros: the database refuses foreign rows whatever the code does. Cons: every connection must
set the athlete before querying. Crons, webhooks and the Neon serverless adapter have no such
session today, so it would mean rewiring every entry point and every migration.

### Option C — Lint rule on Prisma calls

Pros: fails before the code runs. Cons: most `where` objects are built in variables or passed
in (`where: recent`, `where: target`), which a syntax rule cannot read. It would flag correct
code and miss the variable cases.

## Consequences

### Positive

- An unscoped read like the one behind ADR-093 fails the first time it runs locally, instead of
  shipping.
- Production logs name any cross-athlete query the guard has not seen yet
  (`[athlete-scope] Model.operation without an athleteId filter`).
- `athlete-scope.test.ts` pins the rule. `client.test.ts` proves the real client refuses an
  unscoped read before reaching the database.

### Negative

- In production the guard reports and does not block. A new unscoped query is logged, not
  stopped, until someone reads the log.
- Single-row writes by id (`update`, `delete`) are not checked; they rely on the caller having
  read the row with its athlete first.
- Admin scripts under `apps/api/scripts` run cross-athlete on purpose. They do not set
  `NODE_ENV=production`, so they throw unless run with `SHARPIT_ATHLETE_SCOPE=report` or wrapped
  in `acrossAthletes`.

### Neutral

- The client keeps its `PrismaClient` type. A query extension changes no model API, so the cast
  in `client.ts` is safe.

## References

- [ADR-093](./ADR-093-physical-health-reads-are-scoped-to-the-athlete.md)
- [ADR-088](./ADR-088-security-review-2026-10-17-loopback-dev-and-accepted-gaps.md)
- `packages/db/src/athlete-scope.ts`, `packages/db/src/client.ts`
- `docs/audits/2026-10-27-coach-phase-0-error-analysis.md`
