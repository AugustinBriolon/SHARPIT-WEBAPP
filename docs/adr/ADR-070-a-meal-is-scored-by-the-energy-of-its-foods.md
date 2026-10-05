# ADR-070: A meal is scored by the energy of its foods

**Status:** Accepted
**Date:** 2026-10-05
**Author:** Augustin Briolon (with Claude Code)
**Supersedes:** N/A (extends ADR-063)

---

## Context

Every food carries its Sharpit score (ADR-063), but a meal and a day showed only their calories and
macros. The athlete asked for the score of a meal; an athlete leaving MyFitnessPal expects a reading
of the plate, not only of each line.

---

## Decision

`meal-health-score.ts` (pure, shared by the server and the web):

1. **Energy-weighted mean.** A meal's score is the mean of its foods' scores, each weighted by the
   kcal it brings — the method of the FSAm-NPS dietary index, which scores a diet from the
   Nutri-Score of the foods eaten. A spoon of sauce does not weigh like the plate; water dilutes
   nothing. The grade uses the food scale (`gradeOf`).
2. **Coverage.** Quick adds and foods without a score are left out, and `coverage` says what share
   of the energy is scored. Under 50 % the meal has no number (« Pas assez d’aliments notés »);
   between 50 % and 100 % a neutral « Note partielle » says the share.
3. **What the plate says.** Highlights in the athlete's words: the protein of a main meal (≥ 20 g,
   the low end of the ISSN 20–40 g per meal; « Peu de protéines » only for a main meal of ≥ 400 kcal,
   never for snacks), the day's fibre against EFSA's 25 g, and the share of energy from
   ultra-processed foods (NOVA 4, among foods whose NOVA is known) when it reaches half.
4. **The day** is scored the same way over all its entries.
5. **Served and shared.** `GET /api/v1/food-log` adds `health: { day, meals }`. The web computes the
   same function from its entries, so an optimistic add updates the score at once; iOS renders the
   server's.

---

## Options considered

### Option A — Mean by grams

Simple, but a glass of water or a soup would dilute a meal and a spoon of oil would not count.

### Option B — Recompute a Nutri-Score of the whole plate from summed nutrients

Closer to a recipe's label, but loses NOVA and additives, which the food score holds.

### Option C — Energy-weighted mean of the food scores (chosen)

Keeps every part of the food score, explains itself, and is a published method for diets.

---

## Consequences

### Positive

- Each meal and the day show a score and why, on the web and on iOS.

### Negative

- A day of quick adds has no score; the coverage line says why.
- Thresholds (20 g protein, 400 kcal main meal, 50 % ultra-processed) are choices, kept in one file.

---

## References

- `packages/app/src/lib/nutrition/food-log/meal-health-score.ts`
- Julia C. et al., « The FSAm-NPS dietary index » — energy-weighted mean of food scores
- ISSN position stand: protein and exercise (2017); EFSA dietary reference values for fibre (2010)
- [ADR-063](./ADR-063-the-food-score-explains-itself-and-reads-the-athletes-diet.md)
