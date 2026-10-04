# ADR-065: Generic foods come from the Ciqual table

**Status:** Accepted
**Date:** 2026-10-04
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A

---

## Context

Open Food Facts (ADR-061) is a base of packaged products. A search for « banane » finds banana
nectars and the odd bunch a shopper scanned, often without nutrients; raw foods — a banana, a
chicken breast, rice — have no reliable entry. ADR-064 ranks names better but cannot add what OFF
does not hold.

ANSES publishes the **Ciqual** table: about 3,200 generic foods eaten in France with their
composition per 100 g, under the Etalab Open Licence (reuse allowed with attribution). The 2020
release is the latest published in XML.

---

## Decision

1. **Bundle the table with the server.** `yarn api data:ciqual <dir>` turns ANSES' XML into
   `packages/server/src/lib/nutrition/food-log/ciqual-foods.json` (≈ 2,300 foods with energy and
   the three macros known, 426 KB, kept minified and out of Prettier). Energy is the EU 1169/2011
   kcal, protein the Jones-factor value, « traces » reads 0, « < x » reads x/2, « - » reads unknown.
2. **Search it in memory.** `searchCiqualFoods` keeps the foods whose name holds every typed word
   (plurals folded), ranks them with ADR-064's rule — a name opening on the very word typed now
   beats one that only folds to it (« pâtes » before « pâté ») — and returns five. The search
   response gains `generic`, between the athlete's own foods and OFF's products. It answers even
   when OFF is down.
3. **Cache what is shown like OFF.** `FoodProduct` gains `source = CIQUAL` and a unique
   `ciqualCode`; `cacheGenericFoods` upserts the five shown, skipping rows already current. Entries
   can be logged from them, and an outdated score is recomputed from the bundled table.
4. **Score without inventing.** Ciqual says nothing about processing or additives: both stay
   unknown (half points, ADR-063) — except for a food Ciqual itself names raw (« cru », « crue »)
   in a single-ingredient group (vegetables, tubers, legumes, fruits, nuts, raw meat, fish,
   seafood, eggs), which reads NOVA 1 and additive-free. Fruits, vegetables and legumes count as
   100 % in the estimated Nutri-Score. Diet facts come from the group (plant, flesh, egg, dairy,
   cheese as maybe-vegetarian).
5. **Attribute it.** « Table Ciqual 2020, Anses (Licence Ouverte) » wherever its foods are listed.

---

## Options considered

### Option A — Seed the table into the database

Searchable with SQL, but a manual seed per environment (prod included) and 3,000 rows to keep in
step with each release.

### Option B — Call a Ciqual API at search time

ANSES offers no stable public search API; a third-party mirror would be a new dependency and a
new failure path.

### Option C — Bundled JSON, in-memory search, cache on show (chosen)

No external call, no seed step, updated by regenerating one file; only the foods actually shown
reach the database, like OFF.

---

## Consequences

### Positive

- « banane » lists « Banane, pulpe, crue » (score 91, excellent) above any product.
- Raw basics (chicken, eggs, rice, pasta) are one search away with measured nutrients.

### Negative

- 426 KB more in the API bundle, parsed once per cold start.
- The table is from 2020; a new ANSES release needs the script re-run.
- About 900 Ciqual foods lack a macro and are left out.

### Neutral

- Older iOS builds ignore `generic` and keep working.

---

## References

- https://ciqual.anses.fr — Table de composition nutritionnelle des aliments Ciqual (Anses)
- `packages/app/src/lib/nutrition/food-log/ciqual.ts`, `packages/server/src/lib/nutrition/food-log/ciqual-search.ts`
- [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md), [ADR-063](./ADR-063-the-food-score-explains-itself-and-reads-the-athletes-diet.md), [ADR-064](./ADR-064-food-search-ranks-by-how-the-name-reads.md)
