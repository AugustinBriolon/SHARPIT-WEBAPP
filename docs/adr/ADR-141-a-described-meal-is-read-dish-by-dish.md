# ADR-141: A described meal is read dish by dish

**Status:** Accepted
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-065](./ADR-065-generic-foods-come-from-the-ciqual-table.md), [ADR-071](./ADR-071-a-meal-logs-again-in-one-tap.md), [ADR-076](./ADR-076-a-quick-add-is-scored-from-its-own-macros.md), [ADR-134](./ADR-134-a-meal-logged-whole-is-a-group-naming-its-foods.md)

---

## Context

« Décrire un repas » turned « un œuf mayo en entrée, des lasagnes et une mousse au chocolat » into
one flat list of guessed ingredients, logged as one group named by the raw sentence. Three courses
could not be told apart, renamed or removed one by one.

Reading the feature against its raw material — the bundled Ciqual table and the real model — showed
more than the missing split:

- The prompt forbade composite dishes, so lasagne became pasta, beef and béchamel, each guessed,
  although the table **measures** the dish (« Lasagnes ou cannelloni à la viande (bolognaise) »,
  « Mousse au chocolat traditionnelle », « Quiche lorraine »).
- A catalog match was accepted on words alone. Against the real table, « riz » links to raw rice
  (352 kcal per 100 g against 145 cooked), « mayonnaise » to a baguette sandwich, « laitue » to dried
  seaweed, « fromage » to head cheese — each shown to the athlete as « Table Ciqual ».
- An English-speaking athlete got English food names, which never match the French table.
- The model's energy and macros were only clamped, never checked against each other.
- A one-word dish (« pizza ») was refused by the 8-character minimum.
- The model call had no time limit and the iPhone retried a server failure up to four times, each
  try a paid estimate.
- Nothing ran the prompt against the real model: every test mocked it.

---

## Decision

1. **The model answers `dishes[]`, each with its `items[]`.** A dish is what is served as a unit. A
   dish known as a whole stays one line; a composed plate (« steak, frites, haricots ») keeps its
   foods; a drink is always its own dish. At most 8 dishes of 8 foods.
2. **Each food carries `searchName`** — its French table name with its state as eaten (« riz blanc
   cuit ») — used for the catalog lookup. `name` is what the athlete reads.
3. **A catalog match must agree on energy with the model's estimate** (`isPlausibleMatch`: within
   25 kcal, or a ratio of at most 1.6). Candidates that disagree are dropped before ranking; with
   none left, the estimate is kept and shown as such.
4. **Figures are made coherent** (`coherentPer100g`): at most 100 g of macros in 100 g, and never
   less energy than 4/4/9 kcal per gram of those macros. More energy is left alone — alcohol.
5. **`POST /api/v1/food-log/describe` answers `dishes` and, beside it, the same foods flat in
   `items`**, which app builds already installed keep reading.
6. **The iPhone reviews dish by dish and logs one batch per dish.** Several foods are a
   `FoodLogGroup` named by the dish (ADR-134); a dish of one food is a plain entry. No schema change.
7. **Limits:** the description needs 3 characters; the model call is aborted after 30 s; the iPhone
   sends again only a request that never arrived, once.
8. **A live eval**, `yarn api eval:food-describe`: nine golden descriptions read by the real model,
   checked for the dishes told apart, dishes kept whole, stated grams kept and an energy range worked
   out from the table. It needs `AI_GATEWAY_API_KEY`, so it is run by hand after any change to the
   prompt or the model, not in pre-push.
9. **The iPhone no longer offers « Saisie rapide » nor « Créer une recette ».** Recipes already
   created stay in « Mes aliments », loggable and editable. The routes and the quick-entry contract
   stay: an estimated food of a described dish is still logged through it (ADR-076).

---

## Options considered

### Option A — Dishes in the model's answer, one group per dish (chosen)

- The model already reads the courses; asking for them costs one level of nesting.
- A dish maps onto the group that exists (ADR-134): no migration, no new route.
- Each dish is stored whole or not at all, but the meal is not: one dish can fail alone.

### Option B — Keep the flat list, split it on the client

Cut the foods into dishes from the words of the description (« en entrée », « puis », « et »).

- No change to the model's contract.
- A heuristic over free French text, wrong as soon as the sentence is not the expected shape, and
  it cannot keep a dish whole since the foods are already split.

### Option C — One batch carrying several groups

`entries/batch` takes `groups: [{ label, entries }]` and writes the whole meal in one transaction.

- Atomic across dishes, and the meal shows at once.
- A wider write contract and a second shape for the batch, for a failure mode — one dish of three
  not stored — the athlete can see and redo. Deferred until it is seen to matter.

---

## Consequences

### Positive

- The example above reads as three dishes; lasagne and the mousse are the table's measured lines.
- A wrong food under the right word is no longer logged as verified: on the real table « riz »
  alone falls back to the estimate, « riz blanc cuit » links to the cooked line.
- The prompt has a regression check: two slips were found and fixed by its first run (the
  mayonnaise of an « œuf mayo » left out; a glass of wine folded into the plate).

### Negative

- A dish that fails to store leaves the others logged, and the dishes appear one after another.
- A Free athlete loses the hand-typed entry and keeps search, scan and own foods.
- The energy check trusts the model's estimate as the second source: a wrong estimate can refuse a
  right match, which then shows as an estimate — never the reverse.
- A lone word can still link to a wrong line of similar energy (« kebab » → « Pizza kebab »).

### Neutral

- The coach's food tool calls `resolveDescribedName` without an estimate and is unchanged.
- The eval's energy ranges are wide (±25 %): they catch a food forgotten or doubled, not a portion
  slightly off.

---

## References

- `packages/server/src/lib/nutrition/food-log/food-describe.ts` (prompt), `food-describe-schema.ts`
  (`coherentPer100g`), `food-describe-resolve.ts` (`isPlausibleMatch`)
- `packages/server/src/handlers/food-log/describe/handler.ts`
- `apps/api/scripts/eval-food-describe.ts`, `eval-food-describe-fixtures.json`
- iPhone: `Features/Nutrition/FoodDescribePage.swift`, `FoodAddSheet.swift`
