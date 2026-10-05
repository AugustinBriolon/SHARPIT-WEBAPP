# ADR-069: Food search reads the athlete's history and trusts verified data

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (extends ADR-064 and ADR-065)

---

## Context

An athlete leaving MyFitnessPal expects its search: the foods they already eat on top, entries
marked as verified, a brand typed with the name, the same product listed once. SHARPIT's search
(ADR-064) read the name alone and kept Open Food Facts' order for everything else:

- foods eaten every week were only in « Récents », never in the results;
- nothing told a measured or manufacturer-given value from a crowd-typed one;
- « skyr danone » found the Danone skyr last, matched only « elsewhere »;
- OFF lists the same product under several barcodes;
- Ciqual's wording is not the athlete's: « blanc de poulet » found no chicken breast (Ciqual says
  « Poulet, filet »), « spaghetti » found no pasta, « œuf » typed with the iPhone's ligature found
  nothing, and « poulet » opened on « Poulet basquaise ».

---

## Decision

1. **Already eaten, first.** The search response gains `eaten`: the athlete's foods logged in the
   last 90 days that match the query (name or brand), ranked by the name rule then by how often they
   were logged, five at most, each with `timesEaten` and `lastGrams`. A food listed there is not
   repeated in `own`, `generic` or `products`.
2. **« Vérifié ».** Every served product carries `verified` and `verifiedBy`: `ciqual` (values
   measured by ANSES), `producer` (an OFF product whose data the manufacturer gave — `owner`
   `org-…` or a `producer…` data source), `checked` (an OFF moderator checked it: `en:checked`).
   OFF's verification is stored on `FoodProduct.verification`; a current cached row learns it from
   the next search hit. Own foods are never « vérifiés ».
3. **Ranking, after the name.** `rankFoodsByName` keeps ADR-064's tiers and takes two optional
   signals: a _preference_ weighed before the name's length (OFF: verified first; Ciqual: a food
   before a composed dish or infant food), and a _quality_ weighed after it, before the source's
   order (OFF: a full label, then sold in France).
4. **The brand counts**, up to the « every word present » tier: a name is never outranked by a
   brand match.
5. **Duplicates merged.** Same folded name, same brand and energy within 2 % (or 2 kcal): the best
   ranked is kept.
6. **The athlete's words.** `FOOD_SYNONYMS` maps a short list of phrases to the tables' wording;
   a food is ranked by the best variant. `œ`/`æ` are spelled out. In Ciqual only, when the exact
   words find fewer than five foods, a word of five letters or more may be one letter off; those
   come after the exact matches.
7. **Own foods** are matched in memory (name or brand, any word order, plurals, synonyms) instead
   of a single `contains` on the name.

---

## Options considered

### Option A — History as a ranking boost inside each list

Keeps three lists, but a food eaten every day would still sit under « Mes aliments » when it comes
from OFF. Rejected: MFP's habit is one « history » block on top.

### Option B — Fuzzy matching on every source

Typos everywhere, but OFF's search is remote and own foods are few; tolerance on OFF would need a
second OFF call. Kept to Ciqual, searched in memory.

### Option C — Eaten section, verification badge, signals after the name (chosen)

The name still decides; history, verification and quality order what reads alike.

---

## Consequences

### Positive

- « skyr » opens on the skyr the athlete eats, with the last portion preset.
- « blanc de poulet » lists « Poulet, filet, sans peau, cru »; « œuf dur » lists « Oeuf, dur »;
  « bannane » still finds the banana.
- A verified food is marked wherever foods are listed (web: icon with its source; iOS: badge).

### Negative

- One `groupBy` and two small reads more per search.
- OFF's producer and moderation fields were read from OFF's documentation, not from a live call in
  this change; a product without them is simply not « vérifié ».
- The synonym list is hand-kept.

### Neutral

- Older iOS builds ignore `eaten`, `verified` and `verifiedBy`; they lose nothing but see the eaten
  foods once fewer in the other lists.

---

## References

- `packages/app/src/lib/nutrition/food-log/food-search-ranking.ts`, `food-search-synonyms.ts`,
  `open-food-facts.ts` (`offVerificationOf`)
- `packages/server/src/lib/nutrition/food-log/food-log-service.ts` (`searchEatenFoods`,
  `servedProduct`), `ciqual-search.ts`, `open-food-facts-client.ts`
- [ADR-064](./ADR-064-food-search-ranks-by-how-the-name-reads.md),
  [ADR-065](./ADR-065-generic-foods-come-from-the-ciqual-table.md)
