# ADR-113: A skipped meal is a choice, not a gap in the diary

**Status:** Accepted
**Date:** 2026-10-26
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md)

---

## Context

The coach's nutrition reading kept telling the athlete their day was incomplete. Two causes:

- `DailyNutrition.complete` was only ever `true` for a MyFitnessPal import. A day logged in SHARPIT
  stayed `false` however fully it was logged, and the prompt says to stay prudent on an incomplete day;
- an empty meal could mean « forgot to log » or « did not eat ». The reading could not tell, so a
  skipped lunch read as a half-logged day.

---

## Decision

1. **`FoodLogSkippedMeal`** (athlete, training day, meal; unique on the three) records a meal skipped
   on purpose. `PUT /api/food-log/skipped` and `/api/v1/food-log/skipped` take
   `{ trainingDayId, meal, skipped }` and answer the day's `skippedMeals`; `GET /food-log` carries them.
2. **Food clears the skip.** `recomputeFoodLogDay`, which every write already calls, deletes the skip
   of any meal holding food, so no writer (add, batch, copy, saved meal, coach) has to know about it.
3. **Completeness is derived.** A SHARPIT day is `complete` once breakfast, lunch and dinner are each
   eaten or skipped (`isFoodLogDayComplete`; snacks are optional). The same value feeds the NUTRITION
   observation's `diaryComplete`.
4. **The reading respects it.** The facts carry `logging.skippedMeals` (meal labels) and the prompt
   says a skipped meal is not a gap, is not reproached, and is only discussed when it weighs on the
   day's load or the next day's session.
5. **The iPhone marks it** from the meal row's long-press menu (« J'ai sauté ce repas »); the empty
   row then reads « Repas sauté ». The web has no food log.

---

## Consequences

- Days logged before this change stay `complete: false` until their next write rebuilds them.
- A day where the athlete logs only dinner and skips nothing is still incomplete, as it should be.
