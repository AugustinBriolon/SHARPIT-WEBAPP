# Design — SHARPIT

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

<!-- Hallmark · theme: designed-as-app · design-system: design.md · genre: instrument-editorial -->

## Genre

**editorial / instrument** — precision instrument for Athlete State Intelligence.
Not atmospheric, not playful, not SaaS dashboard, not fitness tracker.

Canonical philosophy: [`docs/design/DESIGN_LANGUAGE.md`](docs/design/DESIGN_LANGUAGE.md)  
Agent prompt: [`docs/design/DESIGN_SYSTEM_PROMPT.md`](docs/design/DESIGN_SYSTEM_PROMPT.md)  
Product constitution: [`docs/product/PRODUCT.md`](docs/product/PRODUCT.md)

## Macrostructure family

Pages within a family share the family's shape; they vary only in component archetypes.
**Diversification across Hallmark catalog themes is forbidden** — same product, same system.

- Marketing pages: typography-led instrument (no Specimen / Bento defaults)
- App pages: **causal column** — State → Evidence → Recommendation → Projection → Limit → Confidence
- Content pages: document density with `text-label` eyebrows + `analysis-panel` surfaces

## Theme — Ink & Lime (ADR-085)

Tokens live in [`packages/ui/src/styles/globals.css`](packages/ui/src/styles/globals.css); hex
primitives in `packages/app/src/lib/brand/brand-tokens.ts`. Do not invent a parallel `tokens.css`.
The look is the seven cards in [`docs/design/reference/ink-and-lime/`](docs/design/reference/ink-and-lime/) — match them.

- Canvas `--background` #f7f8fa, flat · Cards `--card` white, `rounded-card` (28px), `shadow-card`, no border
- Ink `--foreground` / `--primary` / `--ink-surface` #0e0e0e — titles, figures, primary action, icon tiles, tooltips
- Lime `--highlight` #cdf21e — the only hue: progress, records, checks, the live part of a gauge, chart lines
- Soft lime `--accent` — comparison pills · Neutral chip `--chip-surface` · Inset group `--inset-group` · Track `--track`
- Sport identity is the icon, never a colour (`--sport-*` all ink, `--on-sport-*` lime)
- Intensity ramp `--chart-1..5`: grey → ink → lime · Caution / risk keep amber / red, alerts only
- Dark: canvas #0b0b0c, card #161618, graphite tiles, lime unchanged

Primitives (`@utility`): `card-surface`, `inset-group`, `inset-row`, `icon-tile`, `number-chip`,
`pill-lime`, `pill-neutral`, `pill-soft`, `progress-track`, `text-hero`. Buttons: `default` (ink),
`accent` (lime), `secondary` (chip), `dashed`; size `xl` is the 52px full-width action.

## Typography

Inter everywhere on the web (SF Pro on iOS). Utilities in `globals.css`:

- Hero figure: `text-hero` — 800, tight, tabular; its unit beside it in `text-muted-foreground`
- Display / verdict: `text-verdict` — 700
- Page title: `text-page-title` — 700 · Section title: `text-section-title` — 700 · Card title: `text-card-title` — 600
- Data / instrument: `text-data` (700) / `text-instrument` (600) — tabular nums
- Labels: `text-label` — uppercase, tracked 0.06em, muted

One `<h1>` per page. Headings are roman (no italic display).

## Geometry

Card padding 24 · section gap 24 · inset group padding 12 · row gap 8 · row height 56 · button 52 ·
icon tile 44 · number chip 30 · bar 8. Radii: card 28 · inset 24 · row 18 · control 16 · tile 14 · chip 8.
All are tokens (`--space-*`, `--size-*`, `rounded-*`), exported to iOS by `yarn tokens:ios`.

## Spacing

Dense (metrics): 12–16px · Standard (panels): 20–24px · Airy (explanations): 32–48px  
Prefer named Tailwind / CSS tokens already in the project; never uniform `p-6` everywhere.

## Motion

Restraint. Prefer opacity/transform only. Honor `prefers-reduced-motion`.  
No celebratory toasts, no pulse/bounce on chrome.

