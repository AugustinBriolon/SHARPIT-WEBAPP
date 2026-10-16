# SHARPIT — Design System Prompt

> Agent-facing design prompt: the operational rules for generating UI. For the underlying philosophy, see [DESIGN_LANGUAGE.md](./DESIGN_LANGUAGE.md).

> **Ink & Lime ([ADR-085](../adr/ADR-085-ink-and-lime-brand-replaces-botanical-clinical.md)) overrides every colour, font and elevation rule below.**
> Canvas #f7f8fa · white cards `card-surface` (28px, soft shadow, no border) · ink #0e0e0e · lime #cdf21e
> (only hue) · Inter · icon tiles `icon-tile` (ink, lime glyph) · rows in `inset-group` / `inset-row` ·
> pills `pill-lime` / `pill-neutral` / `pill-soft` · bars `progress-track` · hero figures `text-hero`.
> Sports are told by icon, never colour. Match `docs/design/reference/ink-and-lime/`. Mentions of Forest,
> Snow, leaf green, Lime Pulse, Syne, IBM Plex or JetBrains Mono below are historical.

## Brand identity

SHARPIT is an Athlete State Intelligence system — not a fitness tracker, not a dashboard. It is a clinically precise instrument that models an athlete's physiological state to improve decision quality over time.

The design must evoke: high-precision chronometry, clinical EEG monitoring, professional measurement instruments. NEVER a SaaS look, an analytics dashboard, or a mainstream fitness app.

## Immutable principles

1. **Revelation > Decoration** — Every pixel must justify its presence through an informational function. No decorative gradients, no shadows, no colored badges without semantic meaning.

2. **Earned density** — Information density is high where the athlete makes decisions (snapshot, verdict), airy where they read explanations (rationale, context).

3. **Restraint = Trust** — Color is rare and meaningful. Green appears only for "OK/Go", orange for "Caution/Threshold", red for "Risk/Stop". No color for "the look".

4. **Layout = Causal argument** — Visual order follows the decision chain: State → Evidence → Recommendation → Projection → Limit → Confidence.

5. **Owned uncertainty** — No false precision. Uncertain values are displayed with confidence indicators (transparency, suffixes, annotations), never rounded to the nearest integer to look "clean".

6. **Instrument, not screen** — The interface is a reading tool, not a dashboard. Elements should evoke dials, reading grids, technical annotations — not floating cards.

## Design tokens (Tailwind v4)

### Colors

Brand primitives live in `src/lib/brand-tokens.ts` (hex) and `src/app/globals.css` (oklch).

- Canvas light: Snow White `oklch(0.99 0.007 106.5)` / `#fcfcf7`
- Canvas dark: Forest Depths `oklch(0.315 0.073 139)` / `#1c3a13`
- Primary light: vivid leaf green `oklch(0.48 0.13 142)` — interactive (not Forest ink)
- Primary dark: Lime Pulse `oklch(0.936 0.13 126.6)` — chromatic punch on dark
- Ink / foreground light: Forest Depths `#1c3a13`
- Highlight: Lime Pulse `#d3fa99` — nav active, badges, icon wells (`bg-highlight`, utility `icon-well`); keep vivid
- Surfaces / signals: lean into Lime hue family (~120–142) for continuity — Warm Stone slight lime cast, recovery/tempo/caution green-gold, not cool sage or brown tan
- Ink band: Forest on light / Lime on dark — empty states & hub callouts (`surface-ink`, `page-bleed-ink`, component `InkEmptyState` / `PageBleed`)
- Page bleed: shells set `--page-gutter`; use `page-bleed` / `PageBleed` / `InkEmptyState bleed` for edge-to-edge bands
- App chrome: one floating bottom tab bar on every viewport (`BottomNav`); reading column `max-w-3xl` centered (`PAGE_CONTENT_MAX_CLASS`). No desktop sidebar.
- Muted surface: Warm Stone `#f0f1e8` (`analysis-panel-alt`)
- Done / success washes: use `STATUS_SURFACE` (`src/lib/presentation/coaching/status-surface.ts`) — primary tokens, never raw `emerald-*`
- Status tiers (same file): `ADEQUATE_TONE` (eucalyptus), `CAUTION_TONE`, `ELEVATED_TONE` (vo2), `RISK_TONE` — never raw Tailwind amber/blue/red for status
- Empty / known-nothing: `InkEmptyState` / `surface-ink` / `page-bleed-ink` — not plain muted paragraphs
- Sport identity colors (`src/lib/activity/sport-identity.ts`): RUN orange · BIKE emerald · SWIM sky · STRENGTH rose · TRIATHLON teal — one hue each; success/done must not reuse them; never Lime Pulse for sport identity
- Activity detail session content (coach narrative, hero metrics, map route, section accents) uses sport identity tokens (`SPORT_IDENTITY_PANEL` / `TEXT` / `HEX`) — not brand primary / `analysis-panel-alt` green wash; global nav stays Lime Pulse
- Brand name: « SharpIt » in every athlete-facing string (titles, copy, metadata, manifest) — never « SHARPIT » in capitals.
- App icons / favicons / brand mark: the iOS app icon's mark (six dots on a hexagon, green gradient, on a white-to-grey tile) — one geometry and one SVG builder in `@sharpit/app/lib/brand/brand-icon.ts` (`brandIconSvg`, used by `BrandIconCanvas`, the splash route and `yarn icons:pwa`, which regenerates the theme-adaptive favicon SVG (web and hub), the PWA `any` and `maskable` (80% safe zone) PNGs and every `favicon.ico`, hub included). Inline, `BrandMark` (`@sharpit/ui`) on a `brand-tile` (dark tile under `.dark`) — never the old activity pulse, never legacy emerald `#059669`
- Secondary text: Pewter `#666666`
- Surface elevation: luminosity steps + borders, **NOT shadows**; plates = `analysis-panel` / `analysis-panel-alt`
- Semantic signals (DATA ONLY — unchanged roles):
  - `--signal-recovery`: Eucalyptus family (also ADEQUATE status tier)
  - `--signal-base`: Forest / lime (theme-dependent)
  - `--signal-tempo`: Olive Gold
  - `--signal-threshold`: gold
  - `--signal-vo2`: orange (also ELEVATED status tier)
  - `--signal-neutral`: pewter / frosted
  - `--signal-caution`: amber
  - `--signal-risk`: earth red

