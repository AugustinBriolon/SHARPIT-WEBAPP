# ADR-087: The coach reads strength sessions on request

**Status:** Accepted
**Date:** 2026-10-17
**Author:** Augustin Briolon
**Supersedes:** N/A

---

## Context

The coach narrative (« Analyse du coach ») was built for endurance: `buildActivityNarrativeFacts`
returned `null` for anything but run, bike, swim and triathlon. The iOS activity page offers
« Générer l'analyse » on every session, so a tap on a strength session reached
`POST /api/v1/activities/<id>/narrative`, got no facts, and answered **500 « Synthèse impossible »**.
In prod this hit the owner's three latest sessions (manual strength), with no `AnalysisRun` row and
nothing in Sentry. ADR-086 makes strength-only athletes a supported profile, so for them the
button never worked.

Narratives also run without a tap: after each import (`runActivityNarrativeForIds`, the activity
create handler) and in the backfill. Every run costs model tokens (ADR-077 quota).

---

## Decision

Split the sports the narrative reads by path, in `activity-narrative-config.ts`:

- **Automatic** (import, create, backfill, context refresh): run, bike, swim, triathlon.
- **On request** (the athlete taps « Générer »): the same plus **strength**.

For strength, the facts carry the logged sets (exercise, sets × reps or seconds, weight, RPE, rest,
notes) in a « Renforcement » section, with recovery, load and physical conditions as before; the
endurance threshold and technique sections are left out. The narrative endpoint answers **422**
with a French reason for any other type, never 500. The iOS app hides the card for those types.

---

## Rationale

- Strength-only athletes (ADR-086) need the one analysis the app offers on their sessions.
- Strength sessions are often logged in bulk from Apple Health or Strava; reading them on import
  would spend tokens on sessions nobody opens. On request, the athlete chose to spend them.
- A 422 with a reason is honest about a missing feature; a 500 reads as an outage and is retried.

---

## Alternatives Considered

### Alternative 1: Hide the button on iOS for non-endurance types

**Description:** Client-only change, server untouched.

**Pros:**

- Smallest change.

**Cons:**

- Strength-only athletes get no analysis at all.

**Rejected because:** it removes the bug by removing the feature for a supported profile.

### Alternative 2: Read strength on every path

**Description:** Add strength to the automatic list too.

**Pros:**

- Analyses ready when the athlete opens the session.

**Cons:**

- Token cost on every imported strength session, read or not.

**Rejected because:** cost without demand; revisit with usage data.

---

## Consequences

### Positive

- Strength sessions get a coach reading grounded in the logged sets.
- Unsupported types fail with a clear reason instead of a 500.

### Negative

- A strength session imported without sets is read from duration, RPE, feeling and context only.
- Hike and other types still have no analysis.

### Scientific debt created

- None.

---

## Review Criteria

- If most strength analyses are requested within a day of the session, move strength to the
  automatic path.
- If hike or mobility sessions become a common request, add them to the on-request list.