## Microinteractions stance

- Silent success over celebration
- Instant focus rings; no animated ring appearance
- Color is reserved for semantic state (go / caution / risk)

## CTA voice

- Primary: ink fill (`Button` default / `xl`), short imperative French; lime `accent` for a live positive action
- Secondary: outline / ghost, never competing with the verdict

## Physio drill-downs — native mobile shell

Shared by `/today/sleep|recovery|adaptation|effort`:

- Date pill **centered**, fixed width `15.5rem` (mobile + desktop)
- Chips: horizontal snap-scroll on mobile · grid from `sm`
- Surfaces: `rounded-[1.25rem]` inset on mobile; analysis panel on desktop
- Stack: plate → chips → why → evidence (`space-y-3` mobile)

## Today — Morning Instrument

`/` first viewport is one **plate**, not a dashboard:

1. Plate — label + 3 confidence bars · Syne verdict · one action line · limiter → drill-down
2. Signal chips — no parent panel; 2×2 mobile · one row desktop (`Sommeil 78 →`)
3. Why — primary finding as short narrative, rest in expand
4. Session — chip-style response only (no Frein column duplicate)
5. Trajectory — naked sparklines; titles are drill-downs

**Color = emotional state** (tint 12% + status dot + encouraging strip values). Never card grids.  
`RECOVER` uses protective sage/primary — never punitive red.  
Signal / session chips invite detail (hairline + →) without competing with the verdict plate.

No stacked metric cards in the hero. No physio rail competing with the verdict.

## App pages — Instrument family

Same causal column as Today (plate → chips → evidence → trajectory). No fitness-dashboard inventories.

- **`/training`** — plate (objectif `J-n` ou prochaine séance) · chips séances/activités · régularité en expand
- **`/activite/[id]`** — **post-flight logbook** dialect (`.activity-reading`): Session plate · weighted instruments always visible (3 primary + quieter secondary, no disclosure) · evidence · curves · rhythm splits · specs annex flat (`filterByAudience` for essential vs expert). Expert: Performance + zones inline via `ExpertOnly`, no accordion. Surfaces via luminosity, not hairline grids or left accent bars. Seed `b31627f2` / Logbook post-vol.
- **`/biology?tab=composition`** — plate poids · chips fat/muscle/visceral · why insights · métriques en chips + expand · 1 chart poids, autres tendances en expand
- **Physio drill-downs** (`/today/sleep|recovery|adaptation|effort`) — shared shell: plate (dimension verdict + mono score chip) · signal chips · why bandeau · evidence (1 primary chart). No PhysioRail / inset % in the hero.

Canonical detail: [`docs/design/DESIGN_LANGUAGE.md`](docs/design/DESIGN_LANGUAGE.md) §14.

## Forbidden (anti-patterns)

- Streak counters, Flame icons, habit-tracker heatmaps as primary signal
- Progress rings / radial gauges dominating a hero
- Sparkles / “AI chatbot” chrome on Coach or state surfaces
- Colored glow shadows on nav pills
- Teal/cyan “health app” DNA for recovery charts
- Competitive card grids on the Today verdict / stacked RadialScoreCards in the plate
- Decorative grid textures without informational function
- Invented metrics or motivational micro-copy
- Labels, kickers, leads or hints that restate what the title, the value or the layout already says (ADR-107)
- **Route-hop to open a modal** — navigating to another page solely so a query param can mount a dialog the current surface can host. Open the dialog in place; reserve `?generate=` / `?adapt=` deep-links for cross-destination entry (e.g. Today → Plan semaine)

## Surfaces

- Prefer `analysis-panel` (flat surface + hairline border)
- `analysis-panel-alt` is a flat alt surface — **no decorative grid / gradient wash**
- Elevation via luminosity, not heavy shadows (especially dark mode)

## Exports

Source of truth for values: [`src/app/globals.css`](src/app/globals.css).  
Hallmark must reference named tokens / utilities — never mid-render hex improvisation.
