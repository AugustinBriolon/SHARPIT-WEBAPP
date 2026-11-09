# ADR-123: A keep-fit goal and a wanted intensity

**Status:** Accepted  
**Date:** 2026-11-09  
**Author:** SHARPIT  
**Supersedes:** N/A

---

## Context

Field feedback on the iOS onboarding: athletes without a race and without a figure to reach had no
goal to pick ("garder la forme", "être régulier"), so they skipped the step and the coach planned
towards nothing. The week step asked only which days were free; the athlete could not say how hard
they wanted the weeks to be, and N days always meant N sessions. Athletes without a watch feel this
most: their onboarding answers are the only signal the coach gets before any data arrives.

---

## Decision

1. Add `HABIT` to `GoalKind`: a goal with no date and no target value. The coach context lists it
   as « Objectif de régularité … tenir les semaines dans la durée, sans pic ni affûtage ».
2. Add an optional `intensity` (`easy | steady | hard | max`) to `AthleteProfile.trainingAvailability`
   (still `version: 1`). The coach context writes « Intensité voulue : … » before the count.
   `targetSessionsPerWeek` stays its own answer: the iOS onboarding asks the intensity, seeds a count
   from it, then has the athlete pick exactly that many days.

---

## Rationale

- Every place that branches on goal kind tests `RACE` (or `METRIC` for progress); a `HABIT` goal
  falls into the non-race path everywhere — no badge, no progress — with no special case.
- An optional field on a versioned JSON blob is backward compatible: older rows and the web picker
  (days only) keep parsing; an unknown word reads as undeclared, like an out-of-range count.

---

## Alternatives Considered

### Alternative 1: a METRIC goal "séances par semaine"

**Description:** Encode keep-fit as a palier whose target is the weekly session count.

**Pros:**

- No migration.

**Cons:**

- Nothing measures it, so the goal shows an empty progress bar forever; the coach reads a figure
  the athlete never chose.

### Alternative 2: time available per day

**Description:** Store minutes per weekday instead of an intensity.

**Cons:**

- The athlete asked to state effort first and fit days to it, not to budget every day.

---

## Consequences

- Migration `20261109090000_goal_kind_habit` adds the enum value (Postgres `ALTER TYPE … ADD VALUE`).
- The web goal form does not offer `HABIT` yet; it shows an existing one like a dateless palier.
- The iOS onboarding (SHARPIT-APP) is the first writer of both fields.
