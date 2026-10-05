# ADR-066: Own foods are scored from their label on every read

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (completes ADR-063 for the athlete's own foods)

---

## Context

ADR-063 scores an own food (`FoodProduct.source = CUSTOM`) from sugars, saturated fat and salt.
Those three fields are optional, and the web form only gained them on 2026-10-04: most own foods
carry energy and the three macros only, and showed no score at all. The score was also frozen in
`FoodProduct.health` when the food was saved, so foods created before a field or a formula existed
kept « no score » in search, recent foods and « Mes aliments ».

---

## Decision

1. **Estimate from what any label has.** With energy, protein, carbohydrates and fat known, the
   2023 Nutri-Score is estimated even when sugars, saturated fat or salt are missing
   (`estimateNutriScorePointsFromLabel`): a missing sugar value reads half the points of the
   carbohydrates (sugars cannot exceed them), a missing saturated fat half the points of the fat,
   and a missing salt — which nothing on the label bounds — reads none. A neutral highlight
   « Étiquette incomplète » names the missing lines, so the athlete knows what sharpens the score.
2. **Score own foods on every read.** `servedHealth` computes an own food's score from its stored
   label each time it is served, instead of reading `FoodProduct.health`. Every own food, old or
   new, reads the current formula with no migration and no score-version bump (which would have
   re-read every Open Food Facts product). The stored `health` stays written on save for readers
   of the raw row.

---

## Options considered

### Option A — Bump `FOOD_HEALTH_SCORE_VERSION` and recompute stored scores

Consistent with OFF products, but forces an OFF re-read of every cached product and still needs a
refresh path in each list that serves own foods.

### Option B — Treat every missing value as zero

Scores everything, but flatters sugary or fatty foods typed without their detail.

### Option C — Bounded half points, computed on read (chosen)

Neither flatters nor condemns an incomplete label, costs one pure computation per own food served,
and fixes past foods by construction.

---

## Consequences

### Positive

- Every own food with its macros shows a score, on iOS and the web, including foods created before.
- A future formula change reaches own foods with no data step.

### Negative

- An incomplete label scores less precisely; salt-heavy foods typed without salt score too well.

### Neutral

- Coverage stays `partial` for own foods; the score's « Comment est calculé » text is unchanged.

---

## References

- [ADR-063](./ADR-063-the-food-score-explains-itself-and-reads-the-athletes-diet.md)
- `packages/app/src/lib/nutrition/food-log/nutri-score-estimate.ts`, `food-health-score.ts`
- `packages/server/src/lib/nutrition/food-log/food-log-service.ts` (`servedHealth`)
