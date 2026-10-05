# ADR-067: Generic foods read their family and their preparation

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (refines ADR-065's scoring of Ciqual foods)

---

## Context

The athlete compared two Ciqual eggs: « Oeuf, au plat, frit, salé » scored 70 and « Oeuf, au plat,
sans matière grasse » 53 — the plainer egg scored worse. Two causes:

1. Ciqual did not measure the second egg's sugars. Without the three unfavourable nutrients the
   Nutri-Score could not be estimated and the score fell back on two « moderate » levels (55/100).
2. ADR-065 read NOVA 1 and « no additive » only for foods named raw. A boiled, poached or plain
   fried egg — the same single ingredient, cooked with heat alone — read both as unknown (half
   points), 20 points below the raw egg.

The ADR-066 bound (half the points of carbohydrates for a missing sugar) was tried first and is too
harsh for starches: raw red rice, with 75 g of carbohydrates and unmeasured sugars, graded D.

---

## Decision

1. **Typical value of the family.** For a nutrient Ciqual did not measure (sugars, saturated fat,
   salt), the score reads the median measured among foods of the same Ciqual sub-group
   (`typicalValuesBySubgroup`), and a neutral « Valeur typique » highlight names it. The nutrients
   shown on the food stay the measured ones; only the score reads the typical value.
2. **Raw or plainly cooked is whole.** In single-ingredient sub-groups (vegetables, tubers, legumes,
   fruits, nuts, pasta/rice/grains, meat, fish, seafood, eggs), a name saying raw or cooked by
   heat and water alone (cuit, dur, poché, à la coque, au plat, vapeur, bouilli, grillé, rôti, au
   four) reads NOVA 1 and additive-free — unless the name also says fried, sautéed, salted, sugared,
   smoked, breaded, canned, powdered, pre-packed, in syrup, marinated, stuffed, with sauce, butter,
   oil or fat (« non salé » does not count as salted).
3. **Score Ciqual foods on read.** Like own foods (ADR-066), a cached Ciqual product is scored from
   the bundled table each time it is served, so stored rows pick up the change with no migration.
4. **One bounded estimate for every source.** The ADR-066 label bound now applies wherever energy
   and macros are known but the Nutri-Score lines are not (own foods, Open Food Facts products
   without a grade); Ciqual reaches it only when its family has no measured value either.

---

## Options considered

### Option A — Bound missing values by the macros for Ciqual too

Uniform, but penalises starches whose sugars are simply unmeasured (red rice → D).

### Option B — Treat cooked single foods as unknown processing

Honest about NOVA's letter, but ranks a boiled egg 20 points below a raw one for no nutritional
reason, which is what the athlete read as nonsense.

### Option C — Family medians and preparation words (chosen)

Data-driven for the missing values, read from ANSES' own names for processing, and explained on
the food sheet.

---

## Consequences

### Positive

- Eggs: raw 92, boiled 92, poached and soft-boiled 93, plain fried 92; fried and salted stays 70.
- Starches with unmeasured sugars score as their family (red rice 92, plain cooked pasta 91).

### Negative

- A family median can misread an atypical food (a sweet item in a savoury family).
- The preparation words are a list to keep in step with ANSES naming.

### Neutral

- Open Food Facts products keep their stored score until their next OFF read (30 days or a barcode
  read); no score-version bump.

---

## References

- [ADR-065](./ADR-065-generic-foods-come-from-the-ciqual-table.md), [ADR-066](./ADR-066-own-foods-are-scored-from-their-label-on-every-read.md)
- `packages/app/src/lib/nutrition/food-log/ciqual.ts`, `packages/server/src/lib/nutrition/food-log/ciqual-search.ts`
