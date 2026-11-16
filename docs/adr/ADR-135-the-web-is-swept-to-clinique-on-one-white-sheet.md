# ADR-135: The web is swept to Clinique on one white sheet, without the wash

**Status:** Accepted
**Date:** 2026-11-16
**Author:** Augustin Briolon
**Amends:** ADR-131 (rollout: the web surfaces are now swept), ADR-130 point 5 for the web only (no wash), ADR-109 (page grammar: sections, not cards).

---

## Context

ADR-130 and ADR-131 gave the iOS app its Clinique look and added the tokens to `globals.css` under new names. The web (the carnet in `apps/web`, the landing and help in `apps/hub`) kept Ink & Lime: a lime current tab, shadowed 28 px cards, grey secondary text. The two no longer looked like one product.

Forces:

- iOS generates its tokens from the `:root` and `.dark` blocks of `globals.css` (ADR-041), and `brand-tokens.test.ts` pins the Ink & Lime values there. Changing a legacy value in `:root` changes the iOS export.
- About sixty web files use the legacy names (`text-muted-foreground`, `card-surface`, `border-border`).
- Six web mock-ups were approved on 2026-11-16. The gradient wash at the top of each page was rejected for the web: on a wide screen it reads as decoration.
- A wide screen has room the phone lacks: a rail beside the page, a second column.

## Decision

We will draw every web surface in Clinique, on one white sheet, with no wash.

1. **Tokens are remapped under `body`, not in `:root`.** `--background`, `--muted-foreground`, `--border`, `--track`, `--card-shadow` and `--radius-card` take the Clinique values (`--tile`, `--slate`, `--divider`, none, `--shape-card`) in a `body` block. `:root` keeps the Ink & Lime values iOS reads.
2. **The carnet is a rail and a sheet.** From `lg` up the pages are a rail on the canvas and the page is one white sheet with a 28 px corner and a hairline. Below `lg` the header and the row of pages stay, on white.
3. **Ink marks the current page.** The current page is an ink capsule; lime no longer marks navigation.
4. **A section is parted by a hairline, not held in a card.** `CarnetSection` loses its card. A bordered 20 px tile is kept for a small unit inside a section (a ring and its caption).
5. **No wash on the web.** The top of a page is plain white. A status is carried by its pill and its word.
6. **A page may take a second column** (`CarnetPage` `side`), beside the sections from `lg` up and under them below.
7. **Rings are thin and take a pillar hue** (3-unit stroke on the divider track), as on iOS.
8. **A page prints as its sheet.** The rail and the header are left out of print and sections hidden for their entrance are shown, so a bilan goes to paper or PDF from the browser's own print, with no control added.
9. **Buttons are capsules on the web too** (`buttonVariants`), as ADR-131 set for iOS; no button is lime.

## Options considered

### Option A — Change the legacy values in `:root`

- Pros: one block, no second scope.
- Cons: the iOS export and the brand contract change with it; a web redesign would rewrite another repository's generated file.

### Option B — Rename every call site to the Clinique tokens

- Pros: the legacy names could be deleted.
- Cons: about sixty files edited for no visible difference from option C; the legacy names must stay anyway while iOS reads them.

### Option C — Remap under `body` (chosen)

- Pros: every web screen changes with no call-site edit; iOS and the contract tests are untouched.
- Cons: a token has two values depending on scope, which a reader of `:root` alone will not see. The block carries a comment naming this ADR.

## Consequences

### Positive

- Secondary text on the web rises from 4.7:1 to 6.6:1 on white, as on iOS.
- The carnet, the landing and the app share one separation rule: lines, no content shadow.

### Negative

- `<html>` still paints the `:root` canvas (`#f7f8fa`) behind `body` (`#f3f4f7`); the difference shows only on overscroll.
- The app keeps one wash per screen and the web has none: the two differ on purpose.
- The landing keeps its own layout and motion (ink sections, the scroll-driven method): it inherits the tokens, its phone shows a capture of the Clinique Résumé, and its closing button is no longer lime. It does not follow the static mock-up drawn for it.

### Neutral

- `--highlight` stays lime for the brand mark, records and the landing.
- The carnet stays a place to read (ADR-072): no control was added.

## References

- `docs/adr/ADR-130-data-hues-and-status-sets-join-ink-and-lime.md`
- `docs/adr/ADR-131-clinique-neutrals-hairlines-and-capsule-geometry.md`
- `docs/adr/ADR-109-every-carnet-page-reads-on-cards.md`
- `packages/ui/src/styles/globals.css` (the `body` block)
