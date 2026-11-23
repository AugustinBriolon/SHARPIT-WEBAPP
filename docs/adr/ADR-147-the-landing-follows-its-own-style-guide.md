# ADR-147: The landing follows its own style guide, immersive and scroll-driven

**Status:** Accepted
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** amends [ADR-142](./ADR-142-the-landing-is-a-short-static-page-under-design-rules.md) and [ADR-143](./ADR-143-the-landing-shows-the-product-as-animated-widgets.md) for the landing

---

## Context

ADR-142 put the landing under `DESIGN_RULES.md` (no gradient, no bold, Ink & Lime tokens);
ADR-143 brought widgets and motion back but still banned pins, parallax and scroll-scrubbed text.

On 2026-11-23 the owner supplied a style guide measured from a health app's site and asked for a
premium, immersive, heavily animated home page that follows it faithfully: GSAP and
ScrollTrigger, scroll animations, text and image reveals, parallax, transitions between
sections, elements that move or transform with the scroll, micro-interactions, depth, and a
full-screen hero with a marked entrance. The guide's palette, its weight-600 headings, its hero
gradient and the motion asked for all contradict the rules above. Asked which should win, the
owner confirmed the guide, for the landing.

---

## Decision

The landing's home page follows `docs/design/LANDING_STYLE.md`, and that guide wins over
`DESIGN_RULES.md` there and nowhere else.

- **Scope.** One class, `landing-style` (hub `globals.css`), holds the guide's palette and sets
  the semantic tokens the shared components read, so a widget inside the landing takes the
  guide's colours. Outside it nothing changes: the web app, the help centre and the legal pages
  keep their tokens. The landing is a light page whatever the theme.
- **Composition.** A floating capsule navigation; a full-screen rounded field of daylight
  holding the promise, the download pill and the app's screen, with product facts floating
  beside it; a row of integrations; a statement; the morning reading; the plan and the model as
  a track of cloud cards; three proof cards; pricing; questions; a charcoal closing block.
- **Motion** (`landing-motion.tsx`, GSAP). An entrance on load (the field opens, the headline
  rises line by line, the phone lands, the facts settle). Scrubbed to the scroll: the hero's
  depth (copy, phone and each fact at its own speed), the statement coming to ink word by word,
  the track pinned and travelling sideways on a wide screen, the closing block growing to the
  page's width. Played once on entry: headlines from behind a mask, cards, diagrams, counts.
  Under Reduce Motion none of it runs and the page reads as rendered.
- **Not taken from the guide.** Ratings, awards and member stories (the app is in beta and none
  is invented), a watch render, partner wordmarks.

The copy guards of ADR-142 stand (forbidden words, shipped sources, the Gate's count, no
capitals).

---

## Rationale

A landing is the one page whose job is to make a stranger stop; the app's own pages are read
daily and should stay quiet. Holding the exception to one class keeps the two from leaking into
each other, in either direction.

Scrubbing what is tied to the scroll, and playing the rest once, keeps the page from running
ahead of the reader or replaying on every pass, which is what makes heavy motion feel like a
gadget.

---

## Alternatives Considered

### Alternative 1: Keep Ink & Lime, borrow only the layout

**Description:** The guide's composition and motion in SharpIt's own palette and weights.

**Pros:**

- One brand across the landing and the app.

**Cons:**

- Not what was asked: the guide was given as the first authority for colour and type.

**Rejected because:** the owner confirmed the guide wins on the landing.

### Alternative 2: Change the design tokens for the whole web

**Description:** Adopt the guide's palette in `@sharpit/ui`.

**Pros:**

- No scoped exception.

**Cons:**

- Restyles the web app and, through the shared `:root` tokens, the iOS export.

**Rejected because:** the request was the landing.

---

## Consequences

### Positive

- The home page opens on a full-screen hero with an entrance, and every section moves with or
  on the scroll.
- The exception is one class and one document; removing either restores the shared look.

### Negative

- The landing and the app no longer share a palette: charcoal and cloud blue outside, ink and
  the app's tokens inside. A visitor who installs the app meets a different look.
- The palette and composition are close to another product's public site. The guide is a
  reference, and the page uses SharpIt's own mark, copy and screens, but the resemblance is
  deliberate and is the owner's call.
- A pinned track and scrubbed motion depend on script; a slow device pays for them. The page is
  8,900 px tall at desktop width because of the pin's travel.
- Hex values live in the hub's `globals.css` for this class, against the rule that components
  use semantic tokens only (components still do; the class maps them).

### Scientific debt created

- None.

---

## Review Criteria

- When the app has ratings or testimonials, the guide's proof components can be added.
- If the two looks confuse visitors (installs that bounce at first launch), bring the landing
  back toward the app's palette.
- À propos, Services and Contact pages, named in the request, are not built: decide whether a
  one-product landing needs them.
