# ADR-148: The landing keeps the borrowed mechanics and wears SharpIt's own skin

**Status:** Accepted
**Date:** 2026-11-24
**Author:** Augustin Briolon (with Claude Code)
**Related:** supersedes the palette and type of [ADR-147](./ADR-147-the-landing-follows-its-own-style-guide.md); its composition and motion stand

---

## Context

ADR-147 built the landing's home to a style guide measured from another health app's site:
charcoal and cloud blue, a sky gradient behind the hero, headings at weight 600, the system
font. Seen on screen, the owner judged it a copy of that product, and a page that had drifted
from the app's own interface. His question was how to take what is good in a reference without
plagiarising it or losing SharpIt's identity.

---

## Decision

Borrow the mechanics of a reference, never its skin.

- **Kept from ADR-147**: the composition (floating navigation, a full-screen hero field that
  contains the device, a statement, large feature cards, a closing block) and all the motion
  (entrance, the hero's depth, the statement word by word, the pinned track, reveals).
- **Dropped**: the `landing-style` class and every colour it defined, the sky gradient, weight
  600, the system-font override. The landing reads the shared tokens again and follows the
  theme, light or dark, like the app.
- **In their place**: the hero field and the closing block are ink (`landing-night`), the light
  app screen standing out on it; cards are white on the canvas; headings are the app's heading
  face at medium weight; lime appears only inside data; the three rings take the app's pillar
  hues (ADR-130).
- **The rule is written down**: `LANDING_STYLE.md` now holds the table of what may be borrowed
  and what is always ours, with one test: the logo hidden, the page must still read as SharpIt.
- **`DESIGN_RULES.md`'s exception for the landing narrows to motion**: pins, parallax and
  scroll-revealed text. Colour, weight and shape follow the rules everywhere.

---

## Rationale

Composition and motion are how a page works; many products share them and none owns them.
Palette, type, shapes and the product's own visuals are what a visitor recognises. Taking the
first and keeping the second gives the liveliness the owner wanted from the reference with none
of its identity.

A visitor who installs the app after the landing now meets the same ink, the same cards and the
same rings on both.

---

## Alternatives Considered

### Alternative 1: Keep the guide's palette

**Description:** Leave ADR-147 as built.

**Pros:**

- No further work; the page is polished.

**Cons:**

- Reads as another product's page; breaks with the app's interface.

**Rejected because:** the owner named both problems.

### Alternative 2: A light hero in the app's canvas

**Description:** The same composition with the hero field in the tile grey.

**Pros:**

- The whole page matches the app's light sheets.

**Cons:**

- A pale rounded field holding a phone is the reference's signature; ink is its opposite and is
  already the brand's ground.

**Rejected because:** ink sets the page furthest from the reference while staying in the brand.

---

## Consequences

### Positive

- One palette across the landing, the web app and iOS; the landing follows dark mode again.
- No colour is declared for the landing: the hub's `globals.css` loses the scoped palette.
- A written rule for the next reference someone brings.

### Negative

- The landing still depends on script for its pinned track and scrubbed motion.
- A dark hero is a strong statement; if it tests poorly it is the first thing to revisit.

### Scientific debt created

- None.

---

## Review Criteria

- If a future reference is adopted, check it against the table in `LANDING_STYLE.md` before any
  token is added.
- If the ink hero is changed, keep the field containing the device; change its ground only.
