# ADR-143: The landing shows the product as animated widgets

**Status:** Accepted
**Date:** 2026-11-23
**Author:** Augustin Briolon (with Claude Code)
**Related:** amends [ADR-142](./ADR-142-the-landing-is-a-short-static-page-under-design-rules.md)

---

## Context

ADR-142 rebuilt the landing as seven static sections of prose and banned scroll and entrance
animation outright. Seen on screen the same day, the owner rejected it: only text, too much of it,
nothing one wants to read, and less alive than the page it replaced, whose animated diagrams and
embedded widgets he preferred. He pointed at four references (bevel.health, Gentler Streak, Mira
Life, Gismart). What they share: almost no prose, the product's own interface as the content, laid
out as a grid of cards, each moving once as it comes into view.

The ban on entrance and scroll animation was not in the owner's list; it was added in ADR-142 from
a reading of the article he shared.

---

## Decision

Show the product instead of describing it. Each section of the landing is a heading and a grid of
cards; each card is a widget or a diagram, a title and at most one sentence.

- **Sections.** A centred hero over the app's screen; « Chaque matin, une décision » (the morning
  reading and the arbitration diagram); « Un plan qui suit ta vie » (the week and its repair);
  « Il te connaît, et il le prouve » (sources, baseline, the Gate's count, the confidence scale);
  then sources and pricing, questions, closing.
- **One interaction.** The morning reading is live: the visitor eases the session or keeps the
  plan, as an athlete would (`MorningWidget`, local state only).
- **Diagrams.** The five schematics of the earlier landing return unchanged
  (`landing-diagrams.tsx`), one per card instead of one per step of a pinned track.
- **Motion.** `LandingMotion` (GSAP, already a dependency of the hub) plays each widget once as it
  enters the view: bars rise, lines draw, the count runs up, the reading assembles. No pin, no
  parallax, no scrubbed text. Nothing moves under Reduce Motion, and the markup is complete
  without script.
- **Rules.** `DESIGN_RULES.md` drops the ban on entrance and scroll animation. It now separates
  interface feedback (under 300 ms) from storytelling motion (up to a second, once, meaningful,
  still under Reduce Motion), bans pins, parallax and scrubbed text, and bans sections of text
  alone.

Everything else in ADR-142 stands: the bans on gradients, glow, eyebrow labels, capitals, bold and
nested cards, the copy guards, the prices, the heading weight.

---

## Rationale

The claims the page makes (a decision each morning, a plan that repairs itself) are things the
product does on screen; a widget that does them is shorter and more convincing than a paragraph
that says so. The diagrams already existed, were drawn from the product's real rules, and were the
part of the old page the owner liked.

What made the old page heavy was its length and its pinned, scrubbed sections, not the fact that
things moved. Keeping motion to « plays once on entry » keeps the liveliness without making the
scroll wait.

---

## Alternatives Considered

### Alternative 1: Restore the old landing

**Description:** Revert to the eleven-section page with its pinned method track.

**Pros:**

- No new work; the owner preferred its motion and widgets.

**Cons:**

- Brings back the content he rejected first: 13,400 px, eyebrow labels, numbering, long prose.

**Rejected because:** he liked its widgets and motion, not its length or its text.

### Alternative 2: Keep the static page, add screenshots

**Description:** Illustrate the prose sections with captures of the app.

**Pros:**

- No script.

**Cons:**

- Captures do not move and cannot be acted on; the page would still read as text with pictures.
- Captures of real screens carry words the copy wall forbids on the landing.

**Rejected because:** it does not answer « vivant et dynamique ».

---

## Consequences

### Positive

- Card copy is one title and one sentence; the three widget sections carry seven sentences in all.
- The page is 5,329 px tall at desktop width (13,400 before ADR-142).
- The landing has one real interaction, tested by hand in light and dark and at 390 px.

### Negative

- The landing ships GSAP again (ScrollTrigger and DrawSVG), with a client component for motion and
  one for the morning reading.
- Content waits for the motion script before showing (`data-motion-ready`), with a 3 s fallback.
- The motion durations (0.4 to 0.9 s) exceed the 300 ms the owner's list gave for motion; the
  rules file now reads that limit as applying to interface feedback. This reading is ours and is
  his to overrule.

### Scientific debt created

- None.

---

## Review Criteria

- If the owner wants the 300 ms limit to bind every animation, shorten `FAST`, `BASE` and `SLOW`
  in `landing-motion.tsx` and amend the rules file.
- If a widget's rule changes in the product (priority order, baseline window, Gate count), its
  diagram changes with it.
