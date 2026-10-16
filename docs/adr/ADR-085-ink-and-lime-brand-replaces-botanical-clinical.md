# ADR-085: Ink & Lime brand replaces Botanical-clinical

**Status:** Accepted
**Date:** 2026-10-16
**Author:** Augustin Briolon
**Supersedes:** the palette, typography and elevation sections of `design.md` and `docs/design/DESIGN_LANGUAGE.md` (the causal column, IA and copy rules stay)

---

## Context

The "Botanical-clinical" system (Forest Depths ink on Snow White, leaf-green primary, Lime Pulse punctuation, Syne / IBM Plex Sans / JetBrains Mono, hairline borders, no shadow, dot-grid canvas) no longer represents the product. The athlete-owner supplied seven reference cards (workout summary, PR stat, sleep score, cardio tracker, rest timer, progress chart, set logger) and asked for exactly that look on every surface. The look covers colour and type, and also geometry: corner radii, padding, row rhythm, control heights and shadow.

Constraints:

- iOS reads its tokens from this repository (ADR-041). About 2,000 `SharpitColor` call sites must keep compiling.
- Dark mode is an athlete preference (light / dark / system) and must stay.
- Accent/onAccent pairs must keep clearing WCAG AA (`contrast-foreground-tokens.test.ts`).

## Decision

Adopt **Ink & Lime** on the web app, the landing (`apps/hub`) and iOS.

- **Colour.**
  - Canvas `#f7f8fa`, cards `#ffffff`.
  - Ink `#0e0e0e` for titles, figures, the primary action, icon tiles, number chips and tooltips.
  - Lime `#cdf21e` is the only hue: progress, records, check marks, the live part of a gauge, chart lines.
  - Soft lime `#ecfac0` / `#4f6b00` for comparison pills.
  - Neutral chip `#f2f2f2`, inset group `#f4f4f2`, track `#ebebeb`.
  - Muted text `#737378`. That is darker than the mock-ups' grey so it clears AA on white.
- **Semantics.**
  - A sport is told by its icon, not its colour: every `--sport-*` is ink and every `--on-sport-*` is lime.
  - Intensity reads as a grey → ink → lime ramp (`--chart-1..5`).
  - Caution and risk keep amber and red, for alerts only.
- **Geometry (new tokens, exported to iOS by `yarn tokens:ios`).**
  - Radii: card 28, inset group 24, row 18, control 16, tile 14, chip 8.
  - Spacing: card padding 24, section gap 24, inset padding 12, row gap 8, row padding 16.
  - Sizes: row height 56, button height 52, icon tile 44, number chip 30, progress bar 8.
- **Elevation.** One soft, wide card shadow (`--card-shadow`) on light, and no border. On dark, layers separate by luminosity. This replaces the "No box-shadow" rule.
- **Type.** Inter on the web and SF Pro on iOS. Heavy tabular figures with a muted unit beside them, semibold titles, muted subtitles.
- **Dark mode, derived.**
  - Canvas `#0b0b0c`, card `#161618`, inset group `#1e1e20`.
  - Graphite icon tiles `#2a2a2e` with a lime glyph.
  - Ink and white swap for text and the primary action; lime is unchanged.
- **Token names are kept** (`primary`, `inkSurface`, `chipSurface`…), so existing call sites take the new values without edits.

## Options considered

### Option A — Tune Botanical-clinical

Keep the system and adjust values: brighter lime, rounder cards.

- Pros: smallest diff; no font change.
- Cons: Forest ink, the leaf green and the three brand faces are the parts the owner rejected. A tuned version would still not be the references.

### Option B — Ink & Lime, light only

Match the references literally and drop dark mode.

- Pros: closest to the mock-ups; one palette to maintain.
- Cons: removes a shipped athlete preference and the night reading of the morning screens.

### Option C — Ink & Lime with sport colours kept

Adopt the new system but keep the orange/emerald/sky sport identity.

- Pros: sports stay distinguishable at a glance in lists and calendars.
- Cons: introduces five hues into a system whose point is one hue, and fights the lime. The references identify a sport by its glyph in the ink tile.

### Option D — Ink & Lime everywhere, dark derived, monochrome sports (chosen)

## Consequences

### Positive

- One look across web, landing, iOS and widgets, driven by one token file. `tokens:ios:check` fails CI if iOS drifts.
- Geometry becomes a shared token, not a per-screen choice. iOS reads `SharpitTokens.cardRadius`, `cardPadding` and `controlHeight` from the same source as the web.
- iOS drops three bundled font families (Syne, IBM Plex Sans, JetBrains Mono) and their runtime registration. Dynamic Type now comes from SF Pro natively.

### Negative

- Sport and zone charts lose hue separation. Multi-series charts must rely on the ramp, dash patterns and labels.
- The muted grey is slightly darker than in the mock-ups, for contrast.
- Every screen built on the old shapes (uppercase card eyebrows, round tinted badges) needs a sweep onto the new primitives to look finished. Token-level changes alone leave some spacing as it was.

### Neutral

- Contract tests (`brand-tokens.test.ts`, `sport-identity.test.ts`, the iOS `SharpitThemeTests`) now assert the new values.
- The landing's `night` band is ink.

## References

- Reference cards: `docs/design/reference/ink-and-lime/`
- ADR-041 (iOS tokens generated from the web), ADR-051 (hub shares the design system)
