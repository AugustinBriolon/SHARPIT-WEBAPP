# ADR-076: A quick add is scored from its own macros

**Status:** Accepted
**Date:** 2026-10-10
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (amends ADR-070: a quick add is no longer unscored)

---

## Context

Every food the athlete logs should carry a « note », however it was added. Search results link to
an Open Food Facts, Ciqual or own product and are scored (ADR-063, ADR-066, ADR-067); the coach's
estimates became own foods in ADR-075. The athlete's own quick add — a name and its kcal and macros
for the portion, no product — still had no score, and pulled the meal's coverage down (ADR-070).

ADR-075 rejected scoring the coach's quick adds directly, to avoid a second scoring path and a
stored entry-level score. A quick add typed by the athlete is a one-off: turning each into an own
food would fill « Mes aliments » with foods nobody looks for again.

---

## Decision

A quick add is scored on read from its own portion, read per 100 g (`value × 100 / grams`), through
the same label scorer as an own food (`labelHealth`, ADR-066), with the athlete's diets read against
it. Nothing is stored: the score follows the formula like an own food's does. A portion of 0 g
stays unscored.

`portionHealth` is the one entry point: a logged entry or a saved meal's item reads its product's
score when it has one, its own macros' otherwise. The day list, every write's echo and saved meals
go through it.

---

## Options considered

### Option A — Keep the quick add unscored

The athlete's request goes unanswered, and coverage stays low on days logged by hand.

### Option B — Turn every quick add into an own food (as ADR-075)

One scoring path, but « Mes aliments » gains a food per quick add, and editing a quick add's portion
would have to follow a product it never chose.

### Option C — Score the portion on read (chosen)

The same scorer, no storage, no new rows. The score is a label score: energy and the three macros
only, flagged « Étiquette incomplète ».

---

## Consequences

### Positive

- Every logged food has a score, whichever way it was added.
- Meals and days logged by quick add get full coverage.

### Negative

- A quick add's score is only as good as the numbers typed; no additives, salt or saturated fat.

---

## References

- [ADR-066](./ADR-066-own-foods-are-scored-from-their-label-on-every-read.md)
- [ADR-070](./ADR-070-a-meal-is-scored-by-the-energy-of-its-foods.md)
- [ADR-075](./ADR-075-coach-estimated-foods-are-logged-as-own-foods.md)
- `packages/server/src/lib/nutrition/food-log/food-log-service.ts` (`quickHealth`, `portionHealth`)
