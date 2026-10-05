# ADR-071: A meal logs again in one tap

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (extends ADR-061)

---

## Context

An athlete leaving MyFitnessPal logs most days from what they already ate: yesterday's breakfast,
« mon porridge », the bolognaise made on Sunday. The food log (ADR-061) only logged one food at a
time, so moving to SharpIt meant losing the three shortcuts MyFitnessPal athletes use every day:
copy a meal, saved meals, recipes.

---

## Decision

1. **Copy.** `POST /api/v1/food-log/copy` `{ fromTrainingDayId, toTrainingDayId, fromMeal?, toMeal? }`
   writes the source entries into the target day as new snapshots — a meal (into the same meal, or
   `toMeal`) or a whole day. The clients offer « Copier le repas de la veille » on each meal and
   « Copier la veille » on an empty day — the day before the one shown, not the calendar's
   yesterday. An empty source is said, never a silent no-op.
2. **Saved meals.** `SavedMeal { name, items Json }` keeps the entries of a logged meal as they were
   (`POST /api/v1/food-log/meals { name, trainingDayId, meal }`). `GET` lists them last used first,
   each with its totals and its score (ADR-070, from the products' live scores);
   `POST /meals/[id]/log { trainingDayId, meal }` logs it whole, `DELETE /meals/[id]` removes it —
   the entries it logged stay. A food deleted since logs unlinked, as it was.
3. **Recipes.** A recipe is an own food (`FoodProduct`, `source: CUSTOM`) with a `recipe` JSON: the
   ingredients with their label, the cooked weight and the servings. Its label per 100 g is the sum
   of the ingredients over the dish's weight — cooked when weighed, since cooking drives water out —
   computed by the pure `recipeLabel`, which the clients run live while the athlete builds it. A
   nutrient one ingredient does not give stays unknown rather than read low. The serving label is
   « 1 part · N g ». `POST /api/v1/food-log/recipes` creates it, `PUT /recipes/[id]` replaces its
   ingredients; it is then searched, logged and scored like any own food (ADR-063).
4. **Snapshots.** Every entry these routes write is a snapshot, like any entry (ADR-061): editing a
   recipe or deleting a saved meal never rewrites a day already logged.

---

## Options considered

### Option A — Recipes as their own table, entries linking to them

Lets a day follow a recipe's edits, but entries are snapshots everywhere else, and every reader of a
food (search, score, portion) would need a second kind of food.

### Option B — A recipe is an own food (chosen)

Search, the portion step, the score and the native clients work unchanged; only the builder is new.

### Option C — Saved meals as recipes

One concept fewer, but a saved meal is several lines logged as they were, not one food per 100 g:
the athlete still sees and edits each line of the day.

---

## Consequences

### Positive

- Copy, saved meals and recipes on the web and on iOS: no MyFitnessPal daily habit is lost.
- A recipe carries a score like any food.

### Negative

- A saved meal keeps its foods' values at the time it was saved; a corrected product does not
  update it (its score, read live, does).

---

## References

- `packages/server/src/lib/nutrition/food-log/food-log-templates.ts`
- `packages/app/src/lib/nutrition/food-log/recipe-math.ts`
- [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md), [ADR-070](./ADR-070-a-meal-is-scored-by-the-energy-of-its-foods.md)
