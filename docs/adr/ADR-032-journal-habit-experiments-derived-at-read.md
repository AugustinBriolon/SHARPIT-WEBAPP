# ADR-032: Journal habit experiments — intent stored, verdict derived at read time

**Status:** Proposed  
**Date:** 2026-09-10  
**Author:** Augustin Briolon (with Claude Code)  
**Supersedes:** N/A  
**Related:** [ADR-030](./ADR-030-coach-discuss-context-as-message-metadata.md), [ADR-098](./ADR-098-journal-associations-adjust-for-load-and-chance.md) (associations now carry a test statistic and a load adjustment)

---

## Context

`/journal/analyses` shows habit × physiology associations (sleep, recovery, Body Battery) computed from the athlete's own days by `compareFactorOutcome` — medians with vs without the habit, `MIN_ABS_DELTA` thresholds, `scoreObservationConfidence`. The page answers « what do my data say about me? » but not « did what I changed work? ».

The redesign adds 7-day tests: one factor, one intent (drop an unfavourable habit or keep a favourable one daily), one window, an automatic review. This is the first journal feature that needs new persistence.

Constraints:

- Core is frozen (`CORE_ARCHITECTURE.md`): no new engine.
- A test must use the association method exactly — no second statistical model, no ad-hoc threshold.
- GET handlers stay read-only (commit `e50b5cd4`), so a review cannot be « finalised » by writing on read.
- The journal can be back-filled after the fact.

---

## Decision

Store only what the athlete decided; derive everything else at read time.

1. **Model** `JournalHabitExperiment` (`factorId`, `intent: REMOVE | ADD`, `startDayId`, `cancelledAt`, athlete-scoped, cascade on profile delete). Migration `20260910_journal_habit_experiments`.
2. **Pure evaluation** in `src/lib/health/journal-habit-experiment.ts`:
   - Window = 7 training days from `startDayId`. A held day records the factor as `no` (REMOVE) or `yes` (ADD).
   - Review day = window end + 1 + the factor's longest outcome lag (`outcomeLagDays`) — the morning the last day is measured. The review is automatic: a date comparison, no button, no job.
   - Verdict compares the medians of held days against the 21 days before the window, per outcome, with the same lag, `MIN_ABS_DELTA` and `scoreObservationConfidence`. Three states only: `worked` (a gap clears the threshold upward and none downward), `no_effect` (everything else), `abandoned` (stopped, or fewer than `MIN_N_PER_GROUP_HIGH` = 5 held days).
3. **One running test at a time**, enforced by `POST /api/journal/habit-experiments` (409). `PATCH /api/journal/habit-experiments/[id]` stops a running test only. Every query is scoped by the server-resolved `athleteId`; factor ids are validated against the journal registries.
4. The page loads tests server-side under `<Suspense>`; the client hook (`useJournalHabitExperiments`) replaces its cache with the server's reading after start / stop. Tests are free; the coach reading stays Pro (ADR-030).

---

## Rationale

- **One method.** Reusing `median`, `outcomeLagDays`, `MIN_ABS_DELTA` and `scoreObservationConfidence` makes a test verdict and an association speak the same language — a gap under the association threshold is « sans effet », never « peu concluant ».
- **Derived, not stored.** With only intent persisted, there is nothing to migrate when thresholds evolve, no stale verdict when the athlete back-fills the journal, and GET stays read-only.
- **One lever at a time.** Overlapping tests would share days and confound each other; the page already tells athletes to vary one lever at a time.
- **Abandonment bar reused.** Five held days is the existing minimum group size for a net association; below it the window cannot produce a net reading anyway.

---

## Alternatives Considered

### Alternative 1: Persist the verdict at review

**Description:** A job (or the first read after the review day) writes `verdict` and deltas on the row.

**Pros:**

- Stable history even if the journal is later edited.
- Cheaper reads.

**Cons:**

- Needs a scheduler, or a GET that writes (contradicts `e50b5cd4`).
- A frozen verdict drifts from the data when the athlete back-fills missed days.

**Rejected because:** read-time derivation is cheap at this scale (≤ 6 tests, ≤ ~40 days of evidence) and keeps a single source of truth.

### Alternative 2: Allow several concurrent tests

**Pros:**

- Faster exploration.

**Cons:**

- Shared days make each verdict uninterpretable; baseline windows overlap.

**Rejected because:** it breaks the method's assumption that the window differs from the baseline by one lever.

### Alternative 3: Dedicated test statistic (e.g. t-test, bootstrap interval)

**Pros:**

- Classic significance framing.

**Cons:**

- A second engine with its own thresholds; n = 7 makes p-values misleading for a single athlete.

**Rejected because:** Core is frozen and the product speaks associations, not proof.

---

## Consequences

### Positive

- The page now answers « did it work? » with the same numbers as the associations.
- One table, one enum, no job; verdicts recompute from current data on every read.
- Covered by `journal-habit-experiment.test.ts` (window, review day, three verdicts), `journal-habit-experiment-view.test.ts`, and `api/journal/habit-experiments/route.test.ts` (start today, invalid factor 400, one-at-a-time 409, stop scoped to the athlete).

### Negative

- A verdict can change if the athlete back-fills the journal after the review day (intended, but visible).
- Each page load reads up to ~40 days of journal and DailyHealth per test history — acceptable now; revisit if history grows.
- « Today » uses `trainingDayIdForNow()` with the app-wide default timezone: the profile has no timezone of its own yet.
- Two concurrent POSTs could, in theory, both pass the one-at-a-time check (no unique constraint).

### Scientific debt created

- Before/after on one athlete does not control load, travel or illness — same limit as the associations, stated on the page.

---

## Review Criteria

- If athletes back-fill after reviews often enough that changing verdicts confuse them: snapshot the verdict at first display.
- If test history per athlete exceeds ~20 rows or page p95 regresses: paginate and bound the evidence window.
- When the profile gains a timezone: pass it to `trainingDayIdForNow`.
