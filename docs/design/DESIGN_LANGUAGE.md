# SHARPIT Design Language

> A Human Performance Intelligence System demands a visual identity that matches its ambition. This document defines the design language — the permanent principles that govern every pixel, every transition, every typographic choice. It is not a style guide. It is a manifesto expressed in form.

---

## 1. Design Philosophy

SHARPIT is not a fitness tracker. It is not a dashboard. It is not an AI chatbot with a pretty interface.

It is a **precision instrument** — the cardiograph of the athlete's physiological state. The design must communicate this. Every element on screen should feel like it was placed there because it earns its position, because it serves the athlete's understanding, because removing it would leave the athlete less informed.

The mental model for every design decision:

> _What does a Leica camera, a Breitling chronograph, and a clinical EEG readout have in common?_
>
> They are instruments. They do not perform. They reveal.

This is the spirit of SHARPIT's design.

**Three governing constraints:**

1. **Revelation over decoration** — Every element reveals something. Nothing is purely decorative.
2. **Earned density** — Information density is high, but never chaotic. Density earns respect when structure is impeccable.
3. **Temporal permanence** — The interface must look exactly as sophisticated in five years as it does today. No trends. No moments.

---

## 2. Emotional Goals

The athlete opening SHARPIT should feel:

| Feeling                                                  | Not                                       |
| -------------------------------------------------------- | ----------------------------------------- |
| **Understood** — the system knows their physiology       | Tracked — as if being surveilled          |
| **Informed** — confident in the decision before them     | Overwhelmed — drowning in numbers         |
| **Calm** — the complexity has been resolved for them     | Anxious — confronted with raw uncertainty |
| **Respected** — the interface treats them as intelligent | Patronized — dumbed down, gamified        |
| **Certain** — the recommendation is clear and earned     | Confused — ambiguous or hedged            |

These are not aspirational. They are functional requirements. If an interface element triggers the wrong column, it must be redesigned.

---

## 3. Visual Principles

### 3.1 Signal over Noise

Every element on screen competes for attention. SHARPIT resolves this competition strictly: the primary signal — the answer to the athlete's question — occupies the dominant position with the greatest visual weight. Supporting evidence recedes. Metadata is nearly invisible until needed.

This is not minimalism for aesthetic reasons. It is information hierarchy enforced by design.

### 3.2 Structure as Intelligence

SHARPIT's complexity is managed through structure, not simplification. The system does not hide hard truths — it organizes them. A well-structured interface communicates sophistication. A sparse interface communicates emptiness.

The difference between structure and clutter is a single constraint: **every element must have an answer to "why am I here?"**

### 3.3 Restraint as Trust

Color, animation, and emphasis are reserved. A risk signal means something is wrong. A primary (leaf) signal means capacity is available. Caution means threshold. These carry meaning because they are not used casually. Casual use of semantic color destroys its meaning.

The interface never celebrates itself. It does not pulse, bounce, or sparkle. When something needs attention, it gets it precisely — not dramatically.

### 3.4 Typographic Authority

Text carries the intelligence. The quality of the typography determines whether SHARPIT reads as scientific or amateur. Headings must command. Body text must be invisible in the best sense — the reader absorbs the content without noticing the type. Labels must be precise without being mechanical.

### 3.5 Causal Narrative

The visual layout follows the logic of explanation. Each block flows causally from the one above it. The athlete reads top to bottom as if reading an argument: decision → evidence → recommendation → projection → limiter → confidence. The layout structure is the argument structure.

---

## 4. Typography Hierarchy

### 4.1 Type Stack

**Display / Verdict** — utility `text-verdict` (`font-heading` / Syne)

- Role: the single most important signal on any screen
- Usage: Today hero headline, physio drill-down heroes, coach narrative headlines
- Treatment: weight 600, 1.25rem (1.55rem from `sm`), tight tracking; rarely used

**Page title** — utility `text-page-title` (`font-heading` / Syne)

- Role: the one page-level identity
- Usage: sticky headers, settings / training / corps hubs
- Treatment: weight 600, 1.5rem (`text-2xl`), tight tracking
- Markup: exactly one `<h1>` per page

**Section title** — utility `text-section-title` (`font-heading` / Syne)

- Role: named blocks within a page
- Usage: coach-memory blocks, profile subsections, panel section heads
- Treatment: weight 600, 1.125rem, tight tracking
- Markup: `<h2>` (or `<h3>` for nested subsections)
- Note: uppercase list headers (e.g. goals « Courses à venir ») stay on `text-label`, not this utility

**Card / panel title** — utility `text-card-title` (`font-heading` / Syne)

