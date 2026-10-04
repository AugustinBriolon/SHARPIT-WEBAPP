# ADR-064: Food search ranks by how the name reads

**Status:** Accepted
**Date:** 2026-10-04
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A

---

## Context

The food search (`GET /api/v1/food-log/foods?q=`) returned Open Food Facts' order, which follows
popularity. « banane » opened on « Nectar de banane »; the first plain banana came 13th. The
athlete's own foods came by last edit, whatever their name.

---

## Decision

The server reorders both lists with `rankFoodsByName` (`food-search-ranking.ts`, pure):

1. Names and query are folded (case, accents, punctuation); a trailing `s`/`x` is ignored, so
   « bananes » matches « banane ».
2. Tiers: exact name › name starting with the query (the last word may be a prefix, for typing) ›
   every word present in order › every word present › substring › matched elsewhere by OFF (brand,
   category).
3. Ties: fewer words first, then the source's own order.

OFF is asked for twice the results shown (40), so a plain product ranked low by popularity can rise
into the 20 returned. Own foods: 30 candidates, 10 returned.

---

## Options considered

### Option A — OFF query options

Search-a-licious offers boosts, but no « starts with » ranking we control, and it would tie us to
an engine OFF can change.

### Option B — Reorder on the device

Works for the 20 hits, but each client (iOS, web) would carry its own copy of the rule.

### Option C — Reorder on the server (chosen)

One rule for every client, testable in isolation, no extra OFF call.

---

## Consequences

### Positive

- « banane » now lists « Banane », « Bananes », « Bananes bio » before any nectar.
- The same rule orders the athlete's own foods.

### Negative

- A larger OFF page (40 instead of 20) adds a few KB per search.
- Generic foods stay limited to what OFF holds; the CIQUAL table remains the real fix for raw
  foods (not in scope).

### Neutral

- Results matched only by brand or category stay listed, last.

---

## References

- `packages/app/src/lib/nutrition/food-log/food-search-ranking.ts`
- `packages/server/src/lib/nutrition/food-log/open-food-facts-client.ts`
- [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md)
