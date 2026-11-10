# ADR-126: Strava-only activities never reach an AI model

**Status:** Accepted  
**Date:** 2026-11-10  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

Strava's API agreement restricts the use of data obtained through its API with artificial
intelligence. SHARPIT sent that data to model providers in two ways: activities entered the coach
context, the weekly review, the briefing, the activity narrative and the session analysis whatever
their source, and the session analysis fetched the Strava description — or, failing that, the
athlete's Strava private note — to put it in the prompt.

An athlete's consent to AI processing covers the GDPR side. It does not change what SHARPIT agreed
with Strava, and losing API access would cut a source for every athlete who uses it.

`Activity.source` records where an activity comes from: `strava` alone, or a merge such as `both` or
`strava+apple-health` when a watch or the phone supplied the same session.

---

## Decision

Keep every activity whose only origin is Strava (`source = 'strava'`) out of every path that calls a
model, and stop reading Strava descriptions and private notes for prompts.

- One predicate, `isStravaOnly`, and one query filter, `aiReadableActivityWhere`, carry the rule.
- `getActivitiesForCoach` and `getActivityForCoach` always apply it; `getActivities` applies it when
  called with `forAi` (weekly review, briefing context).
- The activity narrative and the planned-session and brick analyses are not generated for a
  Strava-only activity.
- The athlete's description in a session analysis is the note written in SHARPIT, nothing else.

---

## Rationale

- A merged activity is also known from Garmin or Apple Health, so the model reads nothing Strava alone
  provided; excluding merged activities would hide most sessions of athletes who connect both.
- Filtering where activities are loaded for AI leaves the deterministic engines untouched: load, PMC
  and the plan still count every session.
- For the one athlete with real data, 47 sessions out of about 600 are Strava-only.

---

## Alternatives Considered

### Alternative 1: Keep sending, rely on providers' no-training terms

**Description:** Read the agreement as forbidding model training only, and rely on the model
providers not training on gateway traffic.

**Pros:**

- No loss for Strava-only athletes

**Cons:**

- Rests on an interpretation of a text SHARPIT does not control, and on terms of three providers
- The Strava private note in a prompt is hard to defend under any reading

**Rejected because:** the downside is losing the integration; the cost of excluding is small today.

### Alternative 2: Remove the Strava integration

**Description:** Drop Strava as a source.

**Pros:**

- No question left

**Cons:**

- Athletes without a supported watch lose their sessions and their load history

**Rejected because:** the deterministic use of Strava data is not in question.

---

## Consequences

### Positive

- No Strava-only activity, description or private note is sent to a model
- One place states the rule; tests cover the query filter and the session analysis

### Negative

- A session known only through Strava gets no narrative and no coach analysis, and the coach does not
  see it in its context
- Aggregates computed without AI (load, fatigue, form) still count Strava-only sessions, and those
  aggregates are part of the coach context: Strava data still influences prompts indirectly
- Merged fields are not traced to their source: on a `both` activity, a value that only Strava
  supplied can still be read by a model

### Scientific debt created

- None

---

## Review Criteria

- If Strava's agreement is confirmed in writing to allow per-athlete inference, lift the filter.
- If it is confirmed to forbid indirect use too, the aggregates must be computed without Strava-only
  sessions before they enter a prompt.
