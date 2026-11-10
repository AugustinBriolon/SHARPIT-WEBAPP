# ADR-125: Derived tables keep the current state, not every run

**Status:** Accepted  
**Date:** 2026-11-10  
**Author:** SHARPIT  
**Supersedes:** N/A (amends the "DecisionRecords are append-only" invariant of `docs/models/CORE_ARCHITECTURE.md`)

---

## Context

The production database weighed 227 MB with one active athlete. A catalog-level audit
(`pg_total_relation_size`, row counts per key) showed that three tables held 142 MB, almost all of it
copies:

| Table            | Rows   | Distinct keys | Cause                                                                    |
| ---------------- | ------ | ------------- | ------------------------------------------------------------------------ |
| `DecisionRecord` | 20 401 | 2 687         | `create` on every model run: about 17 rows per model and day             |
| `FeatureSet`     | 42 505 | 2 401         | every recompute adds a version (up to v518 for one day), none is removed |
| `Observation`    | 86 021 | 2 925         | daily Garmin measures get a fresh UUID on every sync, so nothing dedups  |

The copies were not only weight. `findRecent(athleteId, modelId, 14)` is meant to return fourteen days
of history to the fatigue and adaptation models; with seventeen rows per day it returned fourteen runs
of the current day.

`GarminPushInbox` kept every processed push forever. Its payload is raw health data with no athlete
link, so an account deletion never reached it.

No reader uses the history: feature readers take the latest `COMPUTED` version, `findLatest` takes the
latest record of the day, and the rebuild path replays from observations.

---

## Decision

Keep one current row per natural key in the derived tables, enforced where rows are written (the
Prisma repositories), without touching the frozen Core:

- `DecisionRecord`: unique on `(athleteId, modelId, trainingDayId)`; `save` upserts and a re-run
  replaces the day's record, id included.
- `FeatureSet`: saving a `COMPUTED` record deletes the versions it supersedes and any same-version twin.
  `version` stays monotonic.
- `Observation` without a source id: saving replaces earlier rows of the same athlete, type, source and
  timestamp. Observations with an `externalId` keep their existing dedup.
- `GarminPushInbox`: processed rows are deleted after 7 days by the `privacy-purge` cron.

One migration collapses the existing rows under the same rules.

---

## Rationale

- Measured on a throwaway Neon branch of production: 20 401 → 2 687, 42 505 → 2 401 and 86 021 → 2 925
  rows; `neondb` 203 MB → 72 MB after `VACUUM FULL`. The latest `DecisionRecord` per key and every
  observation with a source id are unchanged (id checksums equal before and after).
- Observations stay the only source of truth: a re-read of the same instant by the same source is the
  same measurement, corrected. Nothing an athlete entered is lost.
- Health data should not be kept in copies nobody reads (GDPR art. 5(1)(c) and (e), minimisation and
  storage limitation).
- `findRecent` now returns distinct days, which is what its callers were written for.

---

## Alternatives Considered

### Alternative 1: Keep append-only, purge by age

**Description:** Leave the writes as they are and delete rows older than N days in a cron.

**Pros:**

- Core invariant untouched
- Intra-day audit trail kept for N days

**Cons:**

- Still seventeen rows per model and day inside the window, so `findRecent` stays wrong
- Old days lose their only record instead of keeping one

**Rejected because:** it bounds the weight but keeps the bug and deletes the wrong rows.

### Alternative 2: Skip the write when the payload is unchanged

**Description:** Hash the payload and insert only when it differs from the latest row.

**Pros:**

- Append-only kept for real changes

**Cons:**

- Readiness and Body Battery change through the day: 975 distinct payloads for 376 days would remain,
  and so would several records per day
- A read before every write

**Rejected because:** it removes the exact copies only and leaves several rows per key.

### Alternative 3: Change the id generation in the Core engines

**Description:** Derive deterministic ids in `ObservationEngine`, `FeatureEngine` and the orchestrators.

**Pros:**

- Dedup falls out of the primary key

**Cons:**

- Edits six frozen Core files for a storage concern

**Rejected because:** the repositories can enforce the same rule behind the existing ports.

---

## Consequences

### Positive

- Database about 130 MB smaller, and growth now follows days of data rather than number of syncs
- The fatigue and adaptation models read fourteen distinct days of history
- Processed Garmin payloads no longer outlive their use

### Negative

- The intra-day audit trail is gone: "what did the model say at 14:00" can no longer be answered, only
  the day's last answer
- Fatigue and adaptation outputs will shift, since their history input changes
- `Observation` has no unique constraint on the replacement key (sessions may share a source and a
  start instant), so two concurrent syncs can leave a pair until the next sync collapses it
- During the deploy that applies the migration, the previous build may fail a `DecisionRecord` insert
  on the new unique index until the new build is live

### Scientific debt created

- None

---

## Review Criteria

- If a feature needs intra-day model history (e.g. explaining a verdict that changed during the day),
  add a dedicated, bounded log rather than restoring append-only writes.
- If `Observation` pairs from concurrent syncs are observed in production, add a partial unique index
  on `(athleteId, type, source, timestamp) WHERE "externalId" IS NULL`.
