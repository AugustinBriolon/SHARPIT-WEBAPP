# ADR-144: The carnet has four destinations and its pages are grids of widgets

**Status:** Accepted (pilot: the shell and Aujourd'hui; the other pages follow)
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** amends [ADR-135](./ADR-135-the-web-is-swept-to-clinique-on-one-white-sheet.md) (page grammar, rail); follows [ADR-143](./ADR-143-the-landing-shows-the-product-as-animated-widgets.md)

---

## Context

The carnet (`apps/web`) is where an athlete reads a season on a large screen; acting stays in the
iPhone app (ADR-072). Its rail listed seven pages by data domain (Aujourd'hui, La saison, Les
bilans, Les séances, Les records, Le corps, La nutrition), and each page was a column of sections
parted by hairlines under uppercase labels, with reasons numbered 01, 02.

After the landing was rebuilt as animated widgets (ADR-143), the owner asked for the same design
on the web app, as a rethink of the experience and not a restyle. Asked on 2026-11-23, he chose:
the web stays a place to read, but alive; four destinations by time horizon; one pilot page in
code, validated on screen, before the rest.

---

## Decision

1. **Four destinations by horizon.** Aujourd'hui (now), Semaine (Saison, Bilans), Progrès
   (Séances, Records), Corps (Santé, Nutrition), and Compte apart. `CARNET_DESTINATIONS` in
   `carnet-pages.ts` is the one list; the rail shows the destinations and a destination with
   several pages shows them in a row above the page (`CarnetSubNav`). No address changes.
2. **A page is a grid of widgets.** A widget sits in a `Tile`: a tinted cell on the white sheet,
   its name in a quiet line, never inside another tile. Sections under hairlines stay on the
   pages not yet redone.
3. **Aujourd'hui is the pilot.** The verdict stays the title. Under it: the four readings as
   rings that draw once, the week as dots, the morning's proposal when there is one, why, the
   day's sessions, what the coach noticed. « Ce que le corps dit » is gone: it repeated the four
   readings on lines; what each is read against now sits under its ring, and what holds the day
   back closes « Pourquoi ». Reasons are no longer numbered.
4. **Type follows `DESIGN_RULES.md` everywhere on the web.** `text-label` is sentence case at
   regular weight; `text-page-title`, `text-card-title`, `text-section-title`, `text-verdict`,
   `text-data` and `text-instrument` are medium. These utilities live in `@sharpit/ui`, so every
   web and hub page changes with them.

---

## Rationale

An athlete opens the carnet with a question about a span of time, not about a table of the
database; the iPhone app is already organised that way (INFORMATION_ARCHITECTURE.md). Seven
entries of equal weight made the reader choose a domain first.

Grouping the existing pages under four destinations gives the new navigation now, with every page
still reachable, while each destination is rebuilt in turn.

---

## Alternatives Considered

### Alternative 1: One dashboard and detail pages

**Description:** A single home grid; each widget opens its page.

**Pros:**

- Closest to the references the owner gave.

**Cons:**

- One page would have to hold a day, a week, a season and a body, and Aujourd'hui would lose its
  verdict as the title.

**Rejected because:** the owner chose the four destinations.

### Alternative 2: Keep the seven pages, redraw each

**Description:** Same rail, each page turned into widgets.

**Pros:**

- No change of habit, least risk.

**Cons:**

- Restyles the pages without rethinking how the reader moves between them.

**Rejected because:** the request was to rethink the experience.

---

## Consequences

### Positive

- The rail has four entries and fits a 390 px screen without scrolling.
- Aujourd'hui shows each reading once instead of twice.
- No address, API or cache contract changes; the page order the transitions rely on is the same.

### Negative

- Until they are redone, Semaine, Progrès and Corps hold the earlier pages: sections under
  hairlines beside a tiled Aujourd'hui.
- The type utilities changed for every page at once, including pages not reviewed one by one.
- Literal `font-semibold` classes remain in files not touched here.

### Scientific debt created

- None.

---

## Review Criteria

- If the pilot is refused on screen, this ADR is superseded before any other page is rebuilt.
- When a destination's pages are merged into one (a single Semaine page), its row of pages goes.