- Role: titled cards and modal panels
- Usage: `CardTitle`, session panel titles
- Treatment: weight 500, 1rem

**Body** — `font-sans` (IBM Plex Sans)

- Role: explanatory text, evidence, reasoning
- Usage: everything the athlete reads to understand why
- Treatment: 14–16px base, regular weight; invisible in the best sense

**Label** — utility `text-label` (same sans, reduced and spaced)

- Role: metadata, secondary classification, dimension names, page eyebrows
- Usage: section labels, signal labels, sticky header eyebrows
- Treatment: **always** `text-label` — 0.6875rem, weight **600**, letter-spacing 0.14em, uppercase, muted-foreground. Do not reinvent with `text-[11px] … uppercase`.

**Data / Numeric** — utilities `text-data` / `text-instrument`

- Role: scores, indices, percentages, time values
- Usage: readiness scores, fatigue indices, confidence percentages
- Treatment: tabular-nums always; never proportional figures in data contexts

### 4.2 Scale (CSS utilities)

```
text-verdict:       1.25rem → 1.55rem (sm) — font-heading, weight 600
text-page-title:    1.5rem                 — font-heading, weight 600
text-section-title: 1.125rem               — font-heading, weight 600
text-card-title:    1rem                   — font-heading, weight 500
Body primary:       0.875rem               — sans, regular (14px)
Body secondary:     0.8125rem              — sans, regular (13px)
text-label:         0.6875rem              — 11px, uppercase, tracked 0.14em, weight 600
text-meta:          0.75rem                — 12px, size + leading only (caption / meta tier)
```

### 4.3 Typographic Rules

- **Never set body text below 13px.** Below this threshold, precision reads as anxiety.
- **`text-label` is not a size.** It also forces uppercase, weight 600 and the muted colour, so it classifies — it must never be reached for merely to shrink prose. Small readable text takes `text-meta`; an arbitrary `text-[10px]` is neither and is prohibited.
- **Never use italic for emphasis in data contexts.** Use weight instead.
- **Uppercase is reserved for labels.** Never use all-caps for body text or headings.
- **Tracking (letter-spacing) on body text is always 0.** Only labels and uppercase elements receive tracked spacing.
- **Verdicts and hero text always left-aligned.** Center alignment is only for empty states and loading placeholders.
- **`font-heading` (Syne) is the title voice** for `text-page-title`, `text-section-title`, `text-card-title`, and `text-verdict` (+ brand/logo / system chrome). Body and labels stay on sans.
- **One `<h1>` per page.** Sections use `<h2>`; nested panels use `<h3>`.
- **Uppercase section headers** (goals lists, etc.) use `text-label` on `<h2>`, not `text-section-title`.

---

## 5. Spacing Philosophy

### 5.1 The 4-Point Grid

All spacing derives from multiples of 4px. This is not a suggestion — it is a constraint. Arbitrary spacing values (`7px`, `13px`, `22px`) are prohibited. When in doubt, the nearest multiple of 4 is always correct.

```
4px   — micro (inline gap between related atoms)
8px   — small (gap within a component)
12px  — compact (tight internal padding)
16px  — base (standard component padding)
20px  — comfortable (card internal spacing)
24px  — section (between grouped elements)
32px  — block (between major blocks)
48px  — page (between page-level sections)
```

### 5.2 Padding Asymmetry

Cards use more vertical padding than horizontal. The text must breathe vertically — this communicates quality. Tight vertical spacing reads as cheap.

Standard card: `px-5 py-5` minimum, `px-6 py-7` for primary blocks.

### 5.3 Density is Earned

SHARPIT surfaces are information-dense by necessity, not by default. Every piece of information on screen must earn its presence. The question before adding any element: _does the athlete make a better decision with this visible?_ If the answer requires qualification, the element belongs in a secondary tier or an expand interaction.

High density reads as intelligent when structure is impeccable. High density without structure reads as overwhelm.

---

## 6. Layout System

### 6.1 Single Column, Top-to-Bottom Narrative

SHARPIT's primary layout is a single column of stacked blocks. This is not a constraint of mobile design — it is a deliberate choice for any viewport. The causal narrative of the One Question Model requires linear reading. Multi-column layouts fragment this causality.

On larger viewports, the column widens to a maximum width, centered. The content remains linear.

### 6.2 Block Boundaries

Blocks are separated by `space-y-3` (12px). This is intentionally tight — the blocks are related, part of a continuous argument. They are not independent cards in a dashboard grid.

Each block uses the `analysis-panel` / `analysis-panel-alt` shell (`rounded-analysis` / `rounded-analysis-lg`). No shadows. Surface luminosity + border separation are the only elevation signals — never `bg-card` SaaS plates.

