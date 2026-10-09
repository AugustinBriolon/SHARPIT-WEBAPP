# ADR-075: Foods the coach estimates are logged as own foods

**Status:** Accepted
**Date:** 2026-10-09
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (completes ADR-066 for the coach's `logFoods` tool)

---

## Context

`logFoods` resolves each food the coach proposes against the athlete's history, own foods, Ciqual
and Open Food Facts. A food found nowhere (« 8 maki california ») was written as a quick add from
the coach's per-100 g estimate. A quick add has no linked product, so it carries no score
(ADR-063, ADR-070): every entry the coach logged from an estimate showed no « note » on the meal
page, and the meal's coverage dropped.

---

## Decision

A food the coach could not resolve is created as an own food (`FoodProduct.source = CUSTOM`)
from its per-100 g macros, and the entry links to it. ADR-066 already scores an own food from
energy and the three macros on every read, with the « Étiquette incomplète » highlight naming
what is estimated. The next time the athlete's history or own foods are searched, the same name
resolves to it instead of being estimated again.

All grams are validated before any own food is created, so a refused call leaves nothing behind.

---

## Options considered

### Option A — Keep the quick add

No score, by ADR-070; the athlete's main complaint stays.

### Option B — Score the quick add from its macros

A second scoring path and an entry-level score that ADR-063 deliberately does not store.

### Option C — Own food from the estimate (chosen)

Reuses the one scoring path (ADR-066), and a repeated meal is matched rather than re-estimated.

---

## Consequences

### Positive

- Entries the coach logs carry a score like any other own food.
- A food described once is found by name afterwards.

### Negative

- « Mes aliments » gains a food per estimated item, carrying the coach's estimate as its label.
- The score of an estimated food is only as good as the estimate (flagged « Étiquette incomplète »).

---

## References

- [ADR-063](./ADR-063-the-food-score-explains-itself-and-reads-the-athletes-diet.md)
- [ADR-066](./ADR-066-own-foods-are-scored-from-their-label-on-every-read.md)
- [ADR-070](./ADR-070-a-meal-is-scored-by-the-energy-of-its-foods.md)
- `packages/server/src/lib/coach/chat/tools/coach-tools-food-log-executor.ts`
