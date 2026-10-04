# ADR-063: The food score explains itself and reads the athlete's diet

**Status:** Accepted
**Date:** 2026-10-04
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (revises the v1 formula of `docs/superpowers/specs/2026-10-02-food-health-score-design.md`)

---

## Context

Score v1 (`food-health-score.ts`, 2026-10-02) put a 0–100 number on every food: Nutri-Score 60,
NOVA 20, additives 20. Reading it against Open Food Facts' live API showed five flaws:

1. **Additives were free for every searched food.** OFF's search index (`search.openfoodfacts.org`)
   returns `additives_n` but never `additives_tags`. The mapper read the missing list as `[]`, so
   each search hit took the full 20 additive points. Caching the hit then overwrote the list a
   barcode read had stored.
2. **Sub-variants counted twice.** OFF tags lecithin as `en:e322` and `en:e322i`.
3. **Five steps only.** The letter alone mapped A→100 … E→10, although OFF sends the points
   (`nutriscore_score`) behind it.
4. **Raw foods scored on sugar alone.** Without a Nutri-Score (loose bananas, most own foods) the
   fallback averaged sugar, salt and saturated-fat levels: no protein, fibre, energy or fruit share.
5. **Nothing explained the number**, and nothing said whether a food fits the diets the athlete
   declares in the journal (`journalPrefs`: low carb, keto, gluten-free, dairy-free, vegetarian,
   vegan) — while protein density is what an athlete most wants to see.

---

## Decision

`FOOD_HEALTH_SCORE_VERSION` moves to **2**; stored products recompute on their next read.

1. **Nutrition (60).** OFF's letter, placed inside its band by OFF's points (except beverages,
   whose scale differs). Without a letter, Sharpit **estimates the 2023 Nutri-Score** from the
   label (`nutri-score-estimate.ts`: energy, sugars, saturated fat, salt, protein, fibre, and the
   fruit/vegetable share when OFF estimates it or the product is a bare fruit or vegetable). The
   three-level average stays the last resort. `nutriScoreEstimated` says which.
2. **Additives (20).** A known list costs 1 / 3 / 8 per additive by risk, sub-variants merged
   (`dedupeAdditives`). A search hit with only a count costs 3 per additive (`additivesKnown:
'count'`). No readable ingredients is `unknown` and scores half, never « additive-free ».
3. **Ceiling.** A high-risk additive caps the score at 49 (never « Correct » or better).
4. **Search hits are summaries.** `health.detail` is `summary` for a search hit, `full` for a
   barcode read. A summary product is re-read by barcode when opened (`needsOffRefresh`), and
   `cacheSearchResults` no longer overwrites a current stored product.
5. **Highlights.** `health.highlights` lists, worded server-side in French: what to watch (high
   sugar/salt/saturated fat, ultra-processed, high-risk additives, ≥ 450 kcal/100 g), strengths
   (protein and fibre per the EU claims of Regulation 1924/2006, low levels, NOVA 1, additive-free),
   and a neutral note for sports nutrition (gels, sports drinks) whose sugar is intended.
6. **Diet facts per food, fit per athlete.** `health.dietFacts` stores vegan / vegetarian status
   (OFF `ingredients_analysis_tags`) and gluten / milk status (allergens, traces, labels). Each
   response adds `health.dietFit` for the athlete's declared diets (`loadDeclaredDiet`): compatible,
   uncertain or incompatible, with a reason; keto and low carb read carbohydrates per 100 g (≤ 5/10 g
   and ≤ 10/20 g).

---

## Options considered

### Option A — Keep v1 and fix the additive default only

Smallest change. Leaves raw foods scored on sugar alone, no explanation and no diet reading — the
two things the athlete asked for.

### Option B — Read the full product for every search hit

Exact additives everywhere, but twenty OFF product calls per search: slow, and against OFF's
product rate limit (100/min).

### Option C — Summary score from the count, completed on open (chosen)

One OFF call per search as before, an honest approximation in lists, the exact list on the food
sheet. Diet fit computed at response time keeps stored products shared across athletes.

---

## Consequences

### Positive

- A searched spread with two additives no longer gains 20 points; Nutella-type products lose the
  E322/E322i double charge.
- Loose bananas grade A (estimated) instead of being penalised for their sugar.
- The food sheet says why: « Trop sucré 40 g/100 g », « Riche en protéines 21 g/100 g »,
  « Végétalien : contient des ingrédients non végétaliens ».

### Negative

- Every stored product recomputes once (an OFF read for OFF products) after deploy.
- Diet fit costs one profile read per food-log response.
- OFF's allergen data is crowd-sourced: diet fit is an indicator, never allergy-grade.

### Neutral

- iOS renders only; the web food log will reuse the same payload.

---

## References

- `packages/app/src/lib/nutrition/food-log/` — `food-health-score.ts`, `nutri-score-estimate.ts`,
  `food-health-highlights.ts`, `food-diet-fit.ts`
- [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md) — the food log and Open Food Facts
- Nutri-Score 2023 algorithm update (Santé publique France)