**Two chip tiers, spent by role.** A fill says « separate object »; stamping it on every block flattens the hierarchy it was meant to create. `chip-surface-lg` is consultable evidence the athlete opens (sleep, recovery, nutrition, Plan vivant); `chip-surface-quiet` keeps the hairline and drops the fill for context that only has to stay legible beside it (regularity). A skeleton always declares the same tier as the card it precedes, or the surface swaps on arrival (§9.4).

### 6.3 The Expand Pattern

Secondary information lives behind an expand interaction, never on initial load. The expand trigger is always below the primary content it expands. Expanded content slides in, contracted with `max-h` animation. The trigger label inverts on expand (`↓` becomes `↑`, or equivalent).

Never use tabs. Tabs imply equivalence between sections; SHARPIT's hierarchy is strictly causal, not equivalent.

### 6.4 No Grid Layouts for Content

Grid layouts are prohibited for content blocks. Two-column content layouts fragment the narrative and compete for reading order. The only exception: dimension signal badges within a reasoning block, where three items are shown simultaneously because they are genuinely parallel (recovery, fatigue, adaptation are sibling signals, not sequential ones).

---

## 7. Density Strategy

### 7.1 Three Tiers

**Tier 1 — Immediate** (always visible, no interaction required)

- The verdict and verdict label
- The hero action (verb + focus)
- The primary finding title
- The session objective

**Tier 2 — Available** (visible by default, but secondary)

- Finding evidence bullets (first finding)
- Dimension signal badges (recovery, fatigue, adaptation)
- Expected outcome projection
- Confidence level

**Tier 3 — On Demand** (expand required)

- Additional findings beyond the first
- Detailed rationale
- Supporting evidence (physiological detail)
- Raw model signals and scores

This tier discipline is non-negotiable. Any Tier 3 content on initial render is an information design failure.

### 7.2 Progressive Disclosure

Information reveals itself as the athlete's question deepens. The athlete who wants only the answer gets it in 3 seconds. The athlete who wants to understand the reasoning gets it in 10 seconds. The athlete who wants to verify the physiological model gets it in 30 seconds.

Never force the 3-second athlete to navigate past the 30-second content.

---

## 8. Component Philosophy

### 8.1 Every Component Answers a Question

Components in SHARPIT are not generic UI primitives repurposed for content. Each component exists to answer one specific athlete question:

| Component                 | Question Answered                        |
| ------------------------- | ---------------------------------------- |
| `NarrativeHeader`         | What should I do today?                  |
| `ReasoningBlock`          | Why?                                     |
| `SessionBlock`            | What session, and toward what objective? |
| `ExpectedOutcomeBlock`    | What will happen if I follow / deviate?  |
| `BottleneckBlock`         | What system is limiting me?              |
| `ConfidenceBlock`         | How certain is SHARPIT?                  |
| `SupportingEvidenceBlock` | Show me the physiological detail         |

A component that answers two questions must be split. A component that answers no clear question must be deleted.

### 8.2 Props are a Contract

Component props define the semantic contract between the data layer and the presentation layer. Props must be typed precisely — never `string` when the domain type is `OverallVerdict`. Never `any`. The component's visual behavior is fully determined by its props; no internal data fetching, no store reads, no business logic.

### 8.3 No Presentational State

