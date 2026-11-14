# ADR-130: Data hues and status sets join Ink & Lime; ink keeps the interface

**Status:** Accepted
**Date:** 2026-11-14
**Author:** Augustin Briolon
**Supersedes:** the "Lime is the only hue" line and the Semantics section of ADR-085. Geometry, elevation, type and token-name decisions of ADR-085 are not decided here.

---

## Context

The iOS app is being redesigned. Three directions were mocked on the same screens; direction A "Clinique" was chosen and extended to 34 screens, a token sheet, a component sheet and five state screens (empty, loading, offline, free plan). The mock-ups are design only; no app code has changed.

Direction A reads like a lab report: white sheets, thin ring gauges, a status pill beside each value. It needs colour that ADR-085 forbids:

- ADR-085 makes lime `#cdf21e` the only hue and tells a sport, a zone and a score apart by glyph, ramp and label.
- The Résumé screen shows four scores side by side (sleep, recovery, nutrition, consistency). In one hue they are told apart only by a 12 pt glyph.
- Health results (blood markers, thresholds, sensitive zones) need four readings: in range, drifting, out of range, unknown. ADR-085 keeps amber and red "for alerts only" and has no neutral or in-range set.
- `globals.css` already carries health-status token roles, so the web has the roles but no agreed values for this look.

Constraints carried over from ADR-085: iOS reads tokens from this repository (ADR-041), dark mode stays an athlete preference, and foreground/background pairs must clear WCAG AA (`contrast-foreground-tokens.test.ts`).

## Decision

We will add a bounded set of data hues and status sets to Ink & Lime, and keep ink as the only colour of the interface itself.

1. **Ink runs the interface.** Text, primary buttons and selected states are ink. No button, tab or link is coloured.
2. **A hue names a pillar.** Four hues appear on rings, glyphs and chart marks only, never as text:
   - sleep `#2E9BE6`
   - recovery `#8DB600` (the brand lime, darkened so a 3 pt stroke shows on white)
   - nutrition `#F08A24`
   - coach and consistency `#7C5CE0`
3. **Intensity is a five-step scale** for zones 1 to 5: `#2E9BE6`, `#8DB600`, `#F0B429`, `#F08A24`, `#E5484D`. It replaces the grey → ink → lime ramp on zone charts only.
4. **A status is a set of fill, border and ink, always shown with a word:**

   | Status  | Fill      | Border    | Ink       |
   | ------- | --------- | --------- | --------- |
   | good    | `#F1F8D8` | `#D5E79A` | `#4F6B00` |
   | watch   | `#FFF1D6` | `#F5D9A0` | `#8A5A00` |
   | alert   | `#FDECEC` | `#F6C6C8` | `#B4232A` |
   | unknown | `#F3F4F7` | `#DADCE6` | `#565A7C` |
   | protect | `#E4F2FD` | `#BBDDF6` | `#135E96` |
   | pro     | `#EFEBFC` | `#D5CBF7` | `#4B32B0` |

5. **One wash per screen.** The top of a sheet may fade from a status or pillar tint to white. Everything below is white.
6. **Lime stays the brand.** The app icon, the good status and recovery keep the Ink & Lime identity. `#cdf21e` itself stays in the token file for the icon, the landing and widgets.

## Options considered

### Option A — Keep lime as the only hue

- Pros: no token change; ADR-085 stands as written.
- Cons: the four Résumé scores differ only by glyph. A blood marker that is out of range and one that is unknown both render as a grey pill with a word. The chosen direction cannot be built.

### Option B — Replace Ink & Lime with a multi-hue brand

- Pros: full freedom for the redesign; one ADR instead of an amendment.
- Cons: discards a brand shipped four weeks ago (app icon, landing, App Store assets). Colour on buttons and navigation would compete with the status colours that carry health meaning.

### Option C — Bounded data hues and status sets (chosen)

- Pros: colour appears only where it carries data, so a coloured element always means a pillar or a status. The brand, the icon and every ink surface are untouched.
- Cons: ten new colour roles to maintain in light and dark. The rule "never as text, never on a control" has to be held in review, since tokens alone cannot enforce it.

## Consequences

### Positive

- Each Résumé score is identifiable by hue and glyph, and each health value by a worded status with its own set.
- The six status sets give `globals.css` health-status roles one agreed value each, shared by web and iOS.
- Free-plan screens can mark a coach feature with the pro set without inventing a colour.

### Negative

- `brand-tokens.ts` gains four pillar tokens, five zone tokens and eighteen status tokens; `yarn tokens:ios` must regenerate `SharpitTokens.generated.swift`.
- Dark-mode values for all of them are not defined yet. Only the Résumé was mocked in dark.
- Status ink on its fill was checked at 4.5:1 or more in light mode. Text on glass and on dark sheets has not been measured.
- Zone charts built on the `--chart-1..5` ramp need a second pass to use the zone scale.

### Neutral

- The mock-ups also use a cooler ink (`#14151A`), a slate secondary text (`#565A7C`), hairline borders instead of the card shadow, and different radii. Those conflict with other sections of ADR-085 and need their own decision before integration.
- iOS needs a follow-up ADR when the components are built (successor to iOS ADR 0012), including how the glass controls map to the system material.

## References

- `docs/adr/ADR-085-ink-and-lime-brand-replaces-botanical-clinical.md`
- `docs/adr/ADR-041` (iOS reads tokens from this repository)
- SHARPIT-APP `docs/adr/0012-ink-and-lime-primitives-on-sf-pro.md`
- Design canvas, direction A: rows "A · System" and "A · States"
