# ADR-109: Every page of the carnet reads on cards

**Status:** Accepted
**Date:** 2026-10-25
**Author:** Augustin Briolon
**Amends:** ADR-108 (the Corps page reads on cards), ADR-072 (the web becomes a reading carnet)

---

## Context

ADR-108 let the Corps page read on cards and kept the other pages on ruled sections. It listed
the cost: two page grammars in one carnet. On 2026-10-25, with Corps on cards, the athlete saw
the page « fait ovni » next to Aujourd'hui, La saison, Les séances, Les records and La
nutrition, and asked for the cards to reach the whole carnet.

Every reading page already composes the same primitive: `CarnetSection` in
`apps/web/src/components/carnet/carnet-parts.tsx` (about 80 uses across the pages, the race
views and Compte). A section is a label and a title in a left column and its content on the
right, divided from the next by a rule. Corps used a second primitive, `CarnetCard`, for the
same job.

---

## Decision

1. **`CarnetSection` renders as a card.** It keeps its props (`label`, `title`, `className`,
   children) and becomes the one section primitive: a `card-surface` holding the label, the
   title and the content, stacked top to bottom. Every page that composes it changes at once;
   no page keeps rules between sections.
2. **`CarnetCard` is removed.** Corps uses `CarnetSection`, so there is one primitive, not two.
3. **Pages may pair short sections** in a `grid gap-6 lg:grid-cols-2` where two readings sit side
   by side (as Corps does); a long section stays full width.
4. **Everything else from ADR-108 holds.** The carnet stays read-only (ADR-072 points 1 and 2),
   motion stays within ADR-072 point 8 and ADR-028 (opacity and transform, 300 ms at most,
   Reduce Motion honoured), ADR-107 still bans a label, kicker or lead that repeats the layout,
   and no Watermelon file, colour, font or icon is imported.
5. **Skeletons mirror the cards** (`carnet-skeleton.tsx` and each page's `loading.tsx`) so a
   navigation does not jump when the reading arrives.

---

## Rationale

- One grammar across the carnet removes the inconsistency the athlete saw, instead of leaving
  one page ahead of the rest.
- Changing the shared primitive moves every page in one commit and keeps the pages' own markup
  untouched; the figures, charts and reading lists inside a section already stand alone.
- A single primitive is the DRY outcome: Corps no longer carries a copy of the section's job.

---

## Alternatives Considered

### Alternative 1: Return Corps to ruled sections

**Pros:** no change to the other pages; the carnet stays uniform.

**Cons:** drops the cards the athlete chose for the whole redesign and keeps only the ring and
the stage bar.

**Rejected because:** the athlete asked for the cards to spread, not to retreat.

### Alternative 2: Roll the cards out page by page, with a card primitive per page

**Pros:** each page can be tuned on its own.

**Cons:** keeps two grammars for as long as the roll-out lasts and duplicates the section
primitive.

**Rejected because:** `CarnetSection` already is the seam every page shares.

---

## Consequences

### Positive

- The whole carnet reads on one grammar; the race, session and Compte pages follow without a
  separate edit.
- One section primitive, one skeleton shape.

### Negative

- Long pages (La saison, a session) gain card padding and gaps, so they run longer than the
  ruled layout did.
- Tall sections do not pair well in a two-column grid; they stay full width.
- The header of `carnet-parts.tsx` (« no cards ») changes with this decision; `DESIGN_LANGUAGE.md`
  does not describe the carnet's page grammar, so it stays as it is.

---

## Review Criteria

- If the longer pages read worse than before in beta feedback, return them to ruled sections
  with a new ADR.
- If a page needs a section shape the card cannot hold (a full-bleed map, a wide table), allow
  the exception on that page in a new ADR rather than bending the primitive.