Components hold only UI state (is a section expanded, is a tooltip visible). Business state (the athlete's verdict, the fatigue level) is always external. A component must be renderable in isolation with props alone — no context required for correctness.

### 8.4 Semantic Color, Not Arbitrary Color

All color in components derives from the Seed semantic system (see `src/lib/presentation/coaching/status-surface.ts`):

```typescript
primary / STATUS_SURFACE.done  →  positive, available, optimal, growth, done
ADEQUATE_TONE (signal-recovery) →  adequate, neutral-positive, maintaining, TRAIN_SMART
CAUTION_TONE (signal-caution)   →  caution, reduced, partial, plateau
ELEVATED_TONE (signal-vo2)      →  elevated concern, maladapting mid-tier
RISK_TONE (signal-risk)         →  risk, critical, overreaching
muted                           →  unavailable, insufficient data, metadata
```

Never use raw Tailwind `emerald-*` / `blue-*` / `amber-*` / `red-*` for status. Sport identity chips use distinct hues per discipline (see `src/lib/activity/sport-identity.ts`: RUN orange, BIKE emerald, SWIM sky, STRENGTH rose, TRIATHLON teal) — success/done must not.

A component must never introduce a color outside this system. If a new semantic state requires a new color, the color system is extended — not bypassed.

---

## 9. Motion Principles

### 9.1 Motion Communicates State Change

Animation exists only to communicate that something changed. It answers: what moved, what appeared, what collapsed? It does not decorate, celebrate, or entertain.

### 9.2 Duration and Easing

```
Micro (tooltip, badge):       150ms  ease-out
Standard (expand/collapse):   250ms  ease-in-out
Page transition:              300ms  ease-out
Skeleton → content:           200ms  ease-in
```

Nothing in SHARPIT exceeds 300ms. Longer durations feel slow and self-important. Below 100ms feels brittle.

### 9.3 Expand Pattern

Expand/collapse uses `max-height` + `opacity` in combination. Height alone is jarring; opacity alone is disorienting. Together they communicate folding — a natural physical metaphor.

```css
/* expand */
transition:
  max-height 250ms ease-in-out,
  opacity 200ms ease-in;

/* collapse */
transition:
  max-height 200ms ease-in-out,
  opacity 150ms ease-out;
```

Exit is faster than entrance (80% of enter duration). This respects the athlete's time.

### 9.4 Skeleton Loading

Skeletons match the exact layout of the content they precede — same dimensions, same border-radius, same positioning. A skeleton that does not match its content causes layout shift and breaks trust.

Skeleton color: `bg-muted`. Pulse animation: `animate-pulse`. No shimmer — shimmer is decorative.

### 9.5 Reduced Motion

All animations respect `prefers-reduced-motion`. When reduced motion is set:

- Duration drops to 0 (immediate)
- Transitions are still applied (avoid snap-to state)
- The state change still happens; only the animation is removed

### 9.6 Reveal Animations — a Named Exception to 9.2's Cap

§9.2's 300ms cap governs interface chrome: tooltips, expand/collapse, page transitions, skeletons. It does not extend to a **reveal** — a one-time animation of an already-complete, non-interactive dataset on its first appearance, communicating a fact the data already carries (a GPS track is a record of movement through time, not a static shape). [ADR-024](../adr/ADR-024-route-reveal-motion-exception.md) defines the category and its sole current instance, the route trace on `RouteMap`. It is not a general license — a slower badge, expand, or transition is still prohibited. A new candidate for this category needs its own argument, not a citation of this section.

### 9.7 Animation Technology — Simplest Capable Tool

Do not introduce an animation library by default. Use the simplest technology that produces the desired interaction with equivalent quality.

**CSS (default)** — hover, focus, active/press, opacity, transform, color, border, simple state transitions. Prefer `pressable` / `pressable-lg` utilities and token-backed custom properties before bespoke rules.

**Motion (`motion` package, already in tree)** — when animation is tightly coupled to application state or component lifecycle: mount/unmount, exit animations, layout transitions, gestures, springs, React state-driven transitions. Never use Motion when CSS alone achieves the same result.

**GSAP (not a dependency today)** — only for advanced choreography: timelines, multi-element sequences, precise synchronization, complex interaction-driven animation, scroll-driven animation, SVG/WebGL/immersive experiences. Requires explicit justification; never add by default.

See [ADR-028](../adr/ADR-028-animation-technology-and-press-feedback.md).

### 9.8 Press Feedback — Semantic Presets, Not Universal Scale

Never apply a single `scale()` to every interactive component. Calibrate press feedback by dimensions, surface area, interaction frequency, hierarchy, physicality, and action importance. Large surfaces compress less than small controls; high-frequency controls use minimal or no scale.

| Preset         | Scale  | Use                                                          |
| -------------- | ------ | ------------------------------------------------------------ |
| Micro control  | 0.95   | Icon buttons, compact toggles                                |
| Small button   | 0.96   | Default compact controls (`pressable`, `chip-surface`)       |
| Large button   | 0.98   | Wide CTAs                                                    |
| Large surface  | 0.988  | Clickable cards and rows (`pressable-lg`, `chip-surface-lg`) |
| High-frequency | none   | Tabs, scrubbers — color/opacity only                         |
| Gesture-driven | spring | Motion `whileTap` + `springs.*`, not CSS `:active` scale     |

Floor: never below **0.95** on `:active` scale. Deviations from a preset require a comment naming the override and why. Canonical values: `motionTokens.scale.press*` in `src/lib/motion/tokens.ts`, mirrored as `--press-scale-*` in `src/app/globals.css`.

### 9.9 Enter / Exit Motion — Shared Primitives Only

Mount, unmount, and exit animations are state-bound — use Motion via shared components in `apps/web/src/components/motion/`, with variants from `apps/web/src/client/motion/variants.ts` and durations from `motionTokens` (`apps/web/src/client/motion/tokens.ts`). Do not add raw `AnimatePresence` with bespoke timings.

| Pattern           | Component                             | Use                                                 |
| ----------------- | ------------------------------------- | --------------------------------------------------- |
| Mount + exit      | `FadePresence`                        | Conditional panels, hub state swaps                 |
| Expand / collapse | `MotionExpand`                        | Sections (grid 0fr→1fr + opacity, §9.3)             |
| Dialog / morph    | `dialogTransition` / dialog sheet CSS | `springs.gentle` / bottom sheet on mobile (no Vaul) |
| List / action     | Prefer tokens + presets               | Stagger / ActionSwap when a surface needs them      |

Exit duration ≤ 80% of enter. `initial={false}` when replay would jar. Reduced motion: instant state change, no animation (§9.5). Reveal animations remain a separate category — [ADR-024](../adr/ADR-024-route-reveal-motion-exception.md).

### 9.10 Instant Feedback — Optimistic Apply Before Exit

Motion communicates dismissal; it must not gate perceived latency. For every **SAFE** / **SAFE_WITH_ROLLBACK** mutation opened from a modal, sheet, drawer, or inline action:

1. Patch cache optimistically (`listOptimistic` / `setQueryData` in `onMutate`).
2. Close the surface on confirm — `mutate()`, not `await mutateAsync()`, on SAFE writes.
3. Play exit animation while the request completes in background.
4. Roll back cache + toast on error.

No save spinner on reversible dialog submits. Blocking wait is reserved for BLOCKING class interactions — see [`INSTANT_UX_ARCHITECTURE.md`](../INSTANT_UX_ARCHITECTURE.md) §5. Full rules: [ADR-028](../adr/ADR-028-animation-technology-and-press-feedback.md) §8.

---

## 10. Color Philosophy

### 10.1 The Foundation

SHARPIT is **dual-theme**: light canvas for daytime reading, Forest Depths canvas for low-light training contexts. Both modes share one botanical-clinical brand language and the same semantic signal system.

**Brand primitives** (see `src/lib/brand-tokens.ts`):

```
Forest Depths  #1c3a13  — primary brand ink, filled CTAs, dark sections, light-mode text
Lime Pulse     #d3fa99  — functional punctuation (badges, nav active; keep vivid)
Sage Moss      #6f7a52  — muted supporting green (leaf-adjacent)
Olive Gold     #a8b05c  — soft yellow-green / tempo toward lime
Eucalyptus     #5f8a6e  — cooler recovery green (lime orbit)
Snow White     #fcfcf7  — page canvas (never pure #ffffff)
Warm Stone     #f0f1e8  — secondary surface (slight lime cast)
Frosted Glass  #c4c7c4  — muted neutral / frosted overlays
Ash            #b3b3b3  — disabled / low-emphasis borders
Pewter         #666666  — secondary body text
```

**Light mode surfaces:**

```
Background / card: Snow White
Muted / secondary: Warm Stone
Foreground (ink): Forest Depths
Primary (interactive): vivid leaf green — links, icons, CTAs, selected states
Muted foreground: Pewter
Highlight: Lime Pulse (badges, nav active, icon wells — keep vivid)
```

**Dark mode surfaces:**

```
Background: deep forest (darker than product-band Forest for density)
Card: lifted forest surface
Foreground: Snow White
Primary (interactive): Lime Pulse — full chromatic punch
Highlight: Lime Pulse (badges / icon wells)
```

Note: Forest Depths is **ink and dark canvas**, not the interactive accent. Using it as `--primary` collapses every `text-primary` / `bg-primary/10` into mud. Surfaces and `--signal-*` hues lean into the Lime Pulse family (hue ~120–142) so the rest of the UI continues the highlight — do not mute Lime to “match” muted earth tones.

Hierarchy comes from **color contrast and spatial separation** — never from drop shadows or decorative gradients.

### 10.2 Semantic Color Application

Semantic colors (`--signal-*`) appear on text, borders, dots, and thin signal bars. They never appear as large solid fills. Prefer a flat low-opacity tint (`bg-signal-caution/10`) over multi-stop gradients.

Brand greens and semantic signal colors are separate systems: brand expresses identity; signals express physiological meaning (recovery, caution, risk, effort zones).

### 10.3 Color Restraint

The palette must be exhausted before any new color is introduced. If a design decision requires a color outside the brand + semantic systems, it is a signal that the component needs redesign, not that the palette needs expansion.

**Prohibited:**

- Purple or violet (no semantic meaning in the domain)
- Saturated blues outside Eucalyptus / recovery signal (too reminiscent of consumer health apps)
- Lime Pulse as a large decorative surface or body text color (punctuation only; washes may use `bg-highlight/35`)
- Muting Lime Pulse to chase earthy dashboard tones — adapt signals/surfaces toward lime instead
- Pure white `#ffffff` (always Snow White)
- Drop shadows / elevation shadows (flat system)
- Decorative gradients (flat color fields only)

### 10.4 Contrast

All text meets WCAG AA minimum (4.5:1 for normal text, 3:1 for large text). Muted text — by definition lower contrast — is reserved for metadata and secondary labels only. Never for primary content.

---

## 11. Iconography Philosophy

### 11.1 No Decorative Icons

Icons exist to communicate signal direction, state category, or action type. They are never decorative. An icon without semantic purpose is noise.

### 11.2 Arrow System

Directional arrows are the most important icon in SHARPIT. They communicate trajectory — the most important temporal dimension of athletic performance.

```
↗  — up, improving, recovering
→  — stable, neutral, maintaining
↘  — down, declining, accumulating risk
↑↑ — critical accumulation, accelerating risk
…  — pending, building baseline model
—  — unavailable, insufficient data
```

These arrows are Unicode characters, not SVG icons. This ensures they render at any size with typographic fidelity. They must always appear with sufficient visual weight to be readable — never smaller than 12px effective size.

### 11.3 Dimension Indicators

Colored dots (`h-2.5 w-2.5 rounded-full`) communicate state category without requiring reading. They are always paired with a text label — never used alone. The dot precedes the label.

**Exception — data availability dot** (date strip and calendar, ADR-033): a `size-1.5` dot under a day marks that it has data. Repeating a label on every day would crowd the strip, so the pairing moves to the accessible name of each day control and to a visible legend in the calendar. This exception covers only this dot. It is not a general license for unlabeled state dots.

### 11.4 Confidence Bars

The confidence tier visualization uses three stacked bars (`h-2 w-1.5 rounded-full`). Filled bars at `opacity-90`, empty bars at `opacity-20`. This communicates a scale without requiring a number. It is the only instance of a non-text, non-arrow visual metaphor in the interface.

---

## 12. Illustration Philosophy

### 12.1 No Illustrations

SHARPIT contains no illustrations, hero images, or decorative graphics.

This is a hard constraint, not a stylistic preference.

Illustrations communicate approachability, playfulness, or consumer-product accessibility. None of these are SHARPIT values. They contradict the precision instrument identity. A Breitling chronograph does not have charming illustrations on its face.

### 12.2 The Exception: Data Visualization

When physiological data is complex enough to require visualization — time series, distribution curves, load-adaptation ratios — the visualization is the illustration. It is precise, data-exact, and formatted with the typographic system. It earns its presence because it communicates something that text cannot.

Future data visualizations must follow these constraints:

- No decorative chart chrome (gridlines are functional; backgrounds are not)
- Semantic color only — no arbitrary palette
- No 3D effects
- Labeled axes, always
- Accessible without color (line style or pattern differentiation)

---

## 13. Empty State Philosophy

### 13.1 Empty States are Onboarding Moments

An empty state in SHARPIT occurs when the athlete does not yet have sufficient data for a reliable physiological assessment. This is not a failure state — it is an expected early stage of the system building its digital twin.

The empty state communicates:

1. **What is missing** — specifically, which data or how much is needed
2. **Why it matters** — what the athlete will unlock
3. **What to do** — one clear next action

Never communicate emptiness as an error. Never use red or warning colors in empty states. Neutral, informational tone only.

### 13.2 Empty State Structure

```
[Neutral icon or simple graphic: outline only, no fill]
[Primary message: what is being built]
[Secondary message: what the athlete needs to do]
[Single CTA: one action, no alternatives]
```

The "icon or graphic" exception to the no-illustration rule: empty states may use a single, simple SVG outline — not an illustration — to reinforce the onboarding context. This outline must be abstract (not figurative), monochromatic, and no larger than 48×48px.

### 13.3 Skeleton vs. Empty State

A skeleton is shown when data is loading (known-unknown — the data exists but hasn't arrived). An empty state is shown when data does not exist (known-nothing — the system cannot yet make a determination). These two states must never be confused or collapsed into the same component.

---

## 14. How These Principles Influence Every Screen

### Today View — Morning Instrument

The Today View is the highest-priority screen. Every principle is expressed most completely here. The first viewport is a single **instrument plate**, not a metric inventory.

**Composition (causal column, non-negotiable):**

1. **Plate** (`TodayVerdictHero`) — one composition answering _what should I do with my state today?_
   - Soft semantic tint (flat `bg-*/12`, no decorative gradient) + status dot (§11.3)
   - Context label (`Ce matin` / posture) + **three confidence bars** (§11.4 — primary-tinted; only non-text visual metaphor in the plate header)
   - Verdict headline — Syne / `text-verdict`, colored by state, left-aligned, air around it
   - One action line (focus / session / rest) — body weight, not a second title
   - One limiter — mono, discreet (`Limité par · … →`) linking to the limiting-factor drill-down
   - Color whenever the verdict is not `INSUFFICIENT_DATA` (including recover / easy mornings)
   - `RECOVER` uses protective primary/sage — never alarm red (recovery is the right decision)
   - No metric card grid, no multi-color physio rail, no lateral % inset competing with the verdict
2. **Overnight signals** (`TodaySignalStrip`) — twin instrument cards (sleep + recovery): short-tick semicircle gauge, qualitative label, quiet baseline band. Adaptation and charge belong on Plan (block trajectory), not in the morning résumé.
3. **Session** (`TodayActionRow`) — chip-style session rows only; Frein column removed (lives on the plate).
4. **Trajectory** — headline + naked sparklines; sparkline titles are drill-downs (no nested panels / link row).

- **Why** is not a standing Today section: the plate limiter + strip already carry the “why”; the former `TodayWhyBlock` only restated the verdict and was removed.
- **ReasoningBlock** (drill-downs) demonstrates earned density: the primary finding is always visible; additional findings are behind an expand.
- **SessionBlock** demonstrates component-as-answer: exists only to answer "what session?" — if there is no session recommendation, the block does not render.
- **ExpectedOutcomeBlock** demonstrates restraint: the deviation risk only appears if it is `caution` or `warning`. A safe state produces no noise.
- **Confidence** lives in the plate header (bars + label), not as a second hero.

### Training View

One question: _what’s next that matters?_

1. **Plate** — race countdown as Syne verdict (`J-n · title`) or next structuring session; soft tint; no inset countdown card.
2. **Session / activity chips** — hairline rows with `→`; no PhysioRail in list heroes.
3. **Progression** — earned density: regularity detail and full progression live behind expand / `/training/progression`.

### Composition View (`/biology?tab=composition`)

One question: _where is my body today?_

1. **Plate** — weight as dominant reading + trajectory line; soft corps-tone tint (never shame red for normal deltas).
2. **Chips** — fat / muscle / visceral under the plate (not peer strip equal to weight).
3. **Why** — primary insight narrative; supporting behind expand.
4. **Metrics** — up to four priority chips; remainder in “Voir toutes les mesures”.
5. **Trends** — weight chart primary; other series behind expand; chart colors from `--signal-*` tokens.

### Physio drill-downs (`/today/sleep|recovery|adaptation|effort`)

Same Instrument column as Today. All four routes share one shell (`PhysioDrillDownHero` + chips + why/evidence) — do not fork four hero designs.

1. **Plate** — **date strip** (`TodayDateSelector`, [ADR-033](../adr/ADR-033-drill-down-date-strip-and-data-availability.md)) · soft tint · Syne verdict · one action/read line · score or duration as a mono instrument line (never PhysioRail, never a lateral inset %). Confidence bars sit **under** the date strip/subline (centered) — never absolute over the date controls.
   - **Header row:** month label + calendar icon (opens the calendar dialog) on the left; `Aujourd'hui` when away from today, and ‹ › day arrows from `sm`, on the right.
   - **Strip:** day cards on mobile (`rounded-2xl`, bordered `bg-card`, number over short weekday); from `sm`, quiet ghost cells (no border or fill, 44×56) in a centered `max-w-3xl` strip so only the selection carries weight. Edges fade to hint the scroll. Horizontal snap-scroll on every viewport, growing toward the past as the athlete scrolls (28-day chunks, fenced by the demo `minDate`). Selected day inverted (`bg-foreground text-background`); today outlined; the rest of the current week shown disabled. The selected day stays centered. Tapping it again opens the calendar. ←/→ step one day.
   - **Data availability dot:** `size-1.5` under the weekday (strip) or the number (calendar) — `bg-primary`, `bg-highlight` on the inverted selected day. Decorative: the day's accessible name carries « données disponibles » / « aucune donnée », and the calendar shows the legend « ● Données disponibles » (§11.3 pairing).
2. **Chips** — compact signal chips (`DrillDownStatsStrip`): **horizontal snap-scroll on mobile** · even grid row from `sm`. No parent panel. Confidence does **not** belong in the strip. Avoid 2×1 wrap leftovers.
3. **Why** — domain narrative bandeau (phrase + link Accueil / expand), not a second hero card.
4. **Evidence** — one primary chart or reading block visible; surfaces use iOS-like inset radius on mobile (`rounded-[1.25rem]`), analysis panel on desktop. Secondary detail densified or expandable — not hidden forever.

**Shell:** tighter stack (`space-y-3`), plate-first composition; floating tab bar + safe-area already owned by `AppShell`. Feels like a native instrument screen, not a browser card stack.

**Order (non-negotiable):** Plate → Chips → Why → Evidence.

### Nutrition drill-down (`/nutrition`)

Same plate as the physio drill-downs. Under it, in this order:

1. **Diet tag:** « Régime » label, the declared diet chips (`DietChipList` — the same chips as the journal), and a quiet « Modifier » link to `/journal?personnaliser=nutrition`. Hidden when no diet is declared.
2. **Lecture du coach** ([ADR-035](../adr/ADR-035-nutrition-coach-reading-not-an-engine.md)): an analysis panel with the verdict (one line, `text-lg` semibold, tone colour), 2–3 finding rows (job label over one or two sentences), then one « À faire » action on a muted inset. The tone maps to `primary` (on track), `signal-caution` (watch) and `signal-vo2` (off track). It never uses `signal-risk`: a meal is not a clinical risk, and the reading must not shame. States:
   - **Generating:** value micro-skeleton with « Le coach lit ta journée… ».
   - **Refreshing:** the previous reading plus « Mise à jour… ».
   - **Today:** one quiet line, « La lecture du coach arrive une fois la journée terminée », with a ghost « Voir la lecture d'hier » button.
   - **Unavailable:** one muted line, never an error colour.
3. Objectives, meals, then the macro trend.

### Future Profile Screen

The profile screen will surface the athlete's physiological history. The design principles require:

- Time series data expressed as functional data visualization, not decorative charts
- No comparisons to population averages (the system models the individual, not the population)
- Historical trends in the same semantic color system as the today view
- No gamification: no streaks, no badges, no achievement notifications

### Future Insights Screen

Insights will surface patterns the athlete may not have noticed. The design principles require:

- Each insight answers one question (the One Question Model extends beyond the today view)
- Insights are ordered by actionability, not recency
- An insight without a recommended action is metadata — it belongs in supporting evidence, not a primary insight card

### Settings / Configuration

Settings are a utility context, not a product context. The design principles apply with lower strictness:

- Standard form components, standard spacing
- The semantic color system still applies
- No emotional goals are relevant here — the athlete is configuring, not reading their assessment
- The typography system simplifies: label + body only, no display/verdict type

---

## Appendix: Anti-Patterns

These patterns must never appear in SHARPIT. They are listed because they are tempting, common, and contrary to the design language.

| Anti-pattern                                                                   | Why it's prohibited                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress rings / radial charts                                                 | Gamification. Communicates achievement, not physiology.                                                                                                                                                                                                                                                                                                          |
| Streak counters                                                                | Behavioral manipulation. Contradicts scientific integrity.                                                                                                                                                                                                                                                                                                       |
| Animated number counters                                                       | Decorative. The final number is what matters, not the animation.                                                                                                                                                                                                                                                                                                 |
| Large hero images or gradients                                                 | Consumerism. A precision instrument has no background photography.                                                                                                                                                                                                                                                                                               |
| Notification badges on tab icons                                               | Dashboard thinking. SHARPIT is not a notification center.                                                                                                                                                                                                                                                                                                        |
| Color gradients between two semantic colors                                    | Creates ambiguous meaning.                                                                                                                                                                                                                                                                                                                                       |
| "Great job!" or motivational micro-copy                                        | Patronizing. The athlete is intelligent; SHARPIT is informative, not encouraging.                                                                                                                                                                                                                                                                                |
| Card grid / masonry layouts                                                    | Fragments the causal narrative. The one-column layout is not negotiable.                                                                                                                                                                                                                                                                                         |
| A per-surface "simple"/"advanced" toggle, or one that hides a specific finding | Implies the athlete needs protection from their own data. The one sanctioned exception is the athlete-level reading density in [ADR-023](../adr/ADR-023-reading-density-expert-mode.md) — a single Essential/Expert preference for the whole app, gating vocabulary literacy, never a specific reading. Inventing a second toggle anywhere is this anti-pattern. |
| Pull-to-refresh with animated mascot                                           | Consumer fitness app DNA.                                                                                                                                                                                                                                                                                                                                        |
| Route-hop solely to open a modal                                               | Navigating to another route whose only job is to mount a dialog the current surface can host. Open in place; reserve query deep-links (`?generate=` / `?adapt=`) for cross-destination entry only.                                                                                                                                                               |

---

_This document is the authority on SHARPIT's visual identity. Individual implementation decisions must be traceable to the principles defined here. When a design decision requires deviation from these principles, the deviation must be documented and justified — not silently applied._
