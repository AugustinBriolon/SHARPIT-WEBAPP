# Design rules

Read this before touching any UI. Each line is a decision, not a taste: a draft that breaks one
is not done. On the public pages (`apps/hub`) these rules win over older guidance in this folder.

**The landing is the one exception.** Its home page follows [`LANDING_STYLE.md`](./LANDING_STYLE.md)
(ADR-147), which allows what is banned here: a gradient behind the hero, headings at weight 600,
pinned sections, parallax and text revealed by the scroll. Everything else on the web keeps to
this file.

## Never

- No gradients, no glow.
- No icons in rounded boxes.
- No all caps, no eyebrow labels above headings.
- No nested cards, no decorative pills.
- No bold. Regular (400) and medium (500) only.
- No numbered lists as decoration (01, 02, 03).
- No pinned sections, no parallax, no text revealed by scrubbing the scroll.
- No section that is only text: show the product, as a widget or a diagram, and say one sentence.

## Always

- Sentence case everywhere.
- Semantic tokens (`background`, `card`, `foreground`, `muted-foreground`, `border`, `accent`),
  never a hex or oklch value in a component.
- Surfaces stay neutral. The accent shows only on what is active, selected or changed.
- Shadows only on things that float (menus, dialogs, toasts).
- Interface feedback (hover, press, open, close) under 300 ms, exits faster than entries, no
  bounce. Buttons press to 0.97. Keyboard focus moves instantly; only the pointer gets a
  transition.
- Storytelling motion (a widget assembling, a diagram drawing, a count running up) may take up to
  a second. It plays once as the widget enters the view, shows something the product does, and
  stands still under Reduce Motion.
- One type scale, two weights.

## Before saying done

- Look at it: 390 px wide, dark mode, and the whole page by keyboard.
- Then cut: the subtitle that repeats the heading, the badge nobody asked for, the second shadow,
  the icon beside every label.
