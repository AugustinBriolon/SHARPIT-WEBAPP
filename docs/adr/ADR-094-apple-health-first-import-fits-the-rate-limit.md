# ADR-094: A first Apple Health import fits in one rate-limit window and resumes on its own

**Status:** Accepted
**Date:** 2026-10-18
**Author:** Augustin Briolon

---

## Context

A new account on an iPhone that already shared Apple Health got 31 sessions, from October 2025 to
11 January 2026, and nothing more recent.

Switching Apple Health on sends a year of history, oldest first: the days in batches of 31 and the
workouts in batches of 5 (a call with long streams must stay under the host's request size). A year
with a few hundred sessions is 70 calls or more. The `appleHealth` limiter allowed 30 per
10 minutes: the import stopped at the 30th call with a 429. The app kept its markers, so nothing
was lost, but it only sent again on the next HealthKit sample or the next visit to Résumé — the logs
show no call for the following hours. The athlete saw a history that ended in January.

## Decision

1. The server's `appleHealth` limit is 150 calls per 10 minutes, enough for a year of history in
   one window. The background work each batch triggers is bounded since ADR-092.
2. The app resumes a send the limit stopped by itself, two minutes later
   (`AppleHealthSource.resume`), rather than waiting for an outside trigger. Its markers already
   make the resumed send pick up where the last one stopped.

## Options considered

### Option A — Higher limit plus an automatic resume (chosen)

Pros: a year arrives in one go; an unusually large history still completes, two minutes per extra
window. Cons: a misbehaving client can send five times more calls before being stopped.

### Option B — Send the most recent month first, then backfill

Pros: the athlete sees this week's sessions at once even if the import stops. Cons: two markers
(head and backfill) per kind and a more complex resume; worth doing if imports stay slow.

### Option C — Bigger batches

Pros: fewer calls. Cons: the workouts carry their streams; 5 per call is what keeps a request
under the host's size limit.

## Consequences

### Positive

- A new athlete's history up to today arrives during the onboarding.

### Negative

- The limit protects less against a flood of Health calls (150 per 10 minutes per athlete).

### Neutral

- Accounts already stuck resume at their next send with the new build, or at their next visit to
  Résumé with the current one.

## References

- `packages/server/src/lib/rate-limit.ts`
- iOS: `SHARPIT-APP/Features/Health/AppleHealthSource.swift`
