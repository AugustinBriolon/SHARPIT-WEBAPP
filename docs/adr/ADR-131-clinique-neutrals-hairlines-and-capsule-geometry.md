# ADR-131: Clinique keeps the brand ink and takes slate text, hairlines and capsule geometry

**Status:** Accepted
**Date:** 2026-11-14
**Author:** Augustin Briolon
**Supersedes:** in ADR-085, the muted text and canvas values of the Colour section, the radii of the Geometry section, and the Elevation section. Ink, lime, spacing, sizes, type and token names of ADR-085 stand.

---

## Context

ADR-130 settled where colour may appear in redesign direction A "Clinique". It left four conflicts between the mock-ups and ADR-085 open:

| Point          | ADR-085                                                      | Mock-ups (direction A)                                   |
| -------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Ink            | `#0e0e0e`                                                    | `#14151A`                                                |
| Secondary text | `#737378`                                                    | `#565A7C`                                                |
| Separation     | one soft card shadow, no border                              | hairline borders and row lines, no shadow                |
| Radii          | card 28, inset group 24, row 18, control 16, tile 14, chip 8 | pill 12, card 20, sheet 28, tab bar 32, capsule controls |

Forces:

- iOS reads tokens from this repository (ADR-041), and token names are kept, so a value change reaches about 2,000 call sites without edits.
- Direction A is a white sheet with tables and thin rings. A shadowed card inside a white sheet reads as a second surface; a hairline reads as a row of the same document.
- The app targets iOS 26 and later. System glass controls are capsules and float with their own shadow, so app-drawn shadows compete with them.
- The app icon, the landing and App Store assets are drawn in `#0e0e0e`.

## Decision

We will keep the brand ink and adopt the mock-ups' secondary text, hairlines and geometry.

1. **Ink stays `#0e0e0e`.** The mock-ups move to it. `#14151A` is dropped.
2. **Secondary text becomes slate `#565A7C`** (was `#737378`). Two neutrals are added: outline `#DADCE6` for control borders, divider `#E9EAF0` for row lines and ring tracks. Canvas becomes `#F3F4F7` (was `#f7f8fa`).
3. **Separation is a hairline, not a shadow.** Cards take a 1 pt divider-colour border; rows take a 1 pt line. `--card-shadow` is removed from cards. Only floating layers cast a shadow: glass bars, glass buttons, sheets over a dimmed backdrop.
4. **Geometry:**
   - sheet 28, card 20, status pill 12, tab bar 32;
   - buttons, glass controls, segmented controls and filter chips are capsules (radius is half the height);
   - icon tiles are 44 pt circles;
   - rows are flat lines with no radius; the inset-group and row radii are no longer used by new screens.
5. **Scope and rollout.** The new values are added to the token source under new names (`--slate`, `--divider`, `--outline`, `--tile`, `--shape-*`, and the ADR-130 sets). Existing tokens (`--muted-foreground`, `--background`, `--radius-card`, `--card-shadow`) keep their ADR-085 values, so the web app and the landing do not change. iOS screens move to the new tokens feature by feature. The old tokens are retired, and the superseded sections of ADR-085 stop applying to a surface, only once that surface has been swept.

### Dark mode

Dark values are derived from the light roles, one value each. Measured on the dark surface `#161618`.

| Role                              | Light                                   | Dark                                    |
| --------------------------------- | --------------------------------------- | --------------------------------------- |
| Ink (text, primary button)        | `#0E0E0E`                               | `#F5F5F7`                               |
| Slate (secondary text)            | `#565A7C`                               | `#A9ADC6` (8.16:1)                      |
| Surface (sheet, card)             | `#FFFFFF`                               | `#161618`                               |
| Canvas (tiles, fields)            | `#F3F4F7`                               | `#242428`                               |
| Backdrop behind sheet             | none                                    | `#0B0B0C`                               |
| Divider                           | `#E9EAF0`                               | `#2C2C30`                               |
| Outline (control border)          | `#DADCE6`                               | `#3A3A40`                               |
| Sleep, recovery, nutrition, coach | `#2E9BE6` `#8DB600` `#F08A24` `#7C5CE0` | `#4DB2F5` `#B4DB2A` `#F59B3D` `#9C82F0` |
| Zone 3, zone 5                    | `#F0B429` `#E5484D`                     | `#F5C24A` `#F2686C`                     |

- Status sets lift their ink for dark fills; the lowest ink-on-fill ratio is 6.98:1. Good `#C5E86A`, watch `#F2C56B`, alert `#F5A3A6`, unknown `#A9ADC6`, protect `#8CCBF7`, pro `#BDAAF7`.
- Sheet washes fade to the dark surface from a tinted, low-lightness version of the status colour.
- Primary button inverts: light ink with dark text. Nothing else inverts.
- Glass uses `rgba(255,255,255,0.10)` with a 0.16 border.
- Text pairs are at least 4.5:1 and marks at least 3:1. Outline `#3A3A40` is decorative and sits below 3:1; any control that relies on it alone to show its edge must use a stronger border first.
- Not measured: text on glass over real content, and the dark values of unswept screens.

## Options considered

### Option A — Keep every ADR-085 value and restyle the mock-ups

- Pros: no token change; the web is untouched.
- Cons: shadowed 28 pt cards on a white sheet lose the lab-report reading that made direction A the chosen one. `#737378` clears AA at 4.7:1 only; small captions beside coloured rings read faint.

### Option B — Take every mock-up value, including the cooler ink

- Pros: the mock-ups ship as drawn.
- Cons: the icon, landing and store assets stay `#0e0e0e`, so the brand would carry two blacks whose difference is not visible at text sizes. Cost with no visible gain.

### Option C — Brand ink, mock-up neutrals and geometry (chosen)

- Pros: one black across brand and app. Slate reaches 6.6:1 on white. Hairlines and capsules match system glass on iOS 26.
- Cons: the web app changes look as a side effect and needs its own sweep. Two radii tokens become legacy.

## Consequences

### Positive

- Secondary text contrast on white rises from 4.7:1 to 6.6:1.
- Cards, rows and tables share one separation rule, so a screen is one surface with lines.
- App-drawn shadows disappear from content; the only shadows left belong to floating controls, which the system draws on iOS.

### Negative

- Two token sets live side by side until every surface is swept: a screen can mix `--muted-foreground` and `--slate` by mistake, and review has to catch it.
- `globals.css` and `ios-token-export.ts` gain the new names; `yarn tokens:ios` must regenerate `SharpitTokens.generated.swift`, and `contrast-foreground-tokens.test.ts` covers the new pairs.
- Web surfaces built on `--card-shadow` (cards in `packages/ui`, the landing) need their own sweep before the old tokens can be removed.

### Neutral

- The design canvas was updated to `#0e0e0e`; the mock-ups otherwise already follow this decision.
- The inset-group radius 24 and row radius 18 stay in the token file for unswept screens.
- iOS still needs its follow-up ADR when the components are built, as noted in ADR-130.

## References

- `docs/adr/ADR-085-ink-and-lime-brand-replaces-botanical-clinical.md`
- `docs/adr/ADR-130-data-hues-and-status-sets-join-ink-and-lime.md`
- Design canvas, direction A: row "A · System"
