# ADR-108: The Corps page reads on cards; the rest of the carnet keeps its ruled sections

**Status:** Accepted
**Date:** 2026-10-25
**Author:** Augustin Briolon
**Amends:** ADR-072 (the web becomes a reading carnet)

---

## Context

ADR-072 made the web a read-only carnet. Its page grammar (`carnet-parts.tsx`) is a title, then
ruled sections of figures, sentences and the occasional chart: « no cards, no buttons ».

Corps is the densest page of the carnet. It stacks four sections (sleep, recovery, composition,
sensitive zones) that each hold four figures and a chart, on a wide screen, as one long column of
rules. Reading how the body is doing takes a scroll where a glance would do, and the sections
do not show how they relate (sleep feeds recovery, recovery feeds the load).

The Watermelon UI catalog (MIT, shadcn registry) offers a health dashboard, Bionis, that
solves exactly this with a grid of cards, a score ring and a sleep-stage bar. Its sources were
read on 2026-10-25: it is a self-contained app (own blue palette, Geist and Instrument Serif
loaded from a CDN, a shadcn sidebar, 85 KB of icons, 39 KB of demo data), so installing it would
replace the Ink & Lime identity (ADR-085) rather than extend it.

---

## Decision

1. **The Corps page may use cards.** The four sections become a grid of cards on wide screens
   (one column on a phone), built from the existing primitives of `@sharpit/ui`
   (`card-surface`, `inset-group`, `icon-tile`, `number-chip`, `progress-track`, `pill-*`).
   Bionis is a reference for composition only; no Watermelon file, colour, font or icon is
   imported.
2. **The page stays a reading.** ADR-072 points 1 and 2 hold: no form, dialog, « … » menu, coach
   chat or action button. A period filter, if one is added, is a set of plain links that carry
   `?jours=` in the address and is read outside the cache (ADR-072 point 9).
3. **Motion follows ADR-072 point 8 and ADR-028.** Opacity and transform only, at most 300 ms
   (`motionTokens`), shared enter/exit primitives, Reduce Motion honoured. A score ring is
   static or fades in; it does not animate its stroke.
4. **ADR-107 still applies.** A card does not repeat its title in a kicker, a lead or a row
   description.
5. **Scope: Corps only.** Other carnet pages keep their ruled sections until a new ADR extends
   this one. Card primitives and tests live in `apps/web/src/components/carnet/` and are pure
   (props in, markup out); the page keeps reading the same view models and computes nothing.

---

## Rationale

- Corps is where the cross-reading matters most; cards let sleep, recovery and composition sit
  side by side on the wide screen the carnet is for.
- Recomposing with `@sharpit/ui` primitives keeps the palette, the font (`--font-inter`) and
  the motion tokens shared with the hub and the iOS export (ADR-041).
- Limiting the change to one page makes it reversible and lets the result be judged before it
  spreads.

---

## Alternatives Considered

### Alternative 1: Install Bionis with the shadcn CLI and re-skin it

**Pros:** fastest first render; the layout comes for free.

**Cons:** replaces palette and fonts, adds `recharts@2.15.4`, a sidebar, a theme provider and
~120 KB of demo code; its dropdown and AI action buttons break ADR-072; every file needs
re-skinning anyway.

**Rejected because:** the re-skin costs about as much as recomposing, and leaves dead code.

### Alternative 2: Stay within the ruled-section grammar

**Pros:** no ADR needed; the carnet stays uniform.

**Cons:** the long single column stays; relations between sleep, recovery and composition stay
implicit.

**Rejected because:** the athlete asked for the cards on Corps and the page is the one where
they pay off.

---

## Consequences

### Positive

- Corps shows sleep, recovery, composition and zones in one wide glance.
- No new dependency; `recharts` and `motion` are already installed in `apps/web`.

### Negative

- The carnet has two page grammars until other pages are weighed; `carnet-parts.tsx` and
  `DESIGN_LANGUAGE.md` must say which page uses which.
- Cards add markup the skeleton (`loading.tsx`) must mirror to avoid layout shift.

---

## Review Criteria

- If Corps cards read better in beta feedback, propose the same for Les séances and La saison in
  a new ADR.
- If the two grammars cause drift or visible inconsistency, return Corps to ruled sections.