### Typography

- Heading / page title: utility `text-page-title` — Syne, weight 600, 1.5rem, tracking ≈ -0.02em
- Verdict / display: utility `text-verdict` — Syne, weight 600, 1.25–1.55rem, tight tracking
- Section title: utility `text-section-title` — Syne, weight 600, 1.125rem
- Card title: utility `text-card-title` — Syne, weight 500, 1rem
- Body: `font-family: var(--font-sans)` (IBM Plex Sans), weight 400-500
- Data: utilities `text-data` / `text-instrument` — JetBrains Mono, tabular-nums
- Labels: utility `text-label` — 0.6875rem, weight 600, letter-spacing 0.14em, uppercase
- Do **not** use Inter or whisper-light 300-weight display faces — SHARPIT titles stay authoritative (Syne 500–600)

### Spacing

- Dense (data, metrics): 12px-16px
- Standard (cards, sections): 16px-24px
- Airy (explanations, rationale): 32px-48px
- Base unit: 8px (comfortable density; never uniform `p-6` everywhere)

### Borders & radius

- Prefer surface luminosity for hierarchy; borders at low opacity when needed
- `--radius: 1rem` (16px cards) — instrument, not CPG pill
- Buttons: default = ink (`bg-foreground`) Seed CTA; `accent` = leaf/Lime interactive; `highlight` = Lime Pulse badge CTA
- Buttons stay instrument `rounded-lg`, **not** `rounded-full` / 1000px pills
- Button chrome stays dense at every viewport (`sm` 32px, default 36px). The 44px tap target is `button-hit` on coarse pointers, not a taller visual.
- Nav pills / bottom nav active = Lime (`bg-highlight`)
- Badges/tags may use full pill (`rounded-4xl`) including `variant="highlight"`

### Shadows

- **FORBIDDEN** in both themes. Hierarchy via contrast, type weight, and space only.
- Overlays (select, menu, toast, sheet, chart tooltips): `shadow-none` + `ring-1` / border — never drop-shadow elevation.
- No decorative gradients; flat color fields only.

### Forms

- Inputs / textareas: `rounded-md` (Seed 8px), transparent fill, `shadow-none`
- Default button = ink CTA (`bg-foreground`); links stay `text-primary`

## Component patterns

### Metric Card

```
┌─────────────────────────────┐
│ SLEEP            [●] 50%    │  ← Uppercase label left, value right
│                             │
│ 50% out of 100              │  ← Contextual subtitle
│ ████████████░░░░░░░░░░░░    │  ← Signal bar (no visible gray track)
│                             │
│ Physiological reading →     │  ← Discreet link, not a button
└─────────────────────────────┘
```

- NO visible card background (use surface difference)
- NO border unless required for separation
- NO "see more" button — the link lives in the reading flow
- The signal bar uses the semantic color, not a rainbow gradient

### Daily snapshot (Verdict)

```
┌─────────────────────────────────────────┐
│ TONIGHT                                 │
│ Rest day — recharge for tomorrow        │  ← Heading title, calm
│                                         │
│ Tonight — Bedtime around 23:22 to       │
│ recover from the day                    │  ← Body explanation, no card
│                                         │
│ TODAY'S POSITION                        │
│ ████████████████░░░░  recovery          │  ← Bar with inline annotation
│         toward high intensity           │
└─────────────────────────────────────────┘
```

- The verdict is the visual hero
- Secondary data is grouped but not boxed into cards

### Analysis Panel

- Use `analysis-panel` or `analysis-panel-alt`
- Subtle background grid (18px) evoking graph paper
- Data aligned on an invisible grid
- Margin annotations, "lab note" style

