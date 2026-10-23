# ADR-101: Settled days are read, not rebuilt

**Status:** Accepted
**Date:** 2026-10-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-040](./ADR-040-ios-product-canonical-api-v1.md), [ADR-055](./ADR-055-cron-sync-rebuilds-state-only-on-new-evidence.md)

---

## Context

Opening an older day in the app (Résumé, Sommeil, Récupération, Effort, Adaptation) was slow.
Reading the code showed three costs that grow with the day's age, not with its data:

- `getOrBuildAthleteSnapshot` rebuilds a persisted snapshot when
  `shouldRefreshSnapshotForPhaseDrift` says its phase has aged. The age is measured against the
  wall clock (`MORNING` after 90 min, `RECOVERY_WINDOW` after 120 min, any phase but `END_OF_DAY`
  after 22:00), so a past day's snapshot was always "too old". Every read of a past day ran
  `loadTodayState`, the freshness and phase-context loads and a fingerprint lookup. That function
  is called by `/today`, the day scores and the sleep, recovery, effort and adaptation view models,
  so one screen paid for it several times.
- `/api/v1/today` ran `autoLinkActivitiesOfDay` for every requested day. That is a write path,
  meant for activities arriving on the live day.
- `/api/v1/today` read the activities of the 60 days before **now**. For a day three months ago,
  that was the wrong window: the reads were wasted and the consistency strip of that day was wrong.

Sentry has no performance traces, so there was no measurement to compare against.

---

## Decision

Introduce one rule, `isSettledTrainingDay` (`@sharpit/app/lib/health/activity-status`): a
training day older than yesterday, Europe/Paris, can no longer change by itself.

1. `getOrBuildAthleteSnapshot` skips the phase-drift check for a settled day. The other rebuild
   triggers (a newer briefing, an outdated snapshot shape, an outdated narrative) still apply.
2. `/api/v1/today` does not auto-link a settled day's activities.
3. `/api/v1/today` reads the activities of the 60 days up to the requested day.
4. Every `/api/v1` route returns a `Server-Timing` header (`app;dur=…`, written by `inAppLocale`).
   `/today` also writes one entry per phase (`auth`, `link`, `morning`, `state`, `view`,
   `timeline`, `horizon`, `today`), so the next slow screen can be traced to its phase.

---

## Rationale

Yesterday stays live because its night ends this morning and late sessions still arrive, which
is why the rule starts the day before yesterday. The phase drift exists to move today's verdict
along the day. A finished day has no phase left to move, so rebuilding it only costs time.

`Server-Timing` was chosen over logs because it reaches the client and `curl` with no extra
tooling and adds no log volume. The timing helper (`lib/http/server-timing.ts`) only carries
durations, never athlete data.

---

## Alternatives Considered

### Alternative 1: Cache the whole day response on the server (Redis / CDN)

**Description:** Key each `/api/v1/*` day payload by athlete and day, and invalidate it on writes.

**Pros:**

- Every route of a settled day answers in one cache lookup.

**Cons:**

- Every write path (syncs, webhooks, Health uploads, food log, check-in) would have to invalidate
  the right keys, which is a new consistency surface.
- The response is translated per locale, which multiplies the keys.

**Rejected because:** the rebuild was the cost, not the reads. Removing it keeps one source of
truth and needs no invalidation.

### Alternative 2: Measure first with Sentry tracing, then optimize

**Description:** Turn on `tracesSampleRate` and wait for real traces before changing anything.

**Pros:**

- Decisions based on measured p95s.

**Cons:**

- Adds tracing cost and a wait of several days, while the three costs above are visible in the code.

**Rejected because:** `Server-Timing` gives the per-phase numbers on the next deploy at no cost.

---

## Consequences

### Positive

- A settled day's snapshot is read once per call instead of rebuilt each time.
- A settled day's `/today` makes no write and reads 60 days of activities around that day, not
  around today. Its consistency strip is now correct.
- Every app request reports its server time in `Server-Timing`.

### Negative

- A settled day's snapshot (verdict, phase narrative) is not rebuilt on read. When an old
  activity is synced late, the activities, sleep and health figures of that day update on the
  next read, because they come from their own tables. The snapshot-derived verdict only changes
  when a sync regenerates it explicitly.

### Neutral

- `isSettledTrainingDay` uses Europe/Paris, like `todayIsoDate`. An athlete in another timezone
  sees the boundary move by a few hours.
- The iOS client keeps settled days on disk ([iOS ADR 0021](../../../SHARPIT-APP/docs/adr/0021-past-days-are-kept-on-disk-and-read-ahead-three-at-a-time.md)),
  so a settled day is asked for again only after a write from the app.
