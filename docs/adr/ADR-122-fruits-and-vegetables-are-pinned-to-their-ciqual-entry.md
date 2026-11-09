# ADR-122: Fruits and vegetables are pinned to their Ciqual entry

**Status:** Accepted
**Date:** 2026-11-09
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (extends ADR-064, ADR-065 and ADR-069)

---

## Context

Typing « banane » must open on the banana. Name ranking (ADR-064) got most of the way, but probing
the bundled Ciqual table showed three remaining failures, and Open Food Facts adds a fourth:

- « pomme » opened on three apple varieties, never the plain apple; « poire » on « Poire belle
  Hélène » (a dessert); « pêche » on « Pêche melba »; « carotte » on the cooked carrot.
- Open Food Facts lists a « Banane » at 520 kcal (chips) and « Nectar de banane » among the
  products, titled with the fruit alone.

## Decision

1. **A curated reference** (`produce-reference.ts`): about 50 fruits and vegetables, each with its
   folded names and the Ciqual `alim_code`(s) that mean the food itself, the plain fruit first.
   No energy value is typed: it is read from the Ciqual table by code.
2. **Pinned first.** When the whole query names an entry (plural or accent aside), its Ciqual foods
   open the generic list; the normal ranking fills the rest. « pomme golden » or « jus de pomme »
   are not entries and rank as before.
3. **Derived products last.** For such a query, an Open Food Facts product whose name holds a
   derivation word (jus, nectar, sirop, chips, saveur…) or whose energy is far from the pinned
   food's (below half, or above 1.5×, with a 25 kcal floor) goes below the others, order kept.
   Words carry what energy cannot: a juice's energy is close to the fruit's. Nothing is removed.
4. **Already eaten follows the same order.** « Déjà mangés » ranks by name, then by how often a
   food was logged, so a product named exactly « Banane » (brand « Banane », 43/100) logged twice
   opened above the Ciqual banana logged once. For such a query the pinned Ciqual food comes first
   there too, then what could be the food, then what is made from it (`produceFirst`).
5. **The plain food stays in the base foods.** ADR-069 lists a food once, so an eaten Ciqual banana
   left « Aliments de base » holding only « Banane plantain, cuite ». For a fruit or vegetable the
   pinned food is listed there even when it is also in « Déjà mangés »: it is what the name means.
6. **A table test** checks every code exists in the bundled table, sits in a fresh fruit or
   vegetable sub-group (0201, 0202, 0204) and has an energy consistent with its macros.

## Consequences

- The list is short on purpose; a food joins it when a search for it came back wrong.
- Ciqual 2020 holds no raw broccoli, date or coconut flesh: those stay on the ranking.
- Words and the energy band are heuristics; a plain product named with a derivation word sinks.
- The one exception to « listed once » (ADR-069) is the pinned fruit or vegetable.
