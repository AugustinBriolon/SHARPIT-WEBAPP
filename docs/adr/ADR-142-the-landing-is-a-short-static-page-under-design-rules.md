# ADR-142: The landing is a short static page under a design rules file

**Status:** Accepted
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** [ADR-051](./ADR-051-apex-hub.md), [ADR-135](./ADR-135-the-web-is-swept-to-clinique-on-one-white-sheet.md)

---

## Context

The public landing (`apps/hub`, sharpit.app) was 13,400 px tall at desktop width: eleven sections
that walked through the engine (a manifesto, a contrast table, a five-step method with one diagram
per step, seventeen Gate rules, confidence tiers, Decision Memory, the app's five tabs, a list of
refusals). GSAP ScrollTrigger drove it: a pinned method track, a manifesto revealed word by word,
staggered entrances on every section, and a hero that built itself line by line on load. Every
heading sat under an uppercase label and steps were numbered 01 to 05.

On 2026-11-23 the owner rejected its content, its animations and its look, and supplied a short
list of bans to design against.

---

## Decision

Adopt `docs/design/DESIGN_RULES.md` as the law for `apps/hub`, and rebuild the landing under it as
seven server-rendered sections with no client script of their own: the promise, an example
morning, an example repaired week, three reasons to trust it, sources and pricing, questions, and
the closing.

- **Rules.** Never: gradients, glow, icons in rounded boxes, all caps, eyebrow labels, nested
  cards, decorative pills, bold, decorative numbering, scroll-driven or entrance animation. Always:
  sentence case, semantic tokens only, shadows only on things that float, motion under 300 ms, two
  weights, and a look at 390 px, dark mode and the keyboard before saying done. On the public
  pages these win over older guidance in `docs/design/`.
- **Copy.** `landing-copy.ts` is cut to what the seven sections say. The Gate's rule count stays
  (`LANDING_GATE_RULE_COUNT`) and is still tested against the rule files; the forbidden-copy wall,
  the shipped-sources check and the TestFlight link check stay; a test now refuses capitals.
- **Pricing.** The landing states the Pro prices chosen on 2026-10-20 (12,99 € a month, 99,99 € a
  year).
- **Motion.** Button hover and press, and the FAQ's plus sign turning in 150 ms. Nothing else.
- **Shared heading.** `HEADING` in `landing-parts.tsx` goes from weight 600 to 500, which the help
  centre and the SEO pages inherit.

---

## Rationale

A visitor decides in the first screens whether the app is for them; the old page asked them to
read the architecture first. The parts kept are the two moments the positioning rests on (the
morning decision, the plan that repairs itself) and the three facts that make a coach credible.
The rest is in the help centre, where someone who wants the method can find it.

Bans are checkable where « clean » or « modern » are not: each rule either holds on the page or
does not, so a draft can be verified against the file before it is shown.

---

## Alternatives Considered

### Alternative 1: Keep the sections, restyle them

**Description:** Remove the labels, numbering and motion, keep the eleven sections.

**Pros:**

- Less copy to rewrite; every existing claim stays on the page.

**Cons:**

- Still more than ten screens of reading; the content was rejected, not only the look.

**Rejected because:** the owner asked for the page to be rethought, not restyled.

### Alternative 2: Mock-up first, then code

**Description:** Draw the page on a design canvas, get it approved, then build it.

**Pros:**

- The direction is settled before any code exists.

**Cons:**

- The page is static HTML over existing tokens: the mock-up and the build would be the same work
  done twice.

**Rejected because:** the local build is the mock-up; nothing ships until it is pushed.

---

## Consequences

### Positive

- The page is 4,284 px tall at desktop width (from 13,400) and ships no script of its own.
- `landing-motion.tsx` and `landing-diagrams.tsx` (683 lines) are gone, with five other section
  files.
- One file states what a UI change is checked against.

### Negative

- GSAP stays a dependency of the hub: the help centre's `HelpMotion` still uses it.
- The help centre and the SEO pages still carry eyebrow labels and numbering; they are not swept.
- The prices are now written in two places (App Store Connect and `landing-copy.ts`); a price
  change must touch both.
- The phone capture in the hero is unchanged and shows the app in its light theme on a dark page.

### Scientific debt created

- None.

---

## Review Criteria

- When the web app joins the same design, revisit whether `DESIGN_RULES.md` should bind
  `apps/web` too.
- When the App Store page replaces TestFlight, the download link and its note change.
- If the help centre is swept to the rules, drop GSAP from the hub.