### Confidence indicator

- Displayed next to every inferred value
- Format: value ± uncertainty, or value (confidence level)
- Visual: partial transparency, no colored badge

## Motion, enter/exit & optimistic coupling

See `DESIGN_LANGUAGE.md` §9 and [ADR-028](../adr/ADR-028-animation-technology-and-press-feedback.md). Instant mutation rules: [`INSTANT_UX_ARCHITECTURE.md`](../INSTANT_UX_ARCHITECTURE.md).

**Technology ladder (simplest capable tool):**

1. **CSS** — default for hover, focus, active/press, opacity, transform, color, border, simple transitions
2. **Motion** — mount/unmount, exit, layout, gestures, springs, React state-driven transitions only
3. **GSAP** — not in tree; add only for timelines, multi-element choreography, scroll-driven or immersive animation

Never import Motion or GSAP when CSS delivers equivalent quality.

**Enter / exit primitives** (use these; do not invent durations):

| Pattern           | Component                           |
| ----------------- | ----------------------------------- |
| Mount + exit      | `FadePresence`                      |
| One-shot fade     | `FadeIn`                            |
| Expand / collapse | `MotionExpand`                      |
| List stagger      | `StaggerList`                       |
| Dialog morph      | `MorphPopover`                      |
| Label swap        | `ActionSwap` / `ActionSwapRollText` |

Variants: `fadeVariants`, `collapseVariants`, `staggerContainer` from `@/lib/motion/variants`. Exit ≤ 80% enter duration.

**Press feedback presets** (`motionTokens.scale.press*`, `--press-scale-*` in globals.css):

| Preset       | Scale  | Utility / use                      |
| ------------ | ------ | ---------------------------------- |
| Micro        | 0.95   | Compact icon controls              |
| Small        | 0.96   | `pressable`, `chip-surface`        |
| Large button | 0.98   | Wide CTAs                          |
| Surface      | 0.988  | `pressable-lg`, `chip-surface-lg`  |
| Minimal      | none   | High-frequency controls — no scale |
| Gesture      | spring | Motion `whileTap` + `springs.*`    |

Never blanket `scale(0.97)` on all interactives. Justify any deviation from a preset.

**Modal / sheet actions (SAFE mutations):**

```
confirm → optimistic cache patch → close + exit anim → mutate in background → reconcile / rollback
```

- `mutate()` not `await mutateAsync()` before close
- `listOptimistic()` or `setQueryData` in `onMutate`
- No full-dialog save spinner on reversible writes
- Blocking spinner only for BLOCKING class (auth, OAuth, payment, missing preview)

## Anti-patterns (FORBIDDEN)

- ❌ Cards with floating shadows (any theme)
- ❌ Decorative gradients (except thin semantic signal bars)
- ❌ Lime Pulse on large solid backgrounds or body text (washes `bg-highlight/35` ok)
- ❌ Muting Lime Pulse to match earthy tones — adapt the rest toward lime instead
- ❌ Pure white `#ffffff` instead of Snow White
- ❌ Colored badges without functional meaning
- ❌ Generic "See more" / "Understand" buttons
- ❌ Uniform padding on all elements
- ❌ Bold typography for all values
- ❌ Classic yellow/red banner alerts (Bootstrap style)
- ❌ Icons without labels in dense zones
- ❌ "AI" mentioned anywhere in the interface
- ❌ Scores rounded or simplified to look "pretty"
- ❌ CPG pill buttons (1000px radius) on primary actions — keep instrument `rounded-lg`
- ❌ Raw Tailwind status colors (`emerald-*`, `blue-*`, `amber-*`, `red-*`) for done / caution / risk — use `STATUS_SURFACE` / `ADEQUATE_TONE` / `CAUTION_TONE` / `ELEVATED_TONE` / `RISK_TONE`
- ❌ Legacy `bg-card` / `rounded-2xl border` SaaS plates — use `analysis-panel`
- ❌ Plain muted empty paragraphs on main routes — use `InkEmptyState`
- ❌ **Route-hop to open a modal** — `Link` / `router.push` to another route whose only job is to read `?create=` / `?adapt=` / `?modal=` and open a dialog already importable on the current surface. Open in place. Query deep-links are for **cross-destination** entry only (Today → Plan semaine). Example fixed: Plan hub « Coacher mon objectif » opens Macro / Generator / Adapter locally.

## Target feeling

Understood · Informed · Calm · Respected · Certain
Never: tracked, overwhelmed, anxious, infantilized

## Visual references

- Botanical-clinical restraint (Seed / Aesop apothecary calm) — adapted to an athlete instrument
- Precision chronometers (Tag Heuer, Omega)
- EEG/clinical monitoring interfaces (Natus, Nihon Kohden)
- Aviation flight decks (EFIS, PFD)
- Scientific measurement instruments (oscilloscopes, spectrometers)
- NEVER: Strava, Whoop, Garmin Connect, Fitbit, Apple Fitness
- NEVER: CPG supplement marketing layouts (promo banners, product grids, sale stickers)
