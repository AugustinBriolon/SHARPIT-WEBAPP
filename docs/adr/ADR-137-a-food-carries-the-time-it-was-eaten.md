# ADR-137: A food carries the time it was eaten

**Status:** Accepted
**Date:** 2026-11-19
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md), [ADR-113](./ADR-113-a-skipped-meal-is-a-choice-not-a-gap.md), [ADR-134](./ADR-134-a-meal-logged-whole-is-a-group-naming-its-foods.md)

---

## Context

A food was logged into a meal and nothing else: when it was eaten was never asked. « Fil de la
journée » (`GET /api/v1/today` `timeline`) placed every meal at a fixed hour (breakfast 08:00, lunch
12:30, snacks 16:00, dinner 19:30), so a 10:00 banana and a 17:00 bar were one « Collations » at
16:00, and a dinner eaten at 21:30 sat at 19:30. The athlete does not always log on the spot — many
log the day in the evening — so the time a food reaches the server is not the time it was eaten.
The coach's day reading could not say anything about what was eaten around a session.

---

## Decision

1. **`FoodLogEntry.eatenMinute`** (`Int?`): minutes after the training day's local midnight,
   0–1439. A minute of the day, not an instant: the training day is already local, and the
   timeline speaks in `minuteOfDay`. Null means the athlete gave no time — never a guess stored as
   a fact.
2. **The API takes it** on `POST /food-log` (and `entries/batch`) and on `PATCH /food-log/[id]`,
   where an explicit `null` clears it and an absent key leaves it. Every entry answer carries it.
   Restoring a deleted entry keeps it. Copies and saved meals log without a time: yesterday's hour
   is not today's.
3. **The timeline places a meal at its foods' time** (`mealMoments`): the first timed food of a
   meal, foods without a time joining that moment; foods of one meal eaten more than 45 minutes
   apart are two moments (a morning and an afternoon snack). A meal with no time keeps its usual
   hour.
4. **The day reading sees the times.** The stored day (`DailyNutrition.meals`) writes `time:
"HH:MM"` on a timed food; the facts gain `timing` — first and last food, each meal's span, and
   the start of the day's synced sessions in the athlete's zone (a session typed by hand has no
   clock) — only when at least one food has a time, so the facts and hash of every day logged
   before stay the same and no stored reading turns stale. The prompt reads `timing` for what was
   eaten before and after a session and long gaps on a loaded day, and is told not to speak of
   hours without it.

---

## Consequences

- The iPhone asks the time on the portion, quick-add, described-meal and edit screens, opening on
  « now » when the meal is the one of the hour and on the meal's usual hour otherwise; only a time
  the athlete set, or « now » on the spot, is sent.
- The web's food log does not ask the time yet: its entries log without one and read at the
  meal's hour, as before.
- MyFitnessPal imports carry no time.
