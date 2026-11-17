# ADR-134: A meal logged whole is a group naming its foods

**Status:** Accepted
**Date:** 2026-11-16
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-061](./ADR-061-the-food-log-lives-in-sharpit.md), [ADR-070](./ADR-070-a-meal-is-scored-by-the-energy-of-its-foods.md), [ADR-113](./ADR-113-a-skipped-meal-is-a-choice-not-a-gap.md)

---

## Context

A meal described in words (« kebab, salade tomate oignon, sauce algérienne, frites ») is split by the
model into its foods and stored as that many `FoodLogEntry` rows. The athlete then reads five
unrelated lines in the meal's page where they ate one thing. The iPhone's review screen now shows the
meal as one before it is logged; once logged, nothing says the foods belong together.

Three things read the log per food and must keep doing so: the food's health score (ADR-070), the
coach's flags on an entry, and « Déjà mangés », which offers again the foods eaten lately. Storing the
meal as a single composite entry would blind all three and fill « Déjà mangés » with dishes that
cannot be logged again as such.

---

## Decision

1. **`FoodLogGroup`** (id, athlete, label) names foods logged together. `FoodLogEntry.groupId` points
   to it, nullable, `ON DELETE CASCADE`. The foods stay entries: nothing that reads the log changes.
2. **The group holds neither the day nor the meal.** Its entries do, so a food moved to another meal
   never contradicts its group.
3. **`POST /api/v1/food-log/entries/batch`** takes an optional `group: { label }` (1–80 characters).
   The group and its entries are written in the batch's one transaction; the server names the group.
4. **A served entry carries `groupId` and `groupLabel`**, on the day's read and on every write's echo,
   so a client groups its lines without a second request.
5. **`DELETE /api/v1/food-log/groups/[id]`** deletes the meal and its foods and rebuilds each day they
   sat in. Deleting a group's last food deletes the group in the same write: no empty shell is kept.
6. **A copy keeps the meal.** « Copier la veille » writes each copied group once, under a new id.
7. **The export carries the groups** (`foodLogGroups`): the label is the athlete's own words.

The migration is additive — one table, one nullable column. No existing row is rewritten; every entry
logged before it stays ungrouped.

---

## Options considered

### Option A — A group table naming the entries (chosen)

The meal is a row of its own; entries point to it.

- The label exists once: a rename is one write, and it cannot differ between two foods of a meal.
- The group is owned (`athleteId`), so a delete is checked like any other write.
- Deleting the meal is one delete; the cascade takes its foods.
- One more table, and a join on the day's read.

### Option B — Two columns on the entry (`groupId`, `groupLabel`)

No table: each food carries the id and a copy of the label.

- The smallest migration, and no join.
- The label is stored once per food — five copies for a kebab — and nothing stops them from drifting.
- The id would be a free string with no owner to check it against.
- A later need (keeping the athlete's sentence, logging the meal again) means another migration.

### Option C — One composite entry for the whole meal

The meal is a single `FoodLogEntry` with the summed macros; its foods are kept as JSON.

- One line in the log with no client grouping.
- The score, the coach's flags and « Déjà mangés » lose the foods; a portion can no longer be changed
  food by food.

---

## Consequences

### Positive

- A described meal reads as one line in the log, opened onto its foods.
- Scores, flags, recents, the day's totals and the NUTRITION observation are untouched: they read
  entries, which are unchanged.
- Entries logged before the migration behave exactly as before.

### Negative

- Every writer that creates entries from other entries must decide what to do with their group. Copy
  keeps it; a saved meal (« Mes repas ») logs ungrouped foods, as before.
- The web's food log page lists the foods separately until it reads `groupLabel`.
- The migration must be applied before a client sends `group`: an older server ignores the unknown
  key and logs the foods ungrouped, which is the previous behaviour, not a failure.

### Neutral

- A group is not renamed yet: no route does it.
- A group of one food is shown by the iPhone as that food.
- A group can be kept in « Mes repas »: `POST /api/v1/food-log/meals` takes an optional `groupId`
  and saves only that meal's foods (2026-11-17). Logged again, they are ungrouped foods, as any saved meal.

---

## References

- `packages/db/prisma/migrations/20261116120000_food_log_group/migration.sql`
- `packages/server/src/lib/nutrition/food-log/food-log-service.ts` (`addFoodLogEntries`, `deleteFoodLogGroup`)
- `packages/server/src/lib/nutrition/food-log/food-log-templates.ts` (`copyFoodLog`)
