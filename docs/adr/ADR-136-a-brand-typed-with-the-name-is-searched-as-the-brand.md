# ADR-136: A brand typed with the name is searched as the brand

**Status:** Accepted
**Date:** 2026-11-17
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md), [ADR-064](./ADR-064-food-search-ranks-by-how-the-name-reads.md), [ADR-069](./ADR-069-food-search-reads-the-athletes-history-and-trusts-verified-data.md)

---

## Context

An athlete looked for « Club Original Spicy Reghalal », a sandwich Yuka and MyFitnessPal list, and
found nothing. Two causes, read on Open Food Facts' search (search-a-licious) on 2026-11-17:

1. **The product is not in Open Food Facts.** Reghalal holds 56 products there; the clubs are one,
   « Club original dinde ciboulette ». Yuka and MyFitnessPal run their own databases. No query can
   find what OFF does not hold: the scanner's « Produit inconnu » already offers to create the food
   from its label.
2. **OFF's free-text search buries the brand.** It weighs each word on its own and boosts
   categories: « club » reads as the sandwich category, so « club reghalal » or « club sodebo » open
   on British meal-deal sandwiches, and the brand's own products sit past the fiftieth hit — beyond
   the 40 candidates SHARPIT asks for. The same query written `brands:sodebo AND club` returns
   Sodebo's clubs only.

---

## Decision

1. **The words typed first and last are also asked as the brand** (`brandProbeQueries`): for
   « club original spicy reghalal », `brands:reghalal AND club AND original AND spicy` and
   `brands:club AND original AND spicy AND reghalal`, beside the plain query, in parallel. Only
   queries of two words or more (of three letters or more, figures and « avec », « sans »… left
   out) are probed: a single word is already searched well.
2. **The probes' hits come before the plain query's**, one per barcode, then the name ranking of
   ADR-064 / ADR-069 orders the whole. A probe that fails is logged and ignored; only the plain
   query failing makes OFF « indisponible ».
3. **Among names that miss a typed word, the one holding more of them ranks first**
   (`rankFoodsByName`, after the match tier): « Club original dinde ciboulette » by Reghalal holds 3
   of the 4 words and comes before « Spicy beef » by Sam's Club (2).

---

## Rationale

- A brand word guessed wrong costs one OFF call that finds little, and the ranking sorts it out.
- First and last cover how a product is typed (« Danone yaourt », « skyr Isey »); probing every word
  would multiply the calls for each keystroke the search debounces.

---

## Alternatives Considered

### OFF's brand taxonomy to recognise the brand

**Rejected because:** search-a-licious' `/autocomplete` on the `brand` taxonomy answers nothing for
« reghalal » or « sodebo ».

### Another database (Yuka, MyFitnessPal)

**Rejected because:** neither offers an open API; MyFitnessPal's access is unofficial
(iPhone `docs/adr/0010`). OFF stays the source, and the athlete can create a food OFF lacks.

---

## Consequences

### Positive

- « club sodebo » lists five Sodebo clubs instead of Tesco sandwiches; « club reghalal » opens on
  Reghalal's club.

### Negative

- A multi-word search costs OFF up to three calls instead of one, for the athlete and for the meal
  describe's resolution.

---

## Review Criteria

- If OFF rate-limits SHARPIT's searches, probe only the last word.
- If search-a-licious learns to weigh brands itself, drop the probes.
